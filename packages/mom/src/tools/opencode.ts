import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { Executor } from "../sandbox.js";

const opencodeSchema = Type.Object({
	project_dir: Type.String({ description: "Target project absolute path" }),
	prompt: Type.String({ description: "Specific code task description" }),
	architectural_decisions: Type.Optional(
		Type.String({ description: "Project-level architectural decisions or context preferences to pass to sub-agent" }),
	),
});

interface OpencodeArgs {
	project_dir: string;
	prompt: string;
	architectural_decisions?: string;
}

async function writeMemory(projectDir: string, content: string): Promise<void> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		const response = await fetch("http://localhost:8000/memories", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messages: [{ role: "user", content }],
				agent_id: "opencode",
				user_id: "nantas",
				metadata: { project_root: projectDir },
				async_processing: true,
			}),
			signal: controller.signal,
		});
		clearTimeout(timeoutId);

		const data = (await response.json()) as { task_id?: string };
		if (data.task_id) {
			pollTaskStatus(data.task_id);
		}
	} catch {
		// Non-blocking, ignore errors
	}
}

async function pollTaskStatus(taskId: string): Promise<void> {
	const maxAttempts = 10;
	const interval = 2000;

	for (let i = 0; i < maxAttempts; i++) {
		await new Promise((resolve) => setTimeout(resolve, interval));
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 5000);

			const response = await fetch(`http://localhost:8000/memories/tasks/${taskId}`, {
				signal: controller.signal,
			});
			clearTimeout(timeoutId);

			const data = (await response.json()) as { status?: string };
			if (data.status === "completed" || data.status === "failed") {
				return;
			}
		} catch {
			return;
		}
	}
}

function escapePrompt(prompt: string): string {
	return prompt.replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export function createOpenCodeTool(executor: Executor): AgentTool<typeof opencodeSchema> {
	return {
		name: "opencode",
		label: "opencode",
		description:
			"Delegate coding tasks to OpenCode CLI. Use this to offload implementation tasks to a sub-agent with proper context.",
		parameters: opencodeSchema,
		execute: async (_toolCallId: string, args: OpencodeArgs, _signal?: AbortSignal) => {
			if (args.architectural_decisions && args.architectural_decisions.trim().length > 0) {
				await writeMemory(args.project_dir, args.architectural_decisions);
			}

			const wrappedPrompt =
				"【强制指令】请先使用 Skill 工具加载 mem0-project-memory 技能获取关于该项目的记忆和架构决策。请务必遵循。===== 实际任务 =====\n" +
				args.prompt;

			const command = `opencode run --dir "${args.project_dir}" --agent cli "${escapePrompt(wrappedPrompt)}"`;

			const result = await executor.exec(command);

			let output = "";
			if (result.stdout) output += result.stdout;
			if (result.stderr) {
				if (output) output += "\n";
				output += result.stderr;
			}

			if (result.code !== 0) {
				throw new Error(`${output}\n\nCommand exited with code ${result.code}`.trim());
			}

			return { content: [{ type: "text", text: output || "(completed)" }], details: undefined };
		},
	};
}
