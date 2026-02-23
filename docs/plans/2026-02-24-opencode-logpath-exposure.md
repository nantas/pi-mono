# ADR: OpenCode 返回内容追加日志路径提示

## 背景

当前 `opencode` 工具的返回文本只包含 `summaryText`，日志路径仅存在于 `details.logPath`。
在实际链路中，LLM 主要消费 `content` 文本，无法直接感知日志文件位置，导致在需要完整输出时重复调用 `opencode`，增加耗时和冗余执行。

## 决策

在 `packages/mom/src/tools/opencode.ts` 的成功返回分支中，
将返回文本从仅 `summaryText` 调整为在末尾追加日志路径提示：

```ts
const textWithLogHint = `${summaryText}\n\n---\n[完整日志: ${logPath}]`;
return { content: [{ type: "text", text: textWithLogHint }], details };
```

## 影响

1. LLM 在读取 `content` 时即可获得日志路径提示。
2. 当需要完整输出时，LLM 可直接使用 `read` 工具读取对应日志文件，减少重复调用 `opencode`。
3. 保留 `details.logPath` 结构，不影响现有依赖 `details` 的调用方。
