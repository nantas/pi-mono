import { afterEach, describe, expect, it, vi } from "vitest";
import { createMem0Tool } from "../mem0.js";

interface ToolTextResult {
	content: Array<{ type: string; text?: string }>;
}

function extractText(result: unknown): string {
	const content = (result as ToolTextResult).content;
	if (!Array.isArray(content) || content.length === 0) {
		throw new Error("Tool result does not include text content");
	}

	const text = content[0]?.text;
	if (!text) {
		throw new Error("Tool result has empty text");
	}

	return text;
}

describe("mem0 tool", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("writes memory successfully", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
		});
		vi.stubGlobal("fetch", fetchMock);

		const tool = createMem0Tool();
		const result = await tool.execute("call-id", {
			action: "write",
			content: "remember this",
			scope: "agent",
			project_dir: "/tmp/project",
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:7889/memories",
			expect.objectContaining({
				method: "POST",
				headers: { "Content-Type": "application/json" },
			}),
		);

		const fetchOptions = fetchMock.mock.calls[0]?.[1];
		const requestBody = JSON.parse((fetchOptions as RequestInit).body as string);
		expect(requestBody).toEqual({
			messages: [{ role: "user", content: "remember this" }],
			agent_id: "pi-mom",
			user_id: "nantas",
			metadata: { project_root: "/tmp/project" },
			async_processing: true,
		});
		expect(extractText(result)).toBe("已写入记忆。");
	});

	it("does not include agent_id for user scope write", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
		});
		vi.stubGlobal("fetch", fetchMock);

		const tool = createMem0Tool();
		await tool.execute("call-id", {
			action: "write",
			content: "remember user memory",
		});

		const fetchOptions = fetchMock.mock.calls[0]?.[1];
		const requestBody = JSON.parse((fetchOptions as RequestInit).body as string) as {
			agent_id?: string;
			messages: Array<{ role: string; content: string }>;
			user_id: string;
			async_processing: boolean;
		};

		expect(requestBody.agent_id).toBeUndefined();
		expect(requestBody.messages).toEqual([{ role: "user", content: "remember user memory" }]);
		expect(requestBody.user_id).toBe("nantas");
		expect(requestBody.async_processing).toBe(true);
	});

	it("returns memories for read action", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({
				memories: [{ memory: "first memory" }, { memory: "second memory" }],
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const tool = createMem0Tool();
		const result = await tool.execute("call-id", {
			action: "read",
			query: "memory",
			project_dir: "/tmp/project",
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:7889/search",
			expect.objectContaining({
				method: "POST",
				headers: { "Content-Type": "application/json" },
			}),
		);

		const fetchOptions = fetchMock.mock.calls[0]?.[1];
		const requestBody = JSON.parse((fetchOptions as RequestInit).body as string);
		expect(requestBody).toEqual({
			query: "memory",
			user_id: "nantas",
			filters: { project_root: "/tmp/project" },
		});
		expect(extractText(result)).toBe("找到 2 条相关记忆:\n1. first memory\n2. second memory");
	});

	it("returns friendly message when query is missing", async () => {
		const tool = createMem0Tool();
		const result = await tool.execute("call-id", {
			action: "search",
		});

		expect(extractText(result)).toContain("query is required for read/search action");
	});
});
