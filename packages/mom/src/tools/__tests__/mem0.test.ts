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
		expect(extractText(result)).toBe("已写入记忆。");
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
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:7889/search?text=memory&agent_id=pi-mom-user&limit=5",
			expect.any(Object),
		);
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
