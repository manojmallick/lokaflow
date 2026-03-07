// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaFlow™ — lokaflow.io

import { describe, it, expect, beforeEach } from "vitest";
import { ModelCapabilityRegistry } from "../../src/registry/model-registry.js";
import { WarmModelTracker } from "../../src/registry/warm-tracker.js";

describe("ModelCapabilityRegistry", () => {
  const registry = new ModelCapabilityRegistry();

  it("loads the default interim model registry", () => {
    expect(registry.getAvailable().length).toBeGreaterThan(0);
  });

  it("returns a model profile by id", () => {
    const profile = registry.get("ollama:qwen2.5:7b");
    expect(profile).toBeDefined();
    expect(profile?.tier).toBe("LOCAL_STANDARD");
  });

  it("returns quality score for a valid task type", () => {
    const quality = registry.quality("ollama:qwen2.5:7b", "reasoning");
    expect(quality).toBeGreaterThan(0.6);
  });

  it("returns 0 quality for a model that doesn't support vision", () => {
    const quality = registry.quality("ollama:mistral:7b", "vision");
    expect(quality).toBe(0);
  });

  it("finds a capable model for extraction tasks", () => {
    const model = registry.bestLocalForTask("extraction");
    expect(model).toBeTruthy();
  });

  it("identifies that a coding-capable model exists", () => {
    const capable = registry.hasCapableModel("coding", 0.65);
    expect(capable).toBe(true);
  });

  it("returns correct context token count for qwen2.5", () => {
    const ctx = registry.contextTokens("ollama:qwen2.5:7b");
    expect(ctx).toBe(131072);
  });

  it("filters by tier correctly", () => {
    const nanoModels = registry.byTier("LOCAL_NANO");
    expect(nanoModels.every((m) => m.tier === "LOCAL_NANO")).toBe(true);
  });
});

describe("WarmModelTracker", () => {
  let tracker: WarmModelTracker;

  beforeEach(() => {
    tracker = new WarmModelTracker();
  });

  it("starts with no warm models", () => {
    expect(tracker.getWarmModels()).toHaveLength(0);
  });

  it("tracks a warm model after setWarm", () => {
    tracker.setWarm("ollama:mistral:7b", "node-1");
    expect(tracker.isWarm("ollama:mistral:7b")).toBe(true);
  });

  it("returns false for a non-warm model", () => {
    expect(tracker.isWarm("ollama:llama3.2:8b")).toBe(false);
  });

  it("detects warm model on a specific node", () => {
    tracker.setWarm("ollama:qwen2.5:7b", "mac-mini-m2");
    expect(tracker.isWarm("ollama:qwen2.5:7b", "mac-mini-m2")).toBe(true);
    expect(tracker.isWarm("ollama:qwen2.5:7b", "mac-mini-pro")).toBe(false);
  });

  it("updates warm models via updateNode", () => {
    tracker.updateNode("node-1", ["ollama:mistral:7b", "ollama:qwen2.5:7b"]);
    expect(tracker.isWarm("ollama:mistral:7b")).toBe(true);
    expect(tracker.isWarm("ollama:qwen2.5:7b")).toBe(true);
  });

  it("returns the node where a model is warm", () => {
    tracker.setWarm("ollama:qwen2.5:7b", "mac-mini-m2");
    expect(tracker.getWarmNode("ollama:qwen2.5:7b")).toBe("mac-mini-m2");
  });

  it("clears all warm state", () => {
    tracker.setWarm("ollama:mistral:7b");
    tracker.clear();
    expect(tracker.getWarmModels()).toHaveLength(0);
  });

  it("deduplicates across nodes in getWarmModels", () => {
    tracker.setWarm("ollama:qwen2.5:7b", "node-1");
    tracker.setWarm("ollama:qwen2.5:7b", "node-2");
    const warm = tracker.getWarmModels();
    expect(warm.filter((m) => m === "ollama:qwen2.5:7b")).toHaveLength(1);
  });
});
