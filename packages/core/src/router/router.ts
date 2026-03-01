// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/**
 * Router — the core orchestration engine.
 * Every query passes through this pipeline in under 50ms (excluding LLM latency).
 *
 * Pipeline:
 *   1. PII scan → force local if PII detected
 *   2. Token estimate → force local if > maxLocalTokens
 *   3. Complexity score → select tier (local / specialist / cloud)
 *   4. Budget check → downgrade to local if cap exceeded
 *   5. Execute on chosen provider
 *   6. Record cost
 *   7. Return RoutingDecision
 */

import { BudgetExceededError, ProviderUnavailableError } from "../exceptions.js";
import type {
  CompletionOptions,
  LLMResponse,
  LokaFlowConfig,
  Message,
  RouterProviders,
  RoutingDecision,
  RoutingReason,
  RoutingTier,
} from "../types.js";
import { BaseProvider } from "../providers/base.js";
import { TaskClassifier, scoreTier } from "./classifier.js";
import { PIIScanner } from "./piiScanner.js";
import { BudgetTracker } from "./budget.js";
import { appendFileSync, statSync, renameSync } from "fs";
import { SearchEngine } from "../search/engine.js";
import { MemoryManager } from "../memory/rag.js";

const LOG_FILE = "lokaflow-routing.log";
const LOG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function appendLog(content: string): void {
  try {
    try {
      if (statSync(LOG_FILE).size >= LOG_MAX_BYTES) {
        renameSync(LOG_FILE, `${LOG_FILE}.1`);
      }
    } catch {
      // file doesn't exist yet — that's fine
    }
    appendFileSync(LOG_FILE, content, "utf8");
  } catch {
    // silently fail if we can't write (permissions, read-only FS, etc.)
  }
}

export class Router {
  private readonly classifier: TaskClassifier;
  private readonly piiScanner: PIIScanner;
  private readonly budget: BudgetTracker;
  private readonly providers: RouterProviders;
  private readonly config: LokaFlowConfig;
  private readonly searchEngine?: SearchEngine;
  private readonly memoryManager?: MemoryManager;

  constructor(providers: RouterProviders, config: LokaFlowConfig) {
    this.providers = providers;
    this.config = config;
    this.classifier = new TaskClassifier(config);
    this.piiScanner = new PIIScanner();
    this.budget = new BudgetTracker(
      config.budget.dailyEur,
      config.budget.monthlyEur,
      config.budget.warnAtPercent,
    );
    if (config.search.enabled) {
      this.searchEngine = new SearchEngine(providers.local[0]!, config.search);
    }
    if (config.memory.enabled) {
      this.memoryManager = new MemoryManager();
    }
  }

