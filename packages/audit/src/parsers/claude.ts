// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/audit/src/parsers/claude.ts
// Parses Anthropic's GDPR export (conversations.json).

import type { ChatMessage, ConversationInfo, ExportData, ExportParser } from "../types.js";

interface ClaudeMessage {
    sender: "Human" | "Assistant" | "System";
    text: string;
    created_at: string;
    updated_at: string;
}

interface ClaudeConversation {
    uuid: string;
    name: string;
    created_at: string;
    updated_at: string;
    chat_messages: ClaudeMessage[];
}

export class ClaudeParser implements ExportParser {
    parse(rawJson: string): ExportData {
        const data = JSON.parse(rawJson) as ClaudeConversation[];

        if (!Array.isArray(data) || (data.length > 0 && typeof data[0].chat_messages !== "object")) {
            throw new Error("Invalid Claude export format. Expected an array of conversations with a 'chat_messages' array.");
        }

        const conversations: ConversationInfo[] = data.map(conv => {
            const messages: ChatMessage[] = conv.chat_messages.map(msg => {
                let role: ChatMessage["role"] = "user";
                if (msg.sender === "Assistant") role = "assistant";
                else if (msg.sender === "System") role = "system";

                return {
                    role,
                    content: msg.text || "",
                    timestampMs: new Date(msg.created_at).getTime(),
                };
            });

            // Anthropic messages are usually chronological, but let's confirm
            messages.sort((a, b) => a.timestampMs - b.timestampMs);

            return {
                id: conv.uuid,
                title: conv.name || "Untitled",
                createTimeMs: new Date(conv.created_at).getTime(),
                updateTimeMs: new Date(conv.updated_at).getTime(),
                messages,
            };
        });

        return {
            provider: "claude",
            exportDateMs: Date.now(),
            conversations,
        };
    }
}
