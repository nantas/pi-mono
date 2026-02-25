import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodeTool } from "../opencode.js";

describe("opencode notification", () => {
	let tempDir: string;
	let workspaceDir: string;
	let projectDir: string;
	let mockExecutor: any;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "opencode-test-"));
		workspaceDir = join(tempDir, "workspace");
		projectDir = join(tempDir, "project");
		mkdirSync(workspaceDir, { recursive: true });
		mkdirSync(projectDir, { recursive: true });
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
		const tool = createOpenCodeTool(mockExecutor, workspaceDir);
		const eventsDir = join(workspaceDir, "events");

		await tool.execute("test-call", {
			project_dir: projectDir,
			prompt: "test prompt",
			notifyOnComplete: true,
			resultSummary: "Test summary",
			channelId: "C123",
			workspaceDir,
		});

		const eventFiles = readdirSync(eventsDir).filter((f) => f.startsWith("opencode-"));
		expect(eventFiles.length).toBe(1);

		const eventContent = JSON.parse(readFileSync(join(eventsDir, eventFiles[0]), "utf-8"));
		expect(eventContent.type).toBe("immediate");
		expect(eventContent.channelId).toBe("C123");
		expect(eventContent.text).toContain("Test summary");
	});

	it("should not create event file when notifyOnComplete is false", async () => {
		const tool = createOpenCodeTool(mockExecutor, workspaceDir);
		const eventsDir = join(workspaceDir, "events");

		await tool.execute("test-call", {
			project_dir: projectDir,
			prompt: "test prompt",
			notifyOnComplete: false,
			resultSummary: "Test summary",
			channelId: "C123",
			workspaceDir,
		});

		expect(existsSync(eventsDir)).toBe(false);
	});

	it("should not create event file when notifyOnComplete is not provided", async () => {
		const tool = createOpenCodeTool(mockExecutor, workspaceDir);
		const eventsDir = join(workspaceDir, "events");

		await tool.execute("test-call", {
			project_dir: projectDir,
			prompt: "test prompt",
		});

		expect(existsSync(eventsDir)).toBe(false);
	});

	it("should write opencode logs to workspace and not project_dir", async () => {
		const tool = createOpenCodeTool(mockExecutor, workspaceDir);

		await tool.execute("test-call", {
			project_dir: projectDir,
			prompt: "test prompt",
		});

		const workspaceLogsDir = join(workspaceDir, ".mem0", "logs");
		const projectLogsDir = join(projectDir, ".mem0", "logs");

		expect(existsSync(workspaceLogsDir)).toBe(true);
		const logFiles = readdirSync(workspaceLogsDir).filter((f) => f.startsWith("opencode-") && f.endsWith(".log"));
		expect(logFiles.length).toBe(1);
		expect(existsSync(projectLogsDir)).toBe(false);
	});

	it("should create event on task failure when notifyOnComplete is true", async () => {
		mockExecutor.exec.mockResolvedValueOnce({
			stdout: "",
			stderr: "Error occurred",
			code: 1,
		});

		const tool = createOpenCodeTool(mockExecutor, workspaceDir);
		const eventsDir = join(workspaceDir, "events");

		try {
			await tool.execute("test-call", {
				project_dir: projectDir,
				prompt: "test prompt",
				notifyOnComplete: true,
				resultSummary: "Test summary",
				channelId: "C123",
				workspaceDir,
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