  /**
   * Route a conversation and return the full RoutingDecision with response.
   */
  async route(_messages: Message[], options: CompletionOptions = {}): Promise<RoutingDecision> {
    const text = _messages.map((m) => m.content).join(" ");
    const trace: string[] = [];
    const timestamp = new Date().toISOString();
    trace.push(`[${timestamp}] ─── NEW ROUTING REQUEST ───`);

    trace.push(
      `config: local=[${this.providers.local.map((p) => p.name).join(",")}], specialist=${this.providers.specialist?.name ?? "none"
      }, cloud=${this.providers.cloud.name}`,
    );

    // ── Step 0: Memory recall (opt-in) ───────────────────────────────────────
    let messages: Message[] = _messages;
    if (this.memoryManager && this.config.memory.enabled) {
      try {
        const recalled = await this.memoryManager.recall(
          text,
          this.config.memory.sessionId,
          { topK: this.config.memory.topK },
        );
        if (recalled.length > 0) {
          messages = [...recalled, ..._messages];
          trace.push(`step 0: memory recalled (${recalled.length} context message(s))`);
        } else {
          trace.push(`step 0: memory empty — no recall`);
        }
      } catch {
        trace.push(`step 0: memory recall failed — proceeding without context`);
      }
    } else {
      trace.push(`step 0: memory disabled`);
    }

    // ── Step 1: PII scan ─────────────────────────────────────────────────────
    if (this.config.router.piiScan) {
      const pii = await this.piiScanner.scan(text);
      if (pii.containsPii) {
        trace.push(`step 1: PII detected, forcing local`);
        return this.execute(messages, "local", "pii_detected", 0.0, this.providers.local[0]!, options, trace);
      }
      trace.push(`step 1: PII scan clean`);
    } else {
      trace.push(`step 1: PII scan skipped (disabled)`);
    }

    // ── Step 2: Token estimate ────────────────────────────────────────────────
    const estimatedTokens = Math.round(text.split(/\s+/).filter(Boolean).length * 1.3);
    if (estimatedTokens > this.config.router.maxLocalTokens) {
      trace.push(
        `step 2: max tokens exceeded (${estimatedTokens} > ${this.config.router.maxLocalTokens}), forcing local context mode`,
      );
      return this.execute(messages, "local", "token_limit", 0.0, this.providers.local[0]!, options, trace);
    }
    trace.push(`step 2: token estimate (${estimatedTokens}) within bounds`);

    // ── Step 2b: Search augmentation (opt-in) ────────────────────────────────
    let augmentedMessages = messages;
    let searchAugmented = false;
    if (this.searchEngine && this.config.search.enabled) {
      try {
        const results = await this.searchEngine.search(text);
        if (results.length > 0) {
          const context = SearchEngine.formatAsContext(results);
          augmentedMessages = [
            { role: "system", content: context },
            ...messages,
          ];
          searchAugmented = true;
          trace.push(
            `step 2b: search augmented (${results.length} results from: ${this.searchEngine.activeSources.join(", ")})`,
          );
        } else {
          trace.push(`step 2b: search returned 0 results — proceeding without augmentation`);
        }
      } catch (err) {
        trace.push(`step 2b: search failed (${String(err)}) — proceeding without augmentation`);
      }
    } else {
      trace.push(`step 2b: search disabled`);
    }

    // ── Step 3: Classify complexity ──────────────────────────────────────────
    const { score, tier } = this.classifier.classify(text);
    const reason = tierToReason(tier);
    trace.push(`step 3: complexity score=${score.toFixed(3)} → target tier=${tier}`);

    // ── Step 4: Select provider + budget check ────────────────────────────────
    const provider = this.selectProvider(tier);
    trace.push(`step 4: mapped tier '${tier}' to provider '${provider.name}'`);

    // Warn if cloud tier was requested but fell back to specialist (happens when no
    // cloud API key is configured and specialist is a real API provider like Gemini)
    if (
      tier === "cloud" &&
      this.providers.cloud.costPer1kInputTokens === 0 &&
      this.providers.specialist &&
      this.providers.specialist.costPer1kInputTokens > 0
    ) {
      trace.push(
        `step 4: NOTE: cloud provider '${this.providers.cloud.name}' has no API key → ` +
        `routing to specialist '${provider.name}' instead`,
      );
    }

    if (tier !== "local") {
      try {
        // Estimate cost (provider cost × rough token estimate)
        const estimatedCost =
          (estimatedTokens / 1000) * provider.costPer1kInputTokens +
          (Math.round(estimatedTokens * 0.7) / 1000) * provider.costPer1kOutputTokens;

        this.budget.checkAndRecord({
          model: provider.name,
          inputTokens: 0, // updated after completion
          outputTokens: 0,
          costEur: estimatedCost,
          routingTier: tier,
        });
        trace.push(`step 4(b): budget check passed (est. cost €${estimatedCost.toFixed(5)})`);
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          trace.push(`step 4(b): BUDGET EXCEEDED! FallbackToLocal=${this.config.router.fallbackToLocal}`);
          if (this.config.router.fallbackToLocal) {
            return this.execute(
              augmentedMessages,
              "local",
              "budget_exceeded",
              score,
              this.providers.local[0]!,
              options,
              trace,
            );
          }
          throw err;
        }
        throw err;
      }
    } else {
      trace.push(`step 4(b): budget check skipped (local models are free)`);
    }

