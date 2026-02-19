# 🏖️ OSS Vacation

**Issue tracker and PRs reopen February 16, 2026.**

All PRs will be auto-closed until then. Approved contributors can submit PRs after vacation without reapproval. For support, join [Discord](https://discord.com/invite/3cU7Bz4UPx).

---

<p align="center">
  <a href="https://shittycodingagent.ai">
    <img src="https://shittycodingagent.ai/logo.svg" alt="pi logo" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://github.com/badlogic/pi-mono/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/badlogic/pi-mono/ci.yml?style=flat-square&branch=main" /></a>
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>

# Pi Monorepo

> **Looking for the pi coding agent?** See **[packages/coding-agent](packages/coding-agent)** for installation and usage.

Tools for building AI agents and managing LLM deployments.

## Packages

| Package | Description |
|---------|-------------|
| **[@mariozechner/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@mariozechner/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@mariozechner/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@mariozechner/pi-mom](packages/mom)** | Slack bot that delegates messages to the pi coding agent |
| **[@mariozechner/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
| **[@mariozechner/pi-web-ui](packages/web-ui)** | Web components for AI chat interfaces |
| **[@mariozechner/pi-pods](packages/pods)** | CLI for managing vLLM deployments on GPU pods |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).

## Development

```bash
npm install          # Install all dependencies
npm run build        # Build all packages
npm run check        # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run pi from sources (must be run from repo root)
```

> **Note:** `npm run check` requires `npm run build` to be run first. The web-ui package uses `tsc` which needs compiled `.d.ts` files from dependencies.

## License

MIT

---

## Pi-Mom Discord 生产环境配置

### 环境变量

创建 `~/.pi/mom/discord-prod/env.sh`：

```bash
export MOM_DISCORD_TOKEN='your-discord-bot-token'
export MINIMAX_CN_API_KEY='your-minimax-api-key'
```

### Docker 容器

```bash
docker rm -f mom-sandbox-discord-prod || true
docker run -d \
  --name mom-sandbox-discord-prod \
  --restart unless-stopped \
  -v ~/.pi/mom/discord-prod:/workspace \
  alpine:latest \
  tail -f /dev/null
```

### 启动服务 (launchd)

配置文件：`~/Library/LaunchAgents/com.pi.mom.discord.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pi.mom.discord</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/mom</string>
        <string>--sandbox=docker:mom-sandbox-discord-prod</string>
        <string>/Users/nantas-agent/.pi/mom/discord-prod/data</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/opt/homebrew/opt/node@24/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>MOM_DISCORD_TOKEN</key>
        <string>your-discord-bot-token</string>
        <key>MINIMAX_CN_API_KEY</key>
        <string>your-minimax-api-key</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/mom-prod.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/mom-prod.log</string>
    <key>WorkingDirectory</key>
    <string>/Users/nantas-agent/.pi/mom/discord-prod/data</string>
</dict>
</plist>
```

加载服务：

```bash
launchctl load ~/Library/LaunchAgents/com.pi.mom.discord.plist
```

### 服务管理命令

| 操作 | 命令 |
|------|------|
| 查看状态 | `launchctl list \| grep pi.mom` |
| 停止服务 | `launchctl unload ~/Library/LaunchAgents/com.pi.mom.discord.plist` |
| 启动服务 | `launchctl load ~/Library/LaunchAgents/com.pi.mom.discord.plist` |
| 重启服务 | 先 unload 再 load |
| 查看日志 | `tail -f /tmp/mom-prod.log` |

### 目录结构

```
~/.pi/mom/discord-prod/
├── env.sh              # 环境变量
├── data/               # 挂载到容器 /workspace
│   ├── settings.json   # 全局设置
│   ├── MEMORY.md       # 全局记忆
│   ├── events/         # 定时任务
│   ├── skills/         # 全局 skills
│   └── <channel-id>/   # 每个频道的独立数据
│       ├── MEMORY.md
│       ├── log.jsonl
│       ├── context.jsonl
│       ├── attachments/
│       ├── scratch/
│       └── skills/
```

### 挂载项目目录

如需让 mom 访问项目文件，在创建容器时添加挂载：

```bash
docker run -d \
  --name mom-sandbox-discord-prod \
  --restart unless-stopped \
  -v ~/.pi/mom/discord-prod:/workspace \
  -v ~/projects:/projects \
  alpine:latest \
  tail -f /dev/null
```

然后告诉 mom：`我的项目在 /projects/xxx`