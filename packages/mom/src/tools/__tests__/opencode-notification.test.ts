import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodeTool } from "../opencode.js";

describe("opencode notification", () => {
	let tempDir: string;
	let mockExecutor: any;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "opencode-test-"));
		mockExecutor = {
			exec: vi.fn().mockResolvedValue({
				stdout: "Task completed successfully",
				stderr: "",
				code: 0,
			}),
		};
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("should create event file when notifyOnComplete is true", async () => {
		const tool = createOpenCodeTool(mockExecutor);
		const eventsDir = join(tempDir, "events");

		await tool.execute("test-call", {
			project_dir: "/test/project",
			prompt: "test prompt",
			notifyOnComplete: true,
			resultSummary: "Test summary",
			channelId: "C123",
			workspaceDir: tempDir,
		});

		const eventFiles = readdirSync(eventsDir).filter((f) => f.startsWith("opencode-"));
		expect(eventFiles.length).toBe(1);

		const eventContent = JSON.parse(readFileSync(join(eventsDir, eventFiles[0]), "utf-8"));
		expect(eventContent.type).toBe("immediate");
		expect(eventContent.channelId).toBe("C123");
		expect(eventContent.text).toContain("Test summary");
	});

	it("should not create event file when notifyOnComplete is false", async () => {
		const tool = createOpenCodeTool(mockExecutor);
		const eventsDir = join(tempDir, "events");

		await tool.execute("test-call", {
			project_dir: "/test/project",
			prompt: "test prompt",
			notifyOnComplete: false,
			resultSummary: "Test summary",
			channelId: "C123",
			workspaceDir: tempDir,
		});

		expect(existsSync(eventsDir)).toBe(false);
	});

	it("should not create event file when notifyOnComplete is not provided", async () => {
		const tool = createOpenCodeTool(mockExecutor);
		const eventsDir = join(tempDir, "events");

		await tool.execute("test-call", {
			project_dir: "/test/project",
			prompt: "test prompt",
		});

		expect(existsSync(eventsDir)).toBe(false);
	});

	it("should create event on task failure when notifyOnComplete is true", async () => {
		mockExecutor.exec.mockResolvedValueOnce({
			stdout: "",
			stderr: "Error occurred",
			code: 1,
		});

		const tool = createOpenCodeTool(mockExecutor);
		const eventsDir = join(tempDir, "events");

		try {
			await tool.execute("test-call", {
				project_dir: "/test/project",
				prompt: "test prompt",
				notifyOnComplete: true,
				resultSummary: "Test summary",
				channelId: "C123",
				workspaceDir: tempDir,
			});
		} catch (_e) {
			// Expected to throw
		}

		const eventFiles = readdirSync(eventsDir).filter((f) => f.startsWith("opencode-"));
		expect(eventFiles.length).toBe(1);

		const eventContent = JSON.parse(readFileSync(join(eventsDir, eventFiles[0]), "utf-8"));
		expect(eventContent.type).toBe("immediate");
		expect(eventContent.channelId).toBe("C123");
		expect(eventContent.text).toContain("Test summary");
		expect(eventContent.text).toContain("Error");
	});
});
