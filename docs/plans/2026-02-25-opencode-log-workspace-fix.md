# ADR: 修复 OpenCode 工具日志落盘到 workspace

## 根因

`packages/mom/src/tools/opencode.ts` 中的 `writeExecutionLog` 使用 `args.project_dir` 作为日志根目录，
导致日志写入 `{project_dir}/.mem0/logs/`。

在 pi-mom 场景里，`project_dir` 是被委托项目目录（例如 `obsidian-mind`），
而不是 mom 自身 workspace，因此日志会错误落到调用方项目目录。

## 修复方案

按现有链路透传 `workspacePath`，不硬编码路径：

1. `agent.ts` 将 `workspacePath` 传给 `createMomTools(executor, workspacePath)`。
2. `createMomTools` 将 `workspaceDir` 继续传给 `createOpenCodeTool(executor, workspaceDir)`。
3. `createOpenCodeTool` 内部调用 `writeExecutionLog(workspaceDir, output)`。
4. `writeExecutionLog` 改为写入 `{workspaceDir}/.mem0/logs/`。

## 影响范围

- 仅影响 OpenCode 执行日志落盘目录。
- 不改变 `opencode run --dir "{project_dir}"` 的执行目录语义。
- 返回给上层的相对日志路径仍为 `.mem0/logs/<filename>`，兼容现有展示逻辑。

## 验证结果

### RED（旧实现预期失败）

命令：

`npx tsx ../../node_modules/vitest/dist/cli.js --run src/tools/__tests__/opencode-notification.test.ts`

结果：新增用例 `should write opencode logs to workspace and not project_dir` 失败，
失败点为 `existsSync(workspaceLogsDir) === false`。

### GREEN（修复后通过）

命令：

`npx tsx ../../node_modules/vitest/dist/cli.js --run src/tools/__tests__/opencode-notification.test.ts`

结果：5/5 通过，确认日志写入 workspace 且未写入 project_dir。

命令：

`npx tsx ../../node_modules/vitest/dist/cli.js --run src/__tests__/agent.test.ts`

结果：1/1 通过，确认工具装配链路改动未破坏 agent 基本测试。
