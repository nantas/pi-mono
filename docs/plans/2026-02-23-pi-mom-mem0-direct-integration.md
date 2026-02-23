# Pi-mom 直接集成 Mem0 工作流设计

## 问题背景

当前 pi-mom 仅通过 `opencode` 工具间接使用 mem0，限制了 pi-mom 的记忆能力。需要让 pi-mom 能够直接调用 mem0 API，在以下场景自动触发记忆：

- 用户说"记住"、"记录下来"、"别忘了"
- 对话中有重大设计决策、架构选择
- 新发现的工作流或最佳实践
- 用户偏好或配置信息

## 设计方案

### 1. mem0 工具参数设计

```typescript
const mem0Schema = Type.Object({
    action: Type.Union([
        Type.Literal("write"),
        Type.Literal("read"),
        Type.Literal("search"),
    ], { description: "操作类型" }),
    content: Type.Optional(Type.String({ description: "记忆内容 (write 时必需)" })),
    query: Type.Optional(Type.String({ description: "搜索查询 (read/search 时使用)" })),
    project_dir: Type.Optional(Type.String({ description: "关联项目路径，用于作用域隔离" })),
    scope: Type.Optional(Type.String({ description: "记忆作用域：user/agent/project，默认 user" })),
});
```

**三种操作**：
- `write`: 写入新记忆
- `read`: 读取相关记忆（基于 query）
- `search`: 搜索记忆（更宽泛的查询）

**作用域隔离**：
- `user`: 用户级偏好、配置（默认）
- `agent`: pi-mom 专属经验
- `project`: 项目级知识（需要 project_dir）

### 2. 触发机制与系统提示词指导

在 `agent.ts` 的系统提示词中添加 mem0 工具使用指南：

```markdown
## Memory (mem0)

mem0 是长期记忆系统，用于存储重要信息以供后续对话参考。

### 何时写入记忆 (action=write)
- 用户明确说"记住"、"记录下来"、"别忘了"
- 重大设计决策或架构选择
- 新发现的工作流或最佳实践
- 用户偏好或配置信息
- 项目关键信息（技术栈、目录结构、依赖版本）

### 何时读取记忆 (action=read/search)
- 开始新任务时，检查是否有相关记忆
- 用户询问历史决策或偏好
- 需要延续之前对话的上下文

### 作用域选择
- `user`: 用户偏好、通用配置（默认）
- `agent`: pi-mom 自身的工作经验
- `project`: 项目级知识（需提供 project_dir）
```

**关键设计**：让 pi-mom **自主判断**何时需要记忆，而非硬编码触发规则。

### 3. API 调用实现

**写入 (POST /memories)**:
```typescript
await fetch(`${MEM0_URL}/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        messages: [{ role: "user", content }],
        agent_id: scope === "agent" ? "pi-mom" : `pi-mom-${scope}`,
        user_id: "nantas",
        metadata: project_dir ? { project_root: project_dir } : undefined,
        async_processing: true,
    }),
});
```

**读取/搜索 (GET /memories)**:
```typescript
await fetch(`${MEM0_URL}/memories?text=${encodeURIComponent(query)}&agent_id=${agentId}&limit=5`);
```

### 4. 需要修改的文件

| 文件 | 操作 | 内容 |
|------|------|------|
| `packages/mom/src/tools/mem0.ts` | 新建 | mem0 工具实现 |
| `packages/mom/src/tools/index.ts` | 修改 | 注册 mem0 工具 |
| `packages/mom/src/agent.ts` | 修改 | 系统提示词添加 mem0 指南 |
| `/Users/nantas-agent/.pi/mom/discord-prod/data/MEMORY.md` | 修改 | 更新记忆指南 |

### 5. 验收标准

- [ ] pi-mom 能响应"记住 xxx"并写入 mem0
- [ ] pi-mom 能在对话中读取之前存储的记忆
- [ ] 记忆按作用域隔离（user/agent/project）
- [ ] 不影响现有 opencode 工具的 mem0 集成

## 技术细节

### agent_id 命名规范

| scope | agent_id | 用途 |
|-------|----------|------|
| user | `pi-mom-user` | 用户偏好、通用配置 |
| agent | `pi-mom` | pi-mom 自身工作经验 |
| project | `pi-mom-project` | 项目级知识（配合 metadata.project_root） |

### 错误处理

- mem0 服务不可用时：记录警告，返回友好错误信息，不阻塞对话
- 网络超时：设置 5 秒超时，异步写入不阻塞响应

### 与 opencode 工具的关系

- opencode 工具使用 `agent_id: "opencode"` 写入记忆
- pi-mom 直接使用 `agent_id: "pi-mom-*"` 写入记忆
- 两者记忆池独立，通过 agent_id 隔离
- opencode 可通过 `mem0-project-memory` skill 读取 pi-mom 写入的项目记忆（跨 Agent 知识继承）
