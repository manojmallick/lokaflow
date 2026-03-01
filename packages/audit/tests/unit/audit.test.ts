// © 2026 LearnHubPlay BV. All rights reserved.
// packages/audit/tests/unit/audit.test.ts

import { describe, it, expect } from "vitest";
import { ChatgptParser } from "../../src/parsers/chatgpt.js";
import { ClaudeParser } from "../../src/parsers/claude.js";
import { AuditEngine } from "../../src/engine/engine.js";
import type { ExportData } from "../../src/types.js";

const chatgptSample = `[
  {
    "id": "conv-1",
    "title": "React Help",
    "create_time": 1700000000,
    "update_time": 1700000100,
    "mapping": {
      "node1": {
        "message": {
          "author": { "role": "user" },
          "create_time": 1700000000,
          "content": { "content_type": "text", "parts": ["How do I center a div in CSS?"] }
        }
      },
      "node2": {
        "message": {
          "author": { "role": "assistant" },
          "create_time": 1700000010,
          "content": { "content_type": "text", "parts": ["Use flexbox: display: flex; align-items: center; justify-content: center;"] }
        }
      }
    }
  }
]`;

const claudeSample = `[
  {
    "uuid": "conv-2",
    "name": "Python Script",
    "created_at": "2023-11-15T12:00:00Z",
    "updated_at": "2023-11-15T12:05:00Z",
    "chat_messages": [
      {
        "sender": "Human",
        "text": "Write a complex kubernetes deployment yaml with resource limits and health checks.",
        "created_at": "2023-11-15T12:00:00Z",
        "updated_at": "2023-11-15T12:00:00Z"
      },
      {
        "sender": "Assistant",
        "text": "Here is the yaml: ...",
        "created_at": "2023-11-15T12:01:00Z",
        "updated_at": "2023-11-15T12:01:00Z"
      }
    ]
  }
]`;

describe("Parsers", () => {
    it("parses ChatGPT export format", () => {
        const parser = new ChatgptParser();
        const data = parser.parse(chatgptSample);

        expect(data.provider).toBe("chatgpt");
        expect(data.conversations).toHaveLength(1);
        expect(data.conversations[0].messages).toHaveLength(2);
        expect(data.conversations[0].messages[0].role).toBe("user");
        expect(data.conversations[0].messages[0].content).toContain("center a div");
    });

    it("parses Claude export format", () => {
        const parser = new ClaudeParser();
        const data = parser.parse(claudeSample);

        expect(data.provider).toBe("claude");
        expect(data.conversations).toHaveLength(1);
        expect(data.conversations[0].messages).toHaveLength(2);
        expect(data.conversations[0].messages[0].role).toBe("user");
        expect(data.conversations[0].messages[0].content).toContain("kubernetes");
    });
});

describe("AuditEngine", () => {
    it("analyzes simple vs complex queries and predicts savings", async () => {
        // Requires Orchestrator to be built and resolvable
        const engine = new AuditEngine();

        // We combine both samples into one pseudo-export
        const gptData = new ChatgptParser().parse(chatgptSample);
        const claudeData = new ClaudeParser().parse(claudeSample);

        const combinedData: ExportData = {
            provider: "chatgpt", // arbitrary for test
            exportDateMs: Date.now(),
            conversations: [...gptData.conversations, ...claudeData.conversations]
        };

        // The react query should be 'simple' (local), the k8s query might be 'complex'
        const report = await engine.analyze(combinedData, 22.99);

        expect(report.totalConversations).toBe(2);
        expect(report.totalUserMessages).toBe(2);
        expect(report.canCancel).toBe(true); // Given the tiny volume, API cost will be practically zero
        expect(report.monthlySavingsEur).toBeGreaterThan(20);
        expect(report.reasoning).toContain("can be handled locally for free");
    });
});
