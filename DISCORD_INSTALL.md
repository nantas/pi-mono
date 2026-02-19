# pi-mom Discord 安装指南

## 前提条件

- Node.js 20+
- Docker
- Discord 账号

## 步骤 1: 创建 Discord Bot

1. 打开 https://discord.com/developers/applications
2. 点击 **New Application**，输入名称
3. 左侧点击 **Bot**
4. 点击 **Add Bot**
5. 在 **Privileged Gateway Intents** 下找到 **Message Content Intent**，点击启用
6. 点击 **Reset Token**，复制显示的 Token（这是 `MOM_DISCORD_TOKEN`）

## 步骤 2: 配置 OAuth2 权限

1. 左侧点击 **OAuth2** → **URL Generator**
2. 在 **Scopes** 勾选 `bot`
3. 在 **Bot Permissions** 勾选：
   - Read Messages/View Channels
   - Send Messages
   - Manage Messages
   - Read Message History
   - Attach Files
4. 复制生成的 URL，在浏览器打开并选择要添加的服务器

## 步骤 3: 安装 pi-mom

```bash
# 全局安装
npm install -g @mariozechner/pi-mom
```

或者使用本地开发版本（从你的 fork）：

```bash
cd pi-mono
npm install
cd packages/mom
npm run build
npm link
```

## 步骤 4: 启动 Docker 沙箱

```bash
docker run -d \
  --name mom-sandbox \
  -v $(pwd)/data:/workspace \
  alpine:latest \
  tail -f /dev/null
```

## 步骤 5: 设置环境变量

```bash
# Discord Bot Token（必填）
export MOM_DISCORD_TOKEN=你的bot-token

# Anthropic API Key（必填）
export ANTHROPIC_API_KEY=sk-ant-...
```

## 步骤 6: 启动 mom

```bash
mom --sandbox=docker:mom-sandbox ./data
```

## 使用方法

- 在 Discord 中 @你的 bot 或发 DM
- mom 会自动响应并执行命令
- 说 `stop` 可停止当前运行

## 工作目录结构

```
./data/
├── MEMORY.md                 # 全局记忆
├── settings.json             # 设置
├── skills/                  # 全局技能
├── events/                  # 定时事件
└── <channel-id>/           # 每个频道一个目录
    ├── MEMORY.md
    ├── log.jsonl
    ├── context.jsonl
    ├── attachments/
    └── scratch/
```

## 更新 mom

```bash
npm install -g @mariozechner/pi-mom
```

## 常见问题

**Q: bot 没反应？**
A: 检查是否启用了 Message Content Intent，以及 bot 是否在服务器上

**Q: 如何限制 bot 只在特定频道响应？**
A: 当前版本会响应所有频道的 @mention 和 DM

**Q: Docker 里的工具需要手动安装吗？**
A: 不需要，mom 会自动安装所需的工具
