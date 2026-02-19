# pi-mom 技术手册

## 目录

1. [架构概述](#架构概述)
2. [核心接口](#核心接口)
3. [平台适配器](#平台适配器)
4. [消息流程](#消息流程)
5. [数据存储](#数据存储)
6. [事件系统](#事件系统)
7. [Agent 集成](#agent-集成)
8. [排查指南](#排查指南)

---

## 架构概述

```
                    ┌─────────────────────────────────────┐
                    │             main.ts                 │
                    │  - 平台检测 (detectPlatform)        │
                    │  - 初始化 SlackBot / DiscordBot     │
                    │  - MomHandler 实现                  │
                    └──────────────┬──────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    slack.ts     │    │   discord.ts    │    │   events.ts    │
│   (SlackBot)   │    │  (DiscordBot)   │    │ (EventsWatcher) │
│                 │    │                 │    │                 │
│ - Socket Mode  │    │ - Gateway API   │    │ - Cron 调度    │
│ - Web API      │    │ - Message API  │    │ - 文件监控     │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                     │                      │
         └─────────────────────┼──────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   types.ts          │
                    │  (BotAdapter)       │
                    │  (BotContext)       │
                    │  (BotEvent)         │
                    └─────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     agent.ts        │
                    │  (AgentRunner)      │
                    │  - pi-agent-core    │
                    │  - pi-coding-agent  │
                    └─────────────────────┘
```

### 启动流程

```
main.ts
  │
  ├─→ detectPlatform()        // 检测平台
  │     ├─ MOM_DISCORD_TOKEN  → discord
  │     └─ MOM_SLACK_*        → slack
  │
  ├─→ validateSandbox()       // 验证 Docker
  │
  ├─→ new SlackBot() / createDiscordBot()
  │     └─→ bot.start()
  │           ├─ 连接平台 API
  │           ├─ fetchGuildsAndChannels()  // Discord
  │           └─ backfillAllChannels()    // Slack
  │
  └─→ createEventsWatcher()
        └─→ watcher.start()   // 启动事件监控
```

---

## 核心接口

### BotAdapter (`types.ts:81-95`)

所有平台适配器必须实现此接口：

```typescript
interface BotAdapter {
  // 用户/频道信息
  getUser(userId: string): BotUserInfo | undefined;
  getChannel(channelId: string): BotChannelInfo | undefined;
  getAllUsers(): BotUserInfo[];
  getAllChannels(): BotChannelInfo[];

  // 消息操作
  postMessage(channel: string, text: string): Promise<string>;      // 返回 messageId
  updateMessage(channel: string, ts: string, text: string): Promise<void>;
  deleteMessage(channel: string, ts: string): Promise<void>;
  postInThread(channel: string, threadTs: string, text: string): Promise<string>;

  // 文件操作
  uploadFile(channel: string, filePath: string, title?: string): Promise<void>;

  // 日志
  logToFile(channel: string, entry: object): void;
  logBotResponse(channel: string, text: string, ts: string): void;

  // 事件队列
  enqueueEvent(event: BotEvent): boolean;

  // 启动
  start(): Promise<void>;
}
```

### BotHandler (`types.ts:71-75`)

由 main.ts 实现，处理消息事件：

```typescript
interface BotHandler {
  isRunning(channelId: string): boolean;
  handleEvent(event: BotEvent, bot: BotAdapter, isEvent?: boolean): Promise<void>;
  handleStop(channelId: string, bot: BotAdapter): Promise<void>;
}
```

### BotContext (`types.ts:45-65`)

传递给 Agent 的上下文，包含消息方法和平台信息：

```typescript
interface BotContext {
  message: {
    text: string;           // 清理后的文本
    rawText: string;        // 原始文本
    user: string;           // 用户 ID
    userName?: string;      // 用户名
    channel: string;        // 频道 ID
    ts: string;             // 消息 timestamp
    attachments: Array<{ local: string }>;
  };
  channelName?: string;
  channels: BotChannelInfo[];
  users: BotUserInfo[];

  // 响应方法
  respond(text: string, shouldLog?: boolean): Promise<void>;
  replaceMessage(text: string): Promise<void>;
  respondInThread(text: string): Promise<void>;
  setTyping(isTyping: boolean): Promise<void>;
  uploadFile(filePath: string, title?: string): Promise<void>;
  setWorking(working: boolean): Promise<void>;
  deleteMessage(): Promise<void>;
}
```

---

## 平台适配器

### 平台检测 (`main.ts:30-38`)

```typescript
function detectPlatform(): Platform {
  if (MOM_DISCORD_TOKEN) return "discord";
  if (MOM_SLACK_APP_TOKEN && MOM_SLACK_BOT_TOKEN) return "slack";
  // 无效配置则退出
}
```

### DiscordBot (`discord.ts`)

**连接方式**: Discord Gateway (WebSocket)

**必需 Intents**:
- `GatewayIntentBits.Guilds` - 服务器信息
- `GatewayIntentBits.GuildMessages` - 服务器消息
- `GatewayIntentBits.GuildMessageTyping` - 打字状态
- `GatewayIntentBits.DirectMessages` - 私信
- `GatewayIntentBits.DirectMessageTyping` - 私信打字状态
- `GatewayIntentBits.MessageContent` - **消息内容** (必启!)

**消息处理流程** (`discord.ts:234-282`):

```
messageCreate 事件
    │
    ├─→ 跳过: bot 自己的消息 (message.author.id === botUserId)
    ├─→ 跳过: 启动前的消息 (createdTimestamp < startupTime)
    │
    ├─→ 判断: DM 或 @mention
    │     ├─ DM (channel.type === 1) → 处理
    │     └─ 频道 → 检查 isMentioned (mentions.users.has(botUserId))
    │
    ├─→ 构建 BotEvent
    │     ├─ type: "dm" | "mention"
    │     ├─ channel: channelId
    │     ├─ ts: message.id
    │     ├─ user: message.author.id
    │     ├─ text: cleanMentions(content)
    │     └─ files: attachments
    │
    ├─→ logUserMessage() → 写入 log.jsonl
    │
    ├─→ 检查 "stop" 命令
    │
    ├─→ 检查 isRunning
    │     ├─ true → "_Already working..."
    │     └─ false → enqueue to ChannelQueue
    │
    └─→ ChannelQueue 处理
          └─→ handler.handleEvent(event, bot)
```

**用户/频道缓存** (`discord.ts:342-381`):

启动时调用 `fetchGuildsAndChannels()`:
1. 获取所有 guild
2. 获取每个 guild 的 text channels
3. 获取每个 guild 的 members (非 bot)

缓存格式:
- Channel: `{ id, name: "guildName/channelName" }`
- User: `{ id, userName, displayName }`

### SlackBot (`slack.ts`)

**连接方式**: Socket Mode (WebSocket) + Web API

**消息处理**: 
- `app_mention` 事件 (频道 @mention)
- `message` 事件 (DM + 日志)

---

## 消息流程

### 完整处理链

```
用户发送消息
    │
    ▼
平台适配器 (SlackBot/DiscordBot)
    │
    ├─→ handleMessage()
    │     ├─→ 构建 BotEvent
    │     ├─→ logToFile(log.jsonl)
    │     └─→ ChannelQueue.enqueue()
    │
    ▼
MomHandler.handleEvent()
    │
    ├─→ getState(channelId)
    │     └─→ 创建/获取 ChannelState
    │
    ├─→ createBotContext()
    │     └─→ 构建 BotContext
    │
    ├─→ ctx.setTyping(true)
    │     └─→ bot.postMessage() → "Thinking..."
    │
    ├─→ state.runner.run(ctx, store)
    │     │
    │     ├─→ syncLogToSessionManager()    // 同步 log.jsonl → context.jsonl
    │     │
    │     ├─→ session.prompt()             // 调用 LLM
    │     │
    │     ├─→ 工具执行循环
    │     │     ├─ tool_execution_start
    │     │     ├─ ctx.respond("→ " + toolName)     // 主消息
    │     │     ├─ ctx.respondInThread(args + result) // 线程详情
    │     │     └─ tool_execution_end
    │     │
    │     └─→ message_end
    │           └─→ ctx.replaceMessage(finalText)
    │
    ├─→ ctx.setWorking(false)
    │
    └─→ ctx.respondInThread(usageSummary)
```

### 消息队列 (`ChannelQueue`)

每个频道一个队列，最大 5 个待处理事件：

```typescript
class ChannelQueue {
  private queue: QueuedWork[] = [];
  private processing = false;

  enqueue(work: QueuedWork): void {
    this.queue.push(work);
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    const work = this.queue.shift()!;
    try {
      await work();
    } catch (err) {
      log.logWarning("Queue error", err.message);
    }
    this.processing = false;
    this.processNext();
  }
}
```

---

## 数据存储

### 工作目录结构

```
<working-dir>/
├── MEMORY.md              # 全局记忆 (所有频道共享)
├── settings.json          # 全局设置
├── skills/               # 全局技能
│   └── <skill-name>/
│       ├── SKILL.md
│       └── *.sh / *.js
├── events/               # 定时事件
│   └── *.json
└── <channel-id>/         # 每个频道一个目录
    ├── MEMORY.md         # 频道记忆
    ├── log.jsonl         # 原始消息日志
    ├── context.jsonl     # LLM 上下文
    ├── last_prompt.jsonl # 调试: 最后一次 prompt
    ├── attachments/       # 用户上传的附件
    ├── scratch/          # Agent 工作目录
    └── skills/           # 频道技能
```

### log.jsonl 格式

```json
{"date":"2025-02-14T10:00:00.000Z","ts":"1234567890.123","user":"U123456","userName":"username","displayName":"Display Name","text":"message text","attachments":[],"isBot":false}
{"date":"2025-02-14T10:00:01.000Z","ts":"1234567891.456","user":"bot","text":"response","attachments":[],"isBot":true}
```

### context.jsonl 格式

Agent 消息格式 (包含 tool_result):

```json
{"role":"user","content":"[timestamp] [username]: message","timestamp":1234567890}
{"role":"assistant","content":[{"type":"tool_use","id":"tool_1","name":"bash","input":{"command":"ls","label":"List files"}}]}
{"role":"tool_result","tool_use_id":"tool_1","content":"file1.txt\nfile2.txt"}
```

---

## 事件系统

### EventsWatcher (`events.ts`)

监控 `events/` 目录，触发定时任务：

```typescript
class EventsWatcher {
  private timers = new Map<string, NodeJS.Timeout>();    // one-shot
  private crons = new Map<string, Cron>();               // periodic
  private debounceTimers = new Map<string, Timeout>();   // 文件防抖

  start(): void {
    // 扫描现有文件
    this.scanExisting();
    // 监听目录变化
    this.watcher = watch(this.eventsDir, ...);
  }
}
```

### 事件类型

| 类型 | 字段 | 触发时机 |
|------|------|----------|
| immediate | - | 文件创建时 |
| one-shot | `at` (ISO 8601) | 指定时间 |
| periodic | `schedule` (cron), `timezone` | Cron 表达式 |

### 事件文件格式

```json
{"type":"immediate","channelId":"123456789","text":"内容"}
{"type":"one-shot","channelId":"123456789","text":"提醒","at":"2025-02-15T09:00:00+08:00"}
{"type":"periodic","channelId":"123456789","text":"检查","schedule":"0 9 * * 1-5","timezone":"Asia/Shanghai"}
```

### 事件触发流程

```
事件文件创建/修改
    │
    ▼
EventsWatcher.handleFileChange()
    │
    ├─→ parseEvent() → 验证类型和字段
    │
    ├─→ schedule
    │     ├─ immediate → execute() 立即执行
    │     ├─ one-shot  → setTimeout 延迟执行
    │     └─ periodic  → Cron 调度
    │
    ▼
execute()
    │
    ├─→ 构建合成消息: "[EVENT:filename:type:schedule] text"
    │
    ├─→ 创建 BotEvent
    │     ├─ type: "mention"
    │     ├─ channel: event.channelId
    │     ├─ user: "EVENT"
    │     └─ text: "[EVENT:...] ..."
    │
    ├─→ bot.enqueueEvent(event)
    │
    └─→ 删除事件文件 (immediate/one-shot)
```

---

## Agent 集成

### AgentRunner (`agent.ts`)

```typescript
interface AgentRunner {
  run(
    ctx: BotContext,           // 平台无关的上下文
    store: ChannelStore,
    pendingMessages?: PendingMessage[]
  ): Promise<{
    stopReason: string;        // "stop" | "end_turn" | "max_turns" | "aborted" | "error"
    errorMessage?: string;
  }>;
  abort(): void;
}
```

### System Prompt 构建 (`agent.ts:141-328`)

```typescript
function buildSystemPrompt(
  workspacePath: string,
  channelId: string,
  memory: string,
  sandboxConfig: SandboxConfig,
  channels: BotChannelInfo[],
  users: BotUserInfo[],
  skills: Skill[]
): string
```

包含:
- 格式化说明 (Markdown)
- 频道/用户映射
- 环境描述 (Docker/Host)
- 工作目录布局
- 技能列表
- 事件系统说明
- 记忆说明
- 日志查询示例

---

## 排查指南

### 常见问题

#### 1. Bot 没连接

**症状**: 启动后无响应

**排查**:
```bash
# 检查日志输出
mom --sandbox=docker:mom-sandbox ./data 2>&1

# Discord: 检查 Message Content Intent 是否启用
# Slack: 检查 Socket Mode 是否启用
```

#### 2. 消息未处理

**症状**: 用户发送消息，bot 无响应

**排查**:
```bash
# Discord: 检查 @mention 解析
# 确认 bot 已在服务器中

# 检查日志
cat <working-dir>/<channel-id>/log.jsonl
```

#### 3. 事件未触发

**症状**: 定时任务不执行

**排查**:
```bash
# 检查事件文件格式
cat <working-dir>/events/*.json

# 检查 cron 语法
# one-shot 需要时区: "2025-02-15T09:00:00+08:00"
# periodic 需要 timezone: "Asia/Shanghai"
```

#### 4. 工具执行失败

**症状**: Agent 提示工具错误

**排查**:
```bash
# 检查 sandbox 是否运行
docker ps | grep mom-sandbox

# 检查工作目录权限
ls -la <working-dir>/<channel-id>/scratch/
```

### 日志位置

| 日志 | 位置 |
|------|------|
| 控制台输出 | stdout |
| 消息日志 | `<working-dir>/<channel-id>/log.jsonl` |
| LLM 上下文 | `<working-dir>/<channel-id>/context.jsonl` |
| 最后 prompt | `<working-dir>/<channel-id>/last_prompt.jsonl` |

### 调试模式

```bash
# 查看最后发送给 LLM 的内容
cat <working-dir>/<channel-id>/last_prompt.jsonl | jq
```

---

## 环境变量

| 变量 | 必填 | 描述 |
|------|------|------|
| `MOM_DISCORD_TOKEN` | Discord | Discord Bot Token |
| `MOM_SLACK_APP_TOKEN` | Slack | Slack App-Level Token (xapp-...) |
| `MOM_SLACK_BOT_TOKEN` | Slack | Slack Bot Token (xoxb-...) |
| `ANTHROPIC_API_KEY` | 可选 | Anthropic API Key |

优先级: `MOM_DISCORD_TOKEN` > `MOM_SLACK_*`
