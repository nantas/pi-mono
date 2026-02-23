import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";

const MEM0_URL: string = process.env.MEM0_URL || "http://localhost:7889";

const mem0Schema = Type.Object({
	action: Type.Union([Type.Literal("write"), Type.Literal("read"), Type.Literal("search")], {
		description: "Memory action type",
	}),
	content: Type.Optional(Type.String({ description: "Memory content (required for write)" })),
	query: Type.Optional(Type.String({ description: "Search query (required for read/search)" })),
	scope: Type.Optional(
		Type.Union([Type.Literal("user"), Type.Literal("agent"), Type.Literal("project")], {
			description: "Memory scope (defaults to user)",
		}),
	),
	project_dir: Type.Optional(Type.String({ description: "Project directory for project-scoped memory" })),
});

type Mem0Action = "write" | "read" | "search";
type Mem0Scope = "user" | "agent" | "project";

interface Mem0Args {
	action: Mem0Action;
	content?: string;
	query?: string;
	scope?: Mem0Scope;
	project_dir?: string;
}

function createTextResult(text: string): { content: Array<{ type: "text"; text: string }>; details: undefined } {
	return { content: [{ type: "text", text }], details: undefined };
}

function resolveAgentId(scope: Mem0Scope | undefined): string {
	switch (scope ?? "user") {
		case "agent":
			return "pi-mom";
		case "project":
			return "pi-mom-project";
		default:
			return "pi-mom-user";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function extractMemoryText(entry: unknown): string | null {
	if (typeof entry === "string") {
		return entry;
	}

	if (!isRecord(entry)) {
		return null;
	}

	const candidates = [entry.memory, entry.text, entry.content];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate;
		}
	}

	return null;
}

function extractMemories(data: unknown): string[] {
	if (Array.isArray(data)) {
		return data.map((entry) => extractMemoryText(entry)).filter((text): text is string => Boolean(text));
	}

	if (!isRecord(data)) {
		return [];
	}

	const collections = [data.memories, data.results];
	for (const collection of collections) {
		if (Array.isArray(collection)) {
			return collection.map((entry) => extractMemoryText(entry)).filter((text): text is string => Boolean(text));
		}
	}

	return [];
}

export function createMem0Tool(): AgentTool<typeof mem0Schema> {
	return {
		name: "mem0",
		label: "mem0",
		description: "Read and write long-term memory directly via Mem0 API.",
		parameters: mem0Schema,
		execute: async (_toolCallId: string, args: Mem0Args) => {
			const agentId = resolveAgentId(args.scope);

			if (args.action === "write") {
				if (!args.content || args.content.trim().length === 0) {
					return createTextResult("content is required for write action");
				}

				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 5000);

				try {
					const payload: {
						messages: Array<{ role: "user"; content: string }>;
						agent_id: string;
						user_id: string;
						metadata?: { project_root: string };
						async_processing: boolean;
					} = {
						messages: [{ role: "user", content: args.content }],
						agent_id: agentId,
						user_id: "nantas",
						async_processing: true,
					};

					if (args.project_dir) {
						payload.metadata = { project_root: args.project_dir };
					}

					const response = await fetch(`${MEM0_URL}/memories`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload),
						signal: controller.signal,
					});

					if (!response.ok) {
						return createTextResult(`写入记忆失败: HTTP ${response.status}`);
					}

					return createTextResult("已写入记忆。");
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					return createTextResult(`写入记忆失败: ${message}`);
				} finally {
					clearTimeout(timeoutId);
				}
			}

			if (!args.query || args.query.trim().length === 0) {
				return createTextResult("query is required for read/search action");
			}

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 5000);

			try {
				const response = await fetch(`${MEM0_URL}/search`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						query: args.query,
						user_id: "nantas",
						agent_id: agentId,
						filters: args.project_dir ? { project_root: args.project_dir } : undefined,
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					return createTextResult(`读取记忆失败: HTTP ${response.status}`);
				}

				const data = (await response.json()) as unknown;
				const memories = extractMemories(data);

				if (memories.length === 0) {
					return createTextResult("没有找到相关记忆。");
				}

				const memoryList = memories.map((memory, index) => `${index + 1}. ${memory}`).join("\n");
				return createTextResult(`找到 ${memories.length} 条相关记忆:\n${memoryList}`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return createTextResult(`读取记忆失败: ${message}`);
			} finally {
				clearTimeout(timeoutId);
			}
		},
	};
}
