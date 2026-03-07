// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/decomposer/prompts/complexity-scoring.ts
// Prompt for qwen2.5:7b complexity scoring second pass.

export const COMPLEXITY_SCORING_SYSTEM_PROMPT = `You are a task complexity analyser for an AI routing system.
You MUST respond with ONLY valid JSON. No preamble, no explanation.`;

export const COMPLEXITY_SCORING_USER_TEMPLATE = `Score the complexity of the following task.

Task: {{PROMPT}}
Intent: {{INTENT_SUMMARY}}

Score each dimension 0.0–1.0:
- reasoning: logical inference steps required
- domain: specialist expertise depth required
- creativity: novel synthesis vs pattern retrieval
- context: how much must be held in working memory
- precision: tolerance for error (1.0 = must be exactly right)
- confidence: how confident you are in this scoring (0.0–1.0)

Return ONLY valid JSON:
{"reasoning": 0.0, "domain": 0.0, "creativity": 0.0, "context": 0.0, "precision": 0.0, "confidence": 0.0}`;

export function buildComplexityScoringPrompt(prompt: string, intentSummary: string): string {
  return COMPLEXITY_SCORING_USER_TEMPLATE.replace("{{PROMPT}}", prompt).replace(
    "{{INTENT_SUMMARY}}",
    intentSummary,
  );
}
