// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/audit/src/parsers/chatgpt.ts
// Parses OpenAI's GDPR export (conversations.json).

import type { ChatMessage, ConversationInfo, ExportData, ExportParser } from "../types.js";

// Minimal shape of the ChatGPT conversations.json
interface ChatgptNode {
    message?: {
        author: { role: string };
        create_time: number | null;
        content: {
            content_type: string;
            parts?: string[];
        };
    };
}

interface ChatgptConversation {
    id: string;
    title: string;
    create_time: number;
    update_time: number;
    mapping: Record<string, ChatgptNode>;
}

export class ChatgptParser implements ExportParser {
    parse(rawJson: string): ExportData {
        const data = JSON.parse(rawJson) as ChatgptConversation[];

        if (!Array.isArray(data) || (data.length > 0 && typeof data[0].mapping !== "object")) {
            throw new Error("Invalid ChatGPT export format. Expected an array of conversations with a 'mapping' dictionary.");
        }

        const conversations: ConversationInfo[] = data.map(conv => {
            const messages: ChatMessage[] = [];

            // The mapping contains all nodes (messages, system prompts, etc) in a flat dict.
            // We extract them all, ignoring the strict tree order for simple volume analysis.
            for (const key of Object.keys(conv.mapping)) {
                const node = conv.mapping[key];
                if (!node?.message) continue;

                const role = node.message.author.role;
                // Only care about text interactions to estimate volume
                if (node.message.content.content_type !== "text") continue;
                if (!node.message.content.parts || node.message.content.parts.length === 0) continue;

                // Ensure role string maps to our restricted type
                let safeRole: ChatMessage["role"] = "user";
                if (role === "assistant") safeRole = "assistant";
                else if (role === "system") safeRole = "system";
                else if (role === "tool") safeRole = "tool";
                else if (role !== "user") continue;

                let contentText = "";
                for (const part of node.message.content.parts) {
                    if (typeof part === "string") contentText += part;
                }

                messages.push({
                    role: safeRole,
                    content: contentText,
                    timestampMs: (node.message.create_time || conv.create_time || 0) * 1000,
                });
            }

            // Sort by chronological order
            messages.sort((a, b) => a.timestampMs - b.timestampMs);

            return {
                id: conv.id,
                title: conv.title || "Untitled",
                createTimeMs: conv.create_time * 1000,
                updateTimeMs: conv.update_time * 1000,
                messages,
            };
        });

        return {
            provider: "chatgpt",
            exportDateMs: Date.now(), // The JSON doesn't contain the export date globally
            conversations,
        };
    }
}
