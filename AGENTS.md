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

## Style
- Keep answers concise
- No emojis in commits, issues, code
- Technical prose only, be kind but direct
