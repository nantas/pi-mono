# OpenCode ToolResult 溢出问题设计方案

## 问题背景

在 Phase 8 测试中发现，`opencode.ts` 工具返回的 `toolResult` 文本可能非常长（包含完整的 CLI 输出：agent 推理、工具调用日志等），导致：
1. Discord API 返回 `BASE_TYPE_MAX_LENGTH` 错误
2. Pi-mom 消息发送失败，用户侧感知为 bot 无响应

## 设计目标

1. **保留完整日志**：将完整的 CLI 输出保存到文件系统，便于事后审计和问题排查
2. **控制返回长度**：只返回精简的 summary 给 Pi-mom Agent，避免 Discord API 长度限制
3. **零侵入目标工程**：日志文件存放在 `.mem0/` 目录下，不污染工程主体
4. **可靠提取**：通过 XML 标签机制确保 summary 可被稳定解析

## 设计方案

### 1. 执行日志存储 (Log Storage)

`opencode.ts` 在接收到完整的 stdout/stderr 后，将其写入文件系统：

- **存储路径**：目标工程下的 `.mem0/logs/opencode-{timestamp}.log`
- **写入机制**：使用 Node.js 的 `fs/promises` 异步写入
- **文件格式**：纯文本，包含完整的 stdout + stderr

```
{project_dir}/
├── .mem0/
│   ├── project.json
│   └── logs/
│       ├── opencode-1708123456789.log
│       └── opencode-1708123456790.log
└── src/
```

### 2. Prompt 注入与 XML 约束

在 `wrappedPrompt` 中追加明确的格式约束指令：

```typescript
const wrappedPrompt =
	"【强制指令】请先使用 Skill 工具加载 mem0-project-memory 技能获取关于该项目的记忆和架构决策。\n" +
	"【总结指令】在完成所有编码和执行任务后，请务必在你的最终回复中使用 <summary>...</summary> 标签包裹一段简短的执行总结（包括关键修改、文件变更和后续建议）。\n" +
	"===== 实际任务 =====\n" + args.prompt;
```

**Summary 内容建议包含**：
- 任务完成状态
- 关键文件变更列表
- 遇到的问题及解决方案
- 后续建议（如有）

### 3. XML Summary 提取逻辑

在 CLI 执行完成后，从完整的 stdout 中提取 `<summary>...</summary>` 内容：

```typescript
function extractSummary(output: string): string | null {
	const match = output.match(/<summary>([\s\S]*?)<\/summary>/i);
	return match ? match[1].trim() : null;
}
```

**处理逻辑**：
- 匹配成功 → 返回提取的 summary
- 匹配失败 → fallback 到截取输出尾部（最后 500 字符）

### 4. Tool Return 值重构

修改 `opencode.ts` 的返回值结构：

```typescript
interface OpencodeResult {
	content: [{ type: "text"; text: string }];
	details: {
		logPath: string;        // 相对路径，如 ".mem0/logs/opencode-xxx.log"
		fullOutputLength: number;
	};
}
```

**返回示例**：

```typescript
// 成功且有 summary
return {
	content: [{ type: "text", text: summary }],
	details: { logPath: ".mem0/logs/opencode-1708123456789.log", fullOutputLength: 15234 }
};

// 无 summary，fallback 截断
return {
	content: [{ type: "text", text: truncateText(output, 500) }],
	details: { logPath: ".mem0/logs/opencode-1708123456789.log", fullOutputLength: 15234 }
};
```

## 数据流

```
Pi-mom Agent
    │
    ▼ opencode(project_dir, prompt)
┌─────────────────────────────────────────────┐
│  opencode.ts                                │
│  1. 注入 summary 指令到 prompt              │
│  2. 执行 opencode CLI                       │
│  3. 捕获完整 stdout/stderr                  │
│  4. 写入 .mem0/logs/opencode-xxx.log        │
│  5. 提取 <summary> 内容                     │
│  6. 返回 summary + logPath                  │
└─────────────────────────────────────────────┘
    │
    ▼ { content: summary, details: { logPath, length } }
Pi-mom Agent (收到精简结果)
    │
    ▼ 发送 Discord 消息（长度受控）
```

## 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| CLI 未生成 summary | Fallback 到截取最后 500 字符 |
| CLI 执行失败 (code !== 0) | 抛出异常，包含截断后的错误信息 |
| 日志目录不存在 | 自动创建 `.mem0/logs/` 目录 |
| 日志写入失败 | 非阻塞，记录警告但继续返回结果 |

## 实现文件

- `packages/mom/src/tools/opencode.ts`

## 测试验证

1. **正常流程**：执行短任务，验证 summary 提取和日志写入
2. **长输出**：执行产生大量输出的任务，验证 Discord 消息正常发送
3. **无 summary**：模拟 CLI 未遵守指令，验证 fallback 行为
4. **失败场景**：模拟 CLI 执行失败，验证错误信息返回

## 后续优化（可选）

1. **日志清理策略**：定期清理 `.mem0/logs/` 中过旧的日志文件
2. **日志查看工具**：为 Pi-mom 添加 `read_opencode_log` 工具，按需读取完整日志
3. **Summary 长度上限**：如果 summary 本身过长，也需要截断处理
