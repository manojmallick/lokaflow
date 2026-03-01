// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/types/agent.ts
// All TypeScript types for LokaAgent — strict, no `any`.

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  role: MessageRole;
  content: string;
}

export type ModelTier =
  | "LOCAL_NANO"
  | "LOCAL_STANDARD"
  | "LOCAL_LARGE"
  | "CLOUD_LIGHT"
  | "CLOUD_STANDARD"
  | "CLOUD_PREMIUM";

export type OutputFormat = "JSON" | "MARKDOWN" | "PLAIN" | "CODE";

export type OutputType = "DOCUMENT" | "CODE" | "ANALYSIS" | "ANSWER" | "LIST" | "TABLE" | "SUMMARY";

export type QualityPreference = "SPEED" | "BALANCED" | "QUALITY";

export type NodeStatus = "PENDING" | "RUNNING" | "COMPLETE" | "FAILED" | "ESCALATED";

export type AssemblyStrategy =
  | "SEQUENTIAL"
  | "HIERARCHICAL"
  | "EXTRACTIVE"
  | "SYNTHESIS"
  | "CODE_MERGE";

export type EscalationReason =
  | "quality_gate_failed"
  | "max_recursion_depth"
  | "context_window_exceeded"
  | "timeout"
  | "no_local_model_capable";

// ---------------------------------------------------------------------------
// Request / Response
// ---------------------------------------------------------------------------

export interface AgentRequest {
  prompt: string;
  conversationHistory?: Message[];
  /** Override: force everything local, never cloud */
  localOnly?: boolean;
  qualityPreference?: QualityPreference;
  subscriptionActive?: boolean;
}

export interface AgentResponse {
  content: string;
  trace: AgentTrace;
  metrics: AgentMetrics;
  /** true if one or more subtasks were escalated to cloud */
  partial?: boolean;
}

// ---------------------------------------------------------------------------
// Intent & Guard
// ---------------------------------------------------------------------------

export interface IntentProfile {
  primaryGoal: string;
  outputType: OutputType;
  requiredSections: string[];
  domainHints: string[];
  qualityRequirement: QualityPreference;
  estimatedComplexity: number;
  /** Original prompt stored before any sanitisation — for audit */
  preserveOriginalPrompt: string;
}

export type GuardAction = "PROCEED" | "BLOCK" | "CLARIFY";

export interface GuardResult {
  action: GuardAction;
  /** Present when action === 'PROCEED' */
  cleanPrompt?: string;
  intent?: IntentProfile;
  localOnly?: boolean;
  estimatedComplexity?: number;
  /** Present when action === 'BLOCK' */
  reason?: string;
  /** Present when action === 'CLARIFY' */
  question?: string;
}

// ---------------------------------------------------------------------------
// Complexity
// ---------------------------------------------------------------------------

export interface ComplexityDimensions {
  reasoning: number;
  domain: number;
  creativity: number;
  context: number;
  precision: number;
  interdependence: number;
}

