// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/decomposer/prompts/decomposition.ts
// The decomposition prompt template for the interim qwen2.5:7b decomposer.
// Every word matters — this drives the entire task-splitting quality.

export const DECOMPOSITION_SYSTEM_PROMPT = `You are a task decomposition system for an AI routing engine.
You do NOT answer questions. You ONLY decompose them into subtasks.
You MUST respond with ONLY valid JSON. No preamble, no explanation, no markdown fences.`;

export const DECOMPOSITION_USER_PROMPT_TEMPLATE = `
AVAILABLE LOCAL MODELS:
{{MODEL_CAPABILITY_JSON}}

ORIGINAL TASK: {{TASK}}
INTENT PROFILE: {{INTENT_JSON}}
COMPLEXITY INDEX: {{COMPLEXITY_INDEX}}
WARM MODELS (prefer these — already loaded): {{WARM_MODELS}}

DECOMPOSITION RULES (follow exactly):
1. Maximum 6 subtasks total — merge small related tasks
2. Each subtask must be independently executable — clear input, clear output
3. Each subtask must have an explicit output schema (what format does it return?)
4. If subtask B needs output from subtask A, mark B as dependent on A
5. Assign each subtask to the CHEAPEST model that can do it acceptably
6. EXTRACTION tasks → always assign LOCAL_NANO
7. FORMATTING/ASSEMBLY tasks → always assign LOCAL_NANO
8. REASONING tasks → check if LOCAL_STANDARD can handle it
9. DOMAIN-EXPERT tasks → assign LOCAL_STANDARD or flag as NEEDS_CLOUD
10. Prefer warm models listed above

Return ONLY valid JSON matching this exact schema:
{
  "decomposition_rationale": "one sentence explaining the split strategy",
  "intent_preserved": true,
  "subtasks": [
    {
      "id": "t1",
      "description": "exact instruction for this subtask",
      "input_context": "what this subtask receives as input",
      "output_schema": "describe what this subtask must return (format, fields, length limit)",
      "assigned_model": "ollama:qwen2.5:7b",
      "estimated_complexity": 0.0,
      "depends_on": [],
      "can_run_parallel": true,
      "token_budget": { "input_max": 4000, "output_max": 1000 }
    }
  ]
}`;

export function buildDecompositionPrompt(
  task: string,
  intentJson: string,
  complexityIndex: number,
  modelCapabilityJson: string,
  warmModels: string[],
): string {
  return DECOMPOSITION_USER_PROMPT_TEMPLATE.replace("{{TASK}}", task)
    .replace("{{INTENT_JSON}}", intentJson)
    .replace("{{COMPLEXITY_INDEX}}", complexityIndex.toFixed(2))
    .replace("{{MODEL_CAPABILITY_JSON}}", modelCapabilityJson)
    .replace("{{WARM_MODELS}}", warmModels.join(", ") || "none");
}