    // ── Step 5: Execute ──────────────────────────────────────────────────────
    const finalReason: RoutingReason = searchAugmented ? "search_augmented" : reason;
    trace.push(`step 5: dispatching request to ${provider.name}`);
    return this.execute(augmentedMessages, tier, finalReason, score, provider, options, trace);
  }

  private async execute(
    messages: Message[],
    tier: RoutingTier,
    reason: RoutingReason,
    score: number,
    provider: BaseProvider,
    options: CompletionOptions,
    trace: string[],
  ): Promise<RoutingDecision> {
    let response: LLMResponse;
    let actualTier = tier;

    try {
      if (tier === "specialist") {
        trace.push(`[DELEGATION] Invoking specialist '${provider.name}' to generate ExecutionPlan...`);
        // 1. Ask Specialist to build a plan
        const planMessages: Message[] = [
          ...messages,
          {
            role: "system",
            content: "You are a technical planner. Do not write the code or solve the problem directly. Break the user's request down into 1-4 clear, strictly defined, and easy-to-implement sub-tasks. Output ONLY valid JSON matching this schema: { \"subtasks\": [\"task 1\", \"task 2\"] } without markdown blocks or other text.",
          },
        ];

        const planResponse = await provider.complete(planMessages, options);
        let plan: import("../types.js").ExecutionPlan | null = null;

        try {
          // Clean up potential markdown formatting before parsing
          const cleanedJson = planResponse.content.replace(/^```[a-z]*\n/, "").replace(/\n```$/, "").trim();
          plan = JSON.parse(cleanedJson);
        } catch (e) {
          trace.push(`[DELEGATION] Failed to parse JSON plan from specialist. Falling back to standard execution. Output: ${planResponse.content.slice(0, 50)}...`);
        }

        if (plan && Array.isArray(plan.subtasks) && plan.subtasks.length > 0) {
          trace.push(`[DELEGATION] Specialist generated ${plan.subtasks.length} sub-tasks. Delegating to local worker...`);

          let aggregatedContent = `## Execution Plan\n`;
          plan.subtasks.forEach((task, i) => {
            aggregatedContent += `${i + 1}. ${task}\n`;
          });
          if (options.onStream) options.onStream(aggregatedContent);

          let totalLocalInputTokens = 0;
          let totalLocalOutputTokens = 0;
          let maxLatency = planResponse.latencyMs;

          // 2. Execute each sub-task concurrently across the local/specialist execution trees
          trace.push(`  → Distributing ${plan.subtasks.length} sub-tasks recursively (maxDepth=2)...`);

          if (options.onStream) {
            options.onStream(`> ⚡ *Distributing ${plan.subtasks.length} sub-tasks across worker tree...*\n\n`);
          }

          const taskPromises = plan.subtasks.map(async (subtask, i) =>
            this.executeRecursiveSubtask(subtask, messages, options, trace, 0, 2, i)
          );

          // Wait for all subtasks (and potential nested trees) to finish
          const stepResults = await Promise.all(taskPromises);

          // 3. Assemble the ordered response
          const usedLocalModels = new Set<string>();

          stepResults.forEach((result) => {
            const { stepResponse, index, workerName, latencyMs, depth } = result;
            if (workerName !== provider.name) usedLocalModels.add(stepResponse.model);

            let block = `### Sub-task ${index + 1}\n\n`;
            if (depth > 0) {
              block += `> *Recursively broken down (Depth ${depth}). Executed by **${stepResponse.model}** on node \`${workerName}\` in ${(latencyMs / 1000).toFixed(1)}s (In: **${stepResponse.inputTokens}**, Out: **${stepResponse.outputTokens}**)*\n\n`;
            } else {
              block += `> *Executed by **${stepResponse.model}** on node \`${workerName}\` in ${(latencyMs / 1000).toFixed(1)}s (In: **${stepResponse.inputTokens}**, Out: **${stepResponse.outputTokens}**)*\n\n`;
            }
            block += `${stepResponse.content}\n\n`;

            aggregatedContent += block;
            if (options.onStream) options.onStream(block);

            totalLocalInputTokens += stepResponse.inputTokens;
            totalLocalOutputTokens += stepResponse.outputTokens;
            maxLatency = Math.max(maxLatency, planResponse.latencyMs + latencyMs); // Track aggregate latency
          });

          // Calculate hypothentical cost if we had used the Specialist for the local work
          const hypotheticalCloudCost = (totalLocalInputTokens / 1000) * provider.costPer1kInputTokens +
            (totalLocalOutputTokens / 1000) * provider.costPer1kOutputTokens;

          const localModelsStr = Array.from(usedLocalModels).join(", ");

          let telemetryStr = `\n---\n### 📊 Delegation Telemetry (Parallel Execution)\n`;
          telemetryStr += `- **Specialist Planner (${planResponse.model})**:\n`;
          telemetryStr += `  - Time: ${(planResponse.latencyMs / 1000).toFixed(1)}s\n`;
          telemetryStr += `  - Tokens: ${planResponse.inputTokens} in, ${planResponse.outputTokens} out\n`;
          telemetryStr += `  - Cost incurred: €${planResponse.costEur.toFixed(5)}\n`;
          telemetryStr += `- **Local Workers (${localModelsStr})**:\n`;
          telemetryStr += `  - Total Wall-Clock Time: ${((maxLatency - planResponse.latencyMs) / 1000).toFixed(1)}s\n`;
          telemetryStr += `  - Total Tokens: ${totalLocalInputTokens} in, ${totalLocalOutputTokens} out\n`;
          telemetryStr += `  - Cost incurred: €0.00000\n`;
          telemetryStr += `- **Estimated Savings**: **€${hypotheticalCloudCost.toFixed(5)}** vs a pure-cloud architecture\n`;

          if (options.onStream) options.onStream(telemetryStr);
          aggregatedContent += telemetryStr;

          // 4. Return final decision
          response = {
            content: aggregatedContent,
            model: `planned-by:${planResponse.model},executed-by:${localModelsStr}`,
            inputTokens: planResponse.inputTokens + totalLocalInputTokens, // Specialist input + Local inputs
            outputTokens: planResponse.outputTokens + totalLocalOutputTokens, // Specialist output + Local outputs
            costEur: planResponse.costEur, // Local is free
            latencyMs: maxLatency,
          };

          actualTier = "delegated";
          trace.push(`[DELEGATION] Completed all sub-tasks correctly.`);
        } else {
          // If no plan, just do it normally
          response = await provider.complete(messages, options);
        }
      } else {
        // Standard execution
        response = await provider.complete(messages, options);
      }
    } catch (err) {
      trace.push(`error: provider '${provider.name}' failed: ${String(err)}`);
      // Fallback to local if cloud fails and fallback is enabled
      if (tier !== "local" && this.config.router.fallbackToLocal) {
        console.warn(
          `[LokaFlow] ${provider.name} unavailable: ${String(err)}. Falling back to local.`,
        );
        const fallbackTarget = this.providers.local[0]!;
        trace.push(`fallback: trying local provider '${fallbackTarget.name}' instead`);
        response = await fallbackTarget.complete(messages, options);
        actualTier = "local";
      } else {
        appendLog(trace.join("\n") + "\n\n");
        throw err instanceof ProviderUnavailableError
          ? err
          : new ProviderUnavailableError(provider.name, String(err));
      }
    }

    // Record actual cost for local tier (zero cost — non-blocking)
    if (actualTier === "local") {
      this.budget.record({
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costEur: 0.0,
        routingTier: actualTier,
      });
    }

    trace.push(`result: success.`);
    trace.push(
      `decision: TIER=${actualTier} | MODEL=${response.model} | REASON=${reason} | SCORE=${score.toFixed(
        2,
      )} | COST=€${response.costEur.toFixed(5)} | LATENCY=${response.latencyMs}ms\n`,
    );

    appendLog(trace.join("\n") + "\n");

    return { tier: actualTier, model: response.model, reason, complexityScore: score, response };
  }

  private async executeRecursiveSubtask(
    subtask: string,
    history: Message[],
    options: CompletionOptions,
    trace: string[],
    currentDepth: number,
    maxDepth: number,
    index: number
  ): Promise<{ stepResponse: LLMResponse, index: number, workerName: string, latencyMs: number, depth: number }> {
    const { score, tier } = this.classifier.classify(subtask);
    const start = Date.now();

    // 1. If simple, or if we hit max recursion depth, execute!
    if (tier === "local" || currentDepth >= maxDepth) {
      let worker: BaseProvider;

      // If we hit max depth and it's STILL complex, run on Specialist to avoid gibberish output
      if (tier !== "local" && currentDepth >= maxDepth && this.providers.specialist) {
        worker = this.providers.specialist;
        trace.push(`  [Depth ${currentDepth}] Subtask ${index} is STILL complex (score=${score.toFixed(2)}). Forcing Specialist execution.`);
      } else {
        worker = this.providers.local[index % this.providers.local.length]!;
        trace.push(`  [Depth ${currentDepth}] Subtask ${index} routing to Local (score=${score.toFixed(2)}).`);
      }

      const workerContext: Message[] = [
        ...history,
        { role: "user", content: `Please execute this specific sub-task based on the earlier context: ${subtask}` }
      ];

      let stepResponse!: LLMResponse;
      let retries = 0;
      const maxRetries = 2;

      while (retries <= maxRetries) {
        try {
          stepResponse = await worker.complete(workerContext, Object.assign({}, options, { onStream: undefined }));
          break;
        } catch (error) {
          if (retries === maxRetries) {
            trace.push(`      [Depth ${currentDepth}] Subtask ${index} final failure on ${worker.name}: ${String(error)}.`);
            throw error;
          }
          retries++;
          trace.push(`      [Depth ${currentDepth}] Subtask ${index} failed on ${worker.name} (${String(error)}). Retrying (${retries}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      const latencyMs = Date.now() - start;
      trace.push(`      ↪ [Depth ${currentDepth}] Subtask ${index} completed by ${worker.name} [model=${stepResponse.model}] in ${(latencyMs / 1000).toFixed(1)}s (In: ${stepResponse.inputTokens}, Out: ${stepResponse.outputTokens}).`);
      return { stepResponse, index, workerName: worker.name, latencyMs, depth: currentDepth };
    }

    // 2. If it is complex, recursively ask Specialist to break it down further!
    trace.push(`  [Depth ${currentDepth}] Subtask ${index} is too complex (score=${score.toFixed(2)}). Asking Planner to decompose...`);
    const planner = this.providers.specialist ?? this.providers.local[0]!;

    const planContext: Message[] = [
      ...history,
      { role: "user", content: `The following sub-task is too complex to execute directly. Break it down into 1-3 smaller, strictly defined, and extremely easy-to-implement JSON sub-tasks.\n\nSub-task: ${subtask}` },
      { role: "system", content: "Output ONLY valid JSON matching schema: { \"subtasks\": [\"task 1\", \"task 2\"] } without markdown blocks." }
    ];

    const planResponse = await planner.complete(planContext, Object.assign({}, options, { onStream: undefined }));
    let nestedPlan: import("../types.js").ExecutionPlan | null = null;

    try {
      const cleanedJson = planResponse.content.replace(/^```[a-z]*\n/, "").replace(/\n```$/, "").trim();
      nestedPlan = JSON.parse(cleanedJson);
    } catch {
      trace.push(`  [Depth ${currentDepth}] Failed to parse nested JSON plan. Forcing execution...`);
    }

    // 3. If nested breakdown succeeds, execute the nested tasks!
    if (nestedPlan && Array.isArray(nestedPlan.subtasks) && nestedPlan.subtasks.length > 0) {
      const nestedPromises = nestedPlan.subtasks.map((nestedSubtask, i) =>
        this.executeRecursiveSubtask(nestedSubtask, history, options, trace, currentDepth + 1, maxDepth, i)
      );
      const nestedResults = await Promise.all(nestedPromises);

      // Aggregate the nested results into one massive response block so it mimics a single stepResponse
      let aggregatedContent = "";
      let totalInput = planResponse.inputTokens;
      let totalOutput = planResponse.outputTokens;
      let maxLatency = planResponse.latencyMs;

      nestedResults.forEach(res => {
        aggregatedContent += res.stepResponse.content + "\n\n";
        totalInput += res.stepResponse.inputTokens;
        totalOutput += res.stepResponse.outputTokens;
        maxLatency = Math.max(maxLatency, res.latencyMs);
      });

      const stepResponse: LLMResponse = {
        content: aggregatedContent.trim(),
        model: `planned-by:${planResponse.model},executed-by:nested`,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        costEur: planResponse.costEur,
        latencyMs: maxLatency
      };

      return { stepResponse, index, workerName: "Recursive-Tree", latencyMs: maxLatency, depth: currentDepth + 1 };
    }

    // 4. Fallback: If breakdown failed or returned 0 tasks, execute on Specialist
    const fallbackContext: Message[] = [...history, { role: "user", content: `Please execute this specific sub-task based on the earlier context: ${subtask}` }];
    const stepResponse = await planner.complete(fallbackContext, Object.assign({}, options, { onStream: undefined }));
    const latencyMs = Date.now() - start;
    trace.push(`      ↪ [Depth ${currentDepth}] Subtask ${index} executed via Fallback by ${planner.name} [model=${stepResponse.model}] in ${(latencyMs / 1000).toFixed(1)}s (In: ${stepResponse.inputTokens}, Out: ${stepResponse.outputTokens}).`);
    return { stepResponse, index, workerName: planner.name, latencyMs, depth: currentDepth };
  }

  private selectProvider(tier: RoutingTier): BaseProvider {
    const randomLocal = this.providers.local[Math.floor(Math.random() * this.providers.local.length)]!;
    switch (tier) {
      case "local":
        return randomLocal;
      case "specialist":
        return this.providers.specialist ?? randomLocal;
      case "cloud": {
        const cloud = this.providers.cloud;
        // If the "cloud" provider is actually a local Ollama instance (no real cloud API
        // key was available at startup — indicated by zero cost-per-token), fall back to
        // specialist instead, so high-complexity queries reach the best real API model
        // (e.g. Gemini) rather than silently downgrading to Ollama.
        const cloudIsLocal = cloud.costPer1kInputTokens === 0;
        const specialistIsReal =
          this.providers.specialist !== undefined &&
          this.providers.specialist.costPer1kInputTokens > 0;
        if (cloudIsLocal && specialistIsReal) {
          return this.providers.specialist!;
        }
        return cloud;
      }
      case "delegated":
        return this.providers.specialist ?? randomLocal;
    }
  }
}

function tierToReason(tier: RoutingTier): RoutingReason {
  switch (tier) {
    case "local":
      return "low_complexity";
    case "specialist":
    case "delegated":
      return "medium_complexity";
    case "cloud":
      return "high_complexity";
  }
}

export { scoreTier };