export interface ComplexityScore {
  index: number; // 0.0–1.0
  dimensions: ComplexityDimensions;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Task Graph
// ---------------------------------------------------------------------------

export interface TokenBudget {
  inputMax: number;
  outputMax: number;
}

export interface OutputSchema {
  format: OutputFormat;
  requiredElements: string[];
  maxTokens: number;
  groundingContext?: string;
}

export interface TaskNode {
  id: string;
  graphId: string;
  depth: number;
  description: string;
  inputContext: string;
  outputSchema: OutputSchema;
  assignedModel: string;
  fallbackModel: string;
  estimatedComplexity: number;
  tokenBudget: TokenBudget;
  timeoutMs: number;
  retryCount: number;
  canRunParallel: boolean;
  status: NodeStatus;
  dependsOn: string[];
  taskType: TaskType;
  escalationReason?: EscalationReason;
}

export interface TaskEdge {
  from: string;
  to: string;
}

export interface TaskGraph {
  id: string;
  originalPrompt: string;
  intent: IntentProfile;
  nodes: TaskNode[];
  edges: TaskEdge[];
  depth: number;
  intentPreserved: boolean;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Model assignment
// ---------------------------------------------------------------------------

export interface ModelAssignment {
  modelId: string;
  tier: ModelTier;
  fallbackModelId: string;
  qualityScore: number;
  warmOnNode?: string | undefined;
  reason: "matched" | "warm_preference" | "no_local_capable" | "context_fit";
}

// ---------------------------------------------------------------------------
// Node execution
// ---------------------------------------------------------------------------

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelOutput {
  content: string;
  usage: TokenUsage;
  latencyMs: number;
}

export interface NodeResult {
  nodeId: string;
  output: string;
  model: string;
  tokensUsed: TokenUsage;
  latencyMs: number;
  packedTokens?: number;
  qualityScore?: number;
  escalated?: boolean;
}

export interface ExecutionResult {
  nodeResults: Map<string, NodeResult>;
  totalTokens: TokenUsage;
}

// ---------------------------------------------------------------------------
// Quality Gate
// ---------------------------------------------------------------------------

export interface CheckResult {
  name: string;
  passed: boolean;
  score: number;
  weight: number;
  detail?: string | undefined;
}

export interface ValidationResult {
  passed: boolean;
  score: number;
  failedChecks: CheckResult[];
  output: string;
  failedReason?: string | undefined;
}

// ---------------------------------------------------------------------------
// Packed Context
// ---------------------------------------------------------------------------

export interface DependencyOutput {
  taskId: string;
  summary: string;
  tokenCount: number;
}

export interface PackedContext {
  systemPrompt: string;
  taskDescription: string;
  outputSchema: string;
  tokenBudgetInstruction: string;
  dependencyOutputs: DependencyOutput[];
  relevantContext: string;
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

export interface EscalationRecord {
  nodeId: string;
  taskDescription: string;
  originalModel: string;
  escalatedTo: string;
  reason: EscalationReason;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------------

export interface PromptGuardTrace {
  action: GuardAction;
  piiDetected: boolean;
  ambiguous?: boolean;
}

export interface ComplexityTrace {
  index: number;
  dimensions: ComplexityDimensions;
  confidence: number;
  usedModelCall: boolean;
}

export interface DecompositionNodeTrace {
  id: string;
  depth: number;
}

export interface DecompositionTrace {
  subtaskCount: number;
  depth: number;
  gateDecision: string;
  intentPreserved: boolean;
  nodes: DecompositionNodeTrace[];
}

export interface ModelAssignmentTrace {
  nodeId: string;
  modelId: string;
  tier: ModelTier;
  qualityScore: number;
  warm: boolean;
}

export interface ExecutionNodeTrace {
  id: string;
  description: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  qualityScore: number;
  escalated: boolean;
  packedTokens: number;
}

export interface ExecutionTrace {
  nodes: ExecutionNodeTrace[];
  parallelBatches: number;
  totalLatencyMs: number;
}

export interface QualityGateTrace {
  nodeId: string;
  passed: boolean;
  score: number;
  failedChecks: string[];
}

export interface AssemblyTrace {
  strategy: AssemblyStrategy;
  usedSynthesisModel: boolean;
}

export interface SavingsTrace {
  totalNodes: number;
  localNodes: number;
  cloudNodes: number;
  escalatedNodes: number;
  cloudEquivalentTokens: number;
  actualLocalTokens: number;
  actualCloudTokens: number;
  savingPercent: number;
  savingEur: number;
}

export interface AgentTrace {
  promptGuard: PromptGuardTrace;
  complexityScore: ComplexityTrace;
  decomposition: DecompositionTrace;
  modelAssignments: ModelAssignmentTrace[];
  execution: ExecutionTrace;
  qualityGates: QualityGateTrace[];
  assembly: AssemblyTrace;
  savings: SavingsTrace;
}

export interface AgentMetrics {
  totalLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  nodesExecuted: number;
  nodesEscalated: number;
  estimatedCostEur: number;
}

// ---------------------------------------------------------------------------
// Model capability
// ---------------------------------------------------------------------------

export type TaskType =
  | "extraction"
  | "formatting"
  | "assembly"
  | "summarisation"
  | "translation"
  | "reasoning"
  | "coding"
  | "codeReview"
  | "testGeneration"
  | "debugging"
  | "documentation"
  | "analysis"
  | "regulatory"
  | "toolUse"
  | "vision"
  | "ocrExtraction"
  | "captioning"
  | "imageClassification"
  | "visualQA"
  | "chartAnalysis"
  | "visualReasoning"
  | "embedding"
  | "semanticSearch"
  | "algorithmicCoding";

export interface ModelCapabilityProfile {
  id: string;
  tier: ModelTier;
  ramGb: number;
  contextTokens: number;
  tokensPerSec: {
    m2_8gb: number;
    m4_16gb: number;
  };
  capabilities: Partial<Record<TaskType, number>>;
  qualityFloor: number;
  preferred?: boolean;
  specialisation?: string;
  costFactor?: number; // 0.0 (cheapest) → 1.0 (most expensive)
}

export interface GateDecision {
  decompose: boolean;
  reason?: string;
}

export interface FinalOutput {
  content: string;
  trace: AgentTrace;
  metrics: AgentMetrics;
}
