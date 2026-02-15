# Mom Discord Environment Runbook

This runbook defines the canonical environment layout for running Mom with Discord in development and production.

## Directory Model

Use the following directory structure:

| Environment | Data Directory | Container Name |
|-------------|----------------|----------------|
| Development | `~/.pi/mom/discord-dev` | `mom-sandbox-discord-dev` |
| Production | `~/.pi/mom/discord-prod` | `mom-sandbox-discord-prod` |

## Container Setup Rule

When running Mom in Docker mode, the `-v` host path **must equal** the working directory argument passed to `mom`:

```bash
# For development
docker rm -f mom-sandbox-discord-dev || true
docker run -d \
  --name mom-sandbox-discord-dev \
  -v ~/.pi/mom/discord-dev:/workspace \
  alpine:latest \
  tail -f /dev/null

mom --sandbox=docker:mom-sandbox-discord-dev ~/.pi/mom/discord-dev

# For production
docker rm -f mom-sandbox-discord-prod || true
docker run -d \
  --name mom-sandbox-discord-prod \
  --restart unless-stopped \
  -v ~/.pi/mom/discord-prod:/workspace \
  alpine:latest \
  tail -f /dev/null

mom --sandbox=docker:mom-sandbox-discord-prod ~/.pi/mom/discord-prod
```

## Security Rule

**Never store persistent Mom data inside a repository working tree.**

All Mom persistent workspace data (conversation logs, memory files, custom skills, credentials) must reside in `~/.pi/mom/`. This ensures:
- Data persists across repository clones/checkouts
- Sensitive credentials are not accidentally committed
- Multiple Mom instances (dev/prod) are fully isolated

> **Note**: Installed tools (packages, CLI tools via apk/apt/npm/etc.) persist in the container itself, tied to the container lifecycle. If you remove and recreate the container, you'll need to reinstall tools inside it.

## Quick Start

### Development

```bash
mkdir -p ~/.pi/mom/discord-dev

docker rm -f mom-sandbox-discord-dev || true
docker run -d \
  --name mom-sandbox-discord-dev \
  -v ~/.pi/mom/discord-dev:/workspace \
  alpine:latest \
  tail -f /dev/null

export MOM_DISCORD_TOKEN=your-dev-bot-token
export ANTHROPIC_API_KEY=sk-ant-...

mom --sandbox=docker:mom-sandbox-discord-dev ~/.pi/mom/discord-dev
```

### Production

```bash
mkdir -p ~/.pi/mom/discord-prod

docker rm -f mom-sandbox-discord-prod || true
docker run -d \
  --name mom-sandbox-discord-prod \
  --restart unless-stopped \
  -v ~/.pi/mom/discord-prod:/workspace \
  alpine:latest \
  tail -f /dev/null

export MOM_DISCORD_TOKEN=your-prod-bot-token
export ANTHROPIC_API_KEY=sk-ant-...

mom --sandbox=docker:mom-sandbox-discord-prod ~/.pi/mom/discord-prod
```
