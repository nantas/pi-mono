# OpenCode 任务完成通知功能实现

## 日期
2026-02-21

## 目标
为 opencode tool 添加 `notifyOnComplete` 和 `resultSummary` 参数，任务完成后创建 ImmediateEvent 文件。

## 实现概述

### 1. 接口和类型定义
在 `packages/mom/src/tools/opencode.ts` 中添加了以下参数：

- `notifyOnComplete?: boolean` - 是否在任务完成时发送通知
- `resultSummary?: string` - 任务结果摘要，包含在通知消息中
- `channelId?: string` - 通知目标频道 ID
- `workspaceDir?: string` - 工作区目录，用于存储事件文件

### 2. 核心函数实现

#### createImmediateEvent 函数
```typescript
async function createImmediateEvent(
    channelId: string,
    text: string,
    workspaceDir: string
): Promise<void>
```

- 创建 `workspaceDir/events` 目录（如果不存在）
- 生成事件文件名：`opencode-{timestamp}.json`
- 事件 payload 结构：
```json
{
    "type": "immediate",
    "channelId": "C123",
    "text": "任务完成: ..."
}
```

#### truncateText 辅助函数
```typescript
function truncateText(text: string, maxLength: number): string
```
- 截断过长文本，并在末尾添加 `...`

### 3. 集成逻辑

在 `createOpenCodeTool` 的 `execute` 函数中：

1. **成功时**：如果 `notifyOnComplete=true`，创建成功事件
2. **失败时**：如果 `notifyOnComplete=true`，创建失败事件（包含错误信息）

事件创建失败会被静默忽略，不会影响主流程。

### 4. 测试

创建了 `packages/mom/src/tools/__tests__/opencode-notification.test.ts`，包含以下测试用例：

- `notifyOnComplete=true` 时创建事件文件
- `notifyOnComplete=false` 时不创建事件文件
- `notifyOnComplete` 未提供时不创建事件文件
- 任务失败时也创建事件文件

### 5. 配置更新

- 添加 `vitest` 依赖到 `packages/mom/package.json`
- 添加 `test` 脚本
- 创建 `vitest.config.ts` 配置文件

## 事件文件格式

文件路径：`{workspaceDir}/events/opencode-{timestamp}.json`

```json
{
    "type": "immediate",
    "channelId": "C123",
    "text": "Summary text\n\nResult: truncated output..."
}
```

## 使用示例

```typescript
await tool.execute("call-id", {
    project_dir: "/path/to/project",
    prompt: "Implement feature X",
    notifyOnComplete: true,
    resultSummary: "Feature X implementation completed",
    channelId: "C12345",
    workspaceDir: "/workspace/mom"
});
```

## 相关文件

- `packages/mom/src/tools/opencode.ts` - 主要实现
- `packages/mom/src/tools/__tests__/opencode-notification.test.ts` - 测试
- `packages/mom/vitest.config.ts` - 测试配置
- `packages/mom/package.json` - 依赖更新
