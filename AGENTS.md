# Development Rules

## First Message
If the user did not give you a concrete task, read README.md, then ask which module(s) to work on. Read relevant README.md files: `packages/ai/`, `packages/tui/`, `packages/agent/`, `packages/coding-agent/`, `packages/mom/`, `packages/pods/`, `packages/web-ui/`.

## Commands
- `npm run check` - Lint/typecheck (Biome + TypeScript). Run after all code changes.
- `npm run test` - Run all tests
- Single test: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts` (run from package root)
- `npm run build` - Build all packages
- `npm run dev` - Run dev mode for all packages
- NEVER run: `npm run dev`, `npm run build`, `npm test` unless user instructs

## Code Style

### Formatting & Linting
- Biome with tab indent (3 spaces), 120 line width
- Run `biome check --write` before committing

### Types
- No `any` unless absolutely necessary
- Never remove/downgrade code to fix type errors from outdated deps; upgrade instead

### Imports
- NEVER use inline imports: no `await import()`, no `import("pkg").Type`, no dynamic imports for types
- Use standard top-level imports only

### Naming
- `camelCase` for variables, functions
- `PascalCase` for types, interfaces, classes
- `SCREAMING_SNAKE_CASE` for constants
- Prefix interfaces with `I` only when necessary (prefer descriptive names)

### Error Handling
- Use typed errors with meaningful messages
- Never swallow errors silently
- Prefer result types or try/catch with proper typing

### Keybindings
- Never hardcode key checks like `matchesKey(keyData, "ctrl+x")`
- All keybindings must be configurable via `DEFAULT_EDITOR_KEYBINDINGS` or `DEFAULT_APP_KEYBINDINGS`

## Testing
- Run tests from package root, not repo root
- Write tests alongside implementation; iterate until passing
- Never assume test framework - check package.json for available scripts

## Git Rules (Parallel Agents)

### Committing
- **ONLY commit files YOU changed** - use `git add <specific-paths>`
- NEVER use `git add -A` or `git add .`
- Include `fixes #<number>` in commit message when applicable

### Forbidden Commands
- `git reset --hard`, `git checkout .`, `git clean -fd` - destroy uncommitted changes
- `git stash` - stashes ALL changes including other agents' work
- `git commit --no-verify` - bypasses required checks

### Workflow
```bash
git status
git add packages/ai/src/file.ts
git commit -m "fix(ai): description"
git pull --rebase && git push
```

## GitHub Issues
- Read all comments: `gh issue view <number> --json title,body,comments,labels,state`
- Add `pkg:*` labels: `pkg:agent`, `pkg:ai`, `pkg:coding-agent`, `pkg:mom`, `pkg:pods`, `pkg:tui`, `pkg:web-ui`
- Include `fixes #<number>` in commit to close

## PR Workflow
- Analyze PRs without pulling locally
- If approved: create feature branch, pull PR, rebase on main, merge, push
- Never open PRs yourself

## Changelog
- Location: `packages/*/CHANGELOG.md`
- Use sections under `## [Unreleased]`: `### Breaking Changes`, `### Added`, `### Changed`, `### Fixed`, `### Removed`
- Append to existing subsections, never create duplicates
- Attribution: `Fixed foo bar ([#123](https://github.com/badlogic/pi-mono/issues/123))`

## Releasing
- Lockstep versioning: all packages share same version
- `npm run release:patch` - bug fixes/features
- `npm run release:minor` - breaking changes
- Update CHANGELOGs before releasing

## Adding LLM Provider (packages/ai)
Requires changes to: `src/types.ts`, `src/providers/*.ts`, `src/stream.ts`, `scripts/generate-models.ts`, `test/*.test.ts`, `src/core/model-resolver.ts`, `src/cli/args.ts`, README.md, CHANGELOG.md

## TUI Testing (tmux)
```bash
tmux new-session -d -s pi-test -x 80 -y 24
tmux send-keys -t pi-test "cd /path/to/pi-mono && ./pi-test.sh" Enter
sleep 3 && tmux capture-pane -t pi-test -p
tmux send-keys -t pi-test "prompt" Enter
tmux kill-session -t pi-test
```


## Mem0 Production Deployment

### Deploying Code Changes
1. **Stop & Clean**:
   ```bash
   docker compose -f server/docker-compose.prod.yaml down
   docker rmi mem0-prod-mem0:latest || true
   ```

2. **Rebuild & Start**:
   ```bash
   docker compose -f server/docker-compose.prod.yaml up -d --build --force-recreate
   ```

3. **Verify**:
   ```bash
   docker exec mem0-prod-mem0-1 grep "<expected_change>" /app/main.py
   ```

**IMPORTANT**: The production environment does NOT mount local source code. You MUST rebuild the image for changes to take effect.

## Style
- Keep answers concise
- No emojis in commits, issues, code
- Technical prose only, be kind but direct

## 上游同步工作流 (Upstream Sync Workflow)

本仓库基于官方 pi-mono (badlogic/pi-mono) 进行定制开发，遵循以下同步规范：

### 分支策略
- `main`: 只读分支，追踪 upstream/main 官方代码
- `nantas-dev`: 定制开发主分支，所有修改提交到此分支

### 同步流程（收到 'fetch upstream' 指令时执行）

1. **预检**: 切换到 main，执行 `git fetch upstream && git merge upstream/main`，再切回 nantas-dev 进行 dry-run 分析
2. **无冲突**: 直接合并，然后分析变更内容。如有接口/结构变化，必须更新本 AGENTS.md
3. **有冲突**: 暂停合并，用自然语言向 User 描述不同解决选项的影响，等待决策后执行
4. **回归测试**: 合并后运行构建和测试确保定制逻辑正常

### Remote 配置
```
origin   = git@github.com:nantas/pi-mono.git (fork)
upstream = https://github.com/badlogic/pi-mono.git (官方)
```
