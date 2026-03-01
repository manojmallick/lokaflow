// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io
//
// packages/agent/src/registry/warm-tracker.ts
// Tracks which models are currently loaded in Ollama on each mesh node.
// LokaMesh polls each node every 30s via GET http://[node-ip]:11434/api/ps

export class WarmModelTracker {
  /** nodeId → list of loaded model ids */
  private readonly warmByNode: Map<string, string[]> = new Map();

  /**
   * Update the warm model list for a specific node.
   * Called by the mesh poller every 30 seconds.
   */
  updateNode(nodeId: string, loadedModels: string[]): void {
    this.warmByNode.set(nodeId, loadedModels);
  }

  /**
   * Returns true if the model is warm on ANY node, or a specific node.
   */
  isWarm(modelId: string, nodeId?: string): boolean {
    if (nodeId) {
      return this.warmByNode.get(nodeId)?.includes(modelId) ?? false;
    }
    for (const models of this.warmByNode.values()) {
      if (models.includes(modelId)) return true;
    }
    return false;
  }

  /**
   * Returns all models currently warm across ALL nodes (deduplicated).
   */
  getWarmModels(): string[] {
    return [...new Set([...this.warmByNode.values()].flat())];
  }

  /**
   * Returns the node ID where a model is warm, if any.
   */
  getWarmNode(modelId: string): string | undefined {
    for (const [nodeId, models] of this.warmByNode.entries()) {
      if (models.includes(modelId)) return nodeId;
    }
    return undefined;
  }

  /**
   * Directly mark a model as warm for testing / pre-warming.
   */
  setWarm(modelId: string, nodeId = "local"): void {
    const existing = this.warmByNode.get(nodeId) ?? [];
    if (!existing.includes(modelId)) {
      this.warmByNode.set(nodeId, [...existing, modelId]);
    }
  }

  clear(): void {
    this.warmByNode.clear();
  }
}
