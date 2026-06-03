# Development Rules

## Conversational Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text (e.g., "Thanks @user" not "Thanks so much @user!")
- Technical prose only, be direct
- When the user asks a question, answer it first before making edits or running implementation commands.
- When responding to user feedback or an analysis, explicitly say whether you agree or disagree before saying what you changed.

## Code Quality

- Read files in full before wide-ranging changes, before editing files you have not fully inspected, and when asked to investigate or audit. Do not rely on search snippets for broad changes.
- No `any` unless absolutely necessary.
- Inline single-line helpers that have only one call site.
- Check node_modules for external API types; don't guess.
- **No inline imports** (`await import()`, `import("pkg").Type`, dynamic type imports). Top-level imports only.
- Never remove or downgrade code to fix type errors from outdated deps; upgrade the dep instead.
- Use only erasable TypeScript syntax (Node strip-only mode) in code checked by the root config (`packages/*/src`, `packages/*/test`, `packages/coding-agent/examples`): no parameter properties, `enum`, `namespace`/`module`, `import =`, `export =`, or other constructs needing JS emit. Use explicit fields with constructor assignments.
- Always ask before removing functionality or code that appears intentional.
- Do not preserve backward compatibility unless the user asks for it.
- Never hardcode key checks (e.g. `matchesKey(keyData, "ctrl+x")`). Add defaults to `DEFAULT_EDITOR_KEYBINDINGS` or `DEFAULT_APP_KEYBINDINGS` so they stay configurable.
- Never modify `packages/ai/src/models.generated.ts` directly; update `packages/ai/scripts/generate-models.ts` instead, then regenerate. Including the resulting `models.generated.ts` diff is always OK, even if regeneration includes unrelated upstream model metadata changes.

## Project Structure

Monorepo managed with npm workspaces. Node >= 20 required.

### Packages

| Package | Path | Description |
|---------|------|-------------|
| `pi-ai` | `packages/ai` | Unified multi-provider LLM streaming API |
| `pi-agent-core` | `packages/agent` | Agent runtime: tool calling loop, state machine |
| `pi-coding-agent` | `packages/coding-agent` | Interactive CLI coding agent (this repo's main product) |
| `pi-tui` | `packages/tui` | Terminal UI library with differential rendering |
| `pi-web-ui` | `packages/web-ui` | Web components for AI chat interfaces |

### Dependency Direction

`pi-ai` ← `pi-agent-core` ← `pi-coding-agent`
`pi-tui` ← `pi-coding-agent`
`pi-web-ui` is independent.

### Build Order

There is **no root-level `npm run build` script**. Build must be run at the package level in dependency order:

```bash
cd packages/tui    && npm run build
cd packages/ai     && npm run build
cd packages/agent  && npm run build
cd packages/coding-agent && npm run build
cd packages/web-ui && npm run build
```

`npm run check` requires build first because `web-ui` uses `tsc --noEmit` which reads compiled `.d.ts` from `node_modules/@earendil-works/*` (symlinked to `packages/*`), not from TypeScript source.

### Build Workflow Pitfalls

- **Stale `.d.ts` files**: If you change types in `packages/agent` or `packages/ai`, downstream packages (especially `web-ui`) will see stale `.d.ts` and throw type errors that don't exist in source. Always rebuild upstream packages before running `npm run check`.
- **Missing workspace dependencies**: If `tsgo --noEmit` reports "Cannot find module 'typebox'" (or `uuid`, `extract-zip`, etc.), `node_modules` is out of sync. Run `npm install` from repo root.
- **`npm run check` runs `web-ui` checks**: The root `check` script ends with `cd packages/web-ui && npm run check`, which includes `tsc --noEmit`. If `packages/agent/dist/` is stale, `web-ui` will fail even though you didn't touch it.
- **Global CLI testing**: To test the built CLI globally, build `coding-agent` then run `cd packages/coding-agent && npm link --force`.

### Toolchain

- **Compiler**: `tsgo` (TypeScript native preview, `@typescript/native-preview`). Package-level `tsconfig.build.json` drives compilation; root `tsconfig.json` provides path mapping for cross-package imports in development.
- **Linter/Formatter**: Biome (`biome.json`). Tab indent, width 120, `noNonNullAssertion` and `noExplicitAny` are off.
- **Tests**: Vitest per package. Run from package root, not repo root.
- **CI**: `.github/workflows/ci.yml` builds, checks, and tests on every push/PR to `main`.

## packages/coding-agent Development Guide

`packages/coding-agent` is the interactive CLI product. It layers a TUI, session management, tool system, and extension framework on top of `pi-agent-core`.

### Source Layout

```
src/
  cli.ts              # CLI entry point (undici proxy setup, calls main())
  main.ts             # Main orchestrator: arg parsing → mode selection → runtime init
  config.ts           # Paths, version, CONSTANTS
  migrations.ts       # Settings/session format migrations
  core/               # Business logic shared by all modes
    agent-session.ts          # Core abstraction: state, events, model/tool/compaction mgmt
    agent-session-runtime.ts  # Session lifecycle: new/switch/fork/import/dispose
    agent-session-services.ts # Service factory: auth, settings, model registry, resource loader
    sdk.ts                    # Programmatic API: createAgentSession(), tool factories
    tools/            # 7 built-in tools
      read.ts, bash.ts, edit.ts, write.ts, grep.ts, find.ts, ls.ts
      edit-diff.ts            # Diff engine for edit tool
      file-mutation-queue.ts  # Serializes concurrent file mutations
      truncate.ts             # Output truncation utilities
    extensions/       # Extension framework
      loader.ts       # Discovers and loads .ts/.js extensions via jiti
      runner.ts       # Event emission, tool/command/shortcut registries
      types.ts        # Extension API surface (events, contexts, definitions)
      wrapper.ts      # Wraps extension-registered tools into agent-compatible format
    compaction/       # Context window compaction
      compaction.ts   # Core compaction logic (summarize old messages)
      branch-summarization.ts
      utils.ts        # File-op tracking, serialization helpers
    session-manager.ts        # Session persistence (JSONL), tree navigation, branching
    settings-manager.ts       # Settings load/save (project + global), validation
    resource-loader.ts        # Loads skills, prompts, themes, extensions, AGENTS.md context
    model-registry.ts         # Available models from auth + providers
    model-resolver.ts         # Model selection logic (scoped, default, CLI override)
    auth-storage.ts           # auth.json read/write (API keys, OAuth tokens)
    messages.ts               # Conversion between agent-core and LLM message formats
    export-html/              # HTML session export with ANSI→HTML conversion
    event-bus.ts              # Simple pub/sub for extension cross-communication
    diagnostics.ts            # Resource collision/error types
  modes/              # Three run modes
    interactive/        # TUI mode
      interactive-mode.ts   # ~5K lines: TUI layout, key handling, streaming render
      components/           # TUI component library (40+ components)
      theme/                # Color themes, syntax highlighting
    print-mode.ts       # Non-interactive mode (piped input, stdout output)
    rpc/                # JSONL RPC mode for embedding in other apps
      rpc-mode.ts, rpc-client.ts, rpc-types.ts, jsonl.ts
  cli/                # CLI helpers
    args.ts           # Argument parsing, help text
    file-processor.ts # @file ingestion, image attachment
    initial-message.ts# Initial prompt construction
    list-models.ts    # /models command implementation
    session-picker.ts # /resume session selection
  utils/              # Utilities
    clipboard.ts, clipboard-image.ts, clipboard-native.ts
    image-resize.ts, image-convert.ts, photon.ts
    shell.ts, child-process.ts
    git.ts, paths.ts, fs-watch.ts
    frontmatter.ts, markdown parsing helpers
  bun/                # Bun binary compilation entry points
```

### Core Architecture

#### AgentSession (`core/agent-session.ts`)

The central abstraction. All run modes (interactive, print, RPC) share one `AgentSession` instance.

Responsibilities:
- **State access**: Exposes `agent.state`, `messages`, `model`, `thinkingLevel`.
- **Event subscription**: `subscribe(listener)` emits `AgentSessionEvent`s (streaming text, tool calls, errors, compaction, etc.).
- **Prompting**: `prompt(text, options)` → runs the agent loop with the LLM.
- **Tool management**: Enables/disables built-in and extension tools dynamically.
- **Compaction**: Auto and manual context summarization to stay within token limits.
- **Bash execution**: `executeBash()` with configurable timeout and working directory.
- **Session branching**: `navigateTree()` for branching conversations.

Key patterns:
- Events are the primary interface between core and UI. The interactive mode renders by subscribing to events.
- `AgentSession` does not know about TUI. It only emits events.

#### AgentSessionRuntime (`core/agent-session-runtime.ts`)

Owns the current `AgentSession` plus its cwd-bound services. Handles session replacement (new, switch, fork, import) cleanly:

1. Emit `session_shutdown` to extensions.
2. Dispose old session.
3. Create new runtime via factory.
4. Rebind UI/extensions.

Methods: `newSession()`, `switchSession()`, `fork()`, `importFromJsonl()`, `dispose()`.

#### SDK (`core/sdk.ts`)

Programmatic entry point for external consumers and tests.

- `createAgentSession(options)` → builds full session with all defaults.
- Tool factories: `createReadTool()`, `createBashTool()`, `createEditTool()`, etc. Accept `cwd` and options.
- `withFileMutationQueue()` wraps tools to serialize concurrent file mutations.

### Tool System (`core/tools/`)

Seven built-in tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`.

Design:
- **Definition** (`createXToolDefinition`): JSON Schema (TypeBox) for LLM. Includes descriptions and constraints.
- **Implementation** (`createXTool`): Actual execution logic. Returns `AgentTool` from `pi-agent-core`.
- **Operations pattern**: Tools like `edit` and `bash` expose an `XOperations` interface so callers can override I/O (e.g., remote SSH).

Key files:
- `edit-diff.ts`: Core diff engine. Supports multiple non-overlapping replacements per call. Normalizes line endings, handles BOM.
- `file-mutation-queue.ts`: Ensures only one file-mutating tool runs at a time to prevent race conditions.
- `truncate.ts`: Truncates tool output to configurable max bytes/lines with head/tail preservation.

### Extension System (`core/extensions/`)

Extensions are TypeScript modules loaded dynamically via `jiti`.

#### Loader (`loader.ts`)

- Discovers extensions from:
  1. `cwd/.pi/extensions/*`
  2. `~/.pi/agent/extensions/*`
  3. Configured paths (can be npm/git packages)
- Loads via `jiti` with aliases to workspace packages in dev mode, `virtualModules` in Bun binary mode.
- Extensions export a factory function `(api: ExtensionAPI) => void | Promise<void>`.

#### Runner (`runner.ts`)

- `ExtensionRunner` holds loaded extensions and emits events to their handlers.
- Events cover the full lifecycle: `session_start`, `before_agent_start`, `tool_call`, `tool_result`, `message_end`, `session_shutdown`, `input`, `context`, etc.
- Extensions can register: tools, commands, shortcuts, flags, message renderers, providers.
- Action methods (sendMessage, setModel, etc.) are bound to the runtime after session creation via `bindCore()`.
- Stale context protection: after `newSession()`, `fork()`, `switchSession()`, or `reload()`, old `ExtensionContext` instances throw on access.

#### Types (`types.ts`)

- `ExtensionAPI`: Registration interface available during extension load.
- `ExtensionContext`: Runtime interface available in event handlers.
- `ExtensionCommandContext`: Adds session navigation actions (`newSession`, `fork`, `switchSession`, `reload`).
- `ExtensionUIContext`: TUI primitives (dialogs, widgets, status) available only in interactive mode.

### Session Management (`core/session-manager.ts`)

Persists sessions as append-only JSONL files (`~/.pi/sessions/`).

Entry types:
- `message`: LLM/agent messages.
- `compaction`: Summarized history with token count.
- `branch_summary`: Summary of a branched subtree.
- `custom` / `custom_message`: Extension data.
- `model_change`, `thinking_level_change`: Metadata.
- `label`, `session_info`: User annotations.

Features:
- Tree structure with parent IDs; supports branching and fork-based navigation.
- `buildSessionContext()` constructs the LLM-visible message list from entries (skipping internal types).
- Auto-compaction triggered by `AgentSession` when context approaches model limits.

### Compaction (`core/compaction/`)

Manages context window size by summarizing old conversation history.

- `compact()`: Identifies cut point, sends history to LLM for summarization, writes a `compaction` entry.
- `shouldCompact()`: Checks token count against `reserveTokens` and `keepRecentTokens` settings.
- `generateBranchSummary()`: Summarizes a branch before navigation.
- File operation tracking: Tracks which files were read/modified across the conversation and includes them in summaries.

### Resource Loader (`core/resource-loader.ts`)

Loads project-local and global resources at session startup:

- **Context files**: `AGENTS.md`, `CLAUDE.md` (nearest ancestor + global).
- **Skills**: Markdown files with YAML frontmatter. Injected into system prompt.
- **Prompts**: Reusable prompt templates accessible via `/command`.
- **Themes**: JSON theme files for TUI colors.
- **Extensions**: As described above.

Collision resolution: user scope wins over project scope wins over temporary. Diagnostics reported for conflicts.

### Run Modes (`modes/`)

#### Interactive Mode (`modes/interactive/interactive-mode.ts`)

The full TUI experience. Key subsystems:

- **Layout**: Header → Chat → Pending → Status → Widgets → Editor → Footer.
- **Streaming render**: `AssistantMessageComponent` handles markdown + tool call blocks in real time.
- **Tool execution**: `ToolExecutionComponent` shows tool calls with expandable output.
- **Bash integration**: `BashExecutionComponent` for inline shell execution (`!` prefix).
- **Keybindings**: Fully configurable via `keybindings.json`. `KeybindingsManager` resolves shortcuts.
- **Autocomplete**: `CombinedAutocompleteProvider` merges slash commands, skills, prompt templates, file paths, and extension commands.
- **Theme system**: Hot-reloadable JSON themes with `initTheme()` / `onThemeChange()`.

#### Print Mode (`modes/print-mode.ts`)

Non-interactive. Reads piped stdin or file arguments, outputs to stdout. No TUI; events printed as plain text.

#### RPC Mode (`modes/rpc/rpc-mode.ts`)

JSONL protocol over stdin/stdout for embedding pi in IDEs or other applications.
- Commands: `prompt`, `steer`, `follow_up`, `get_state`, `set_model`, `compact`, `export_html`, etc.
- Events: All `AgentSessionEvent`s streamed as JSON.
- Extension UI requests forwarded as `extension_ui_request` / `extension_ui_response`.

### Testing (`test/`)

Test structure:
- Unit tests at `test/*.test.ts` (vitest).
- Integration suite at `test/suite/*.test.ts` using `test/suite/harness.ts` + faux provider.
- **Never use real LLM APIs in tests.** The faux provider simulates responses.
- Regression tests at `test/suite/regressions/<issue>-<slug>.test.ts`.

Key test patterns:
- `test-harness.ts`: Helpers for creating mock sessions.
- Faux provider setup in `test/suite/harness.ts`.
- For interactive mode tests, instantiate `InteractiveMode` with a mock TUI or capture events.

### Common Pitfalls

- **Path resolution**: Tools use `resolveToCwd()` from `core/tools/path-utils.ts`. Always resolve relative paths against the session's effective `cwd`.
- **File mutation queue**: When testing tools that modify files, wrap with `withFileMutationQueue()` to match production behavior.
- **Extension context staleness**: Any code holding an `ExtensionContext` across an `await` on `newSession()`, `fork()`, `switchSession()`, or `reload()` will throw. Pass continuations via `withSession` callbacks.
- **Theme changes**: `initTheme()` must be called before any TUI components are created. `onThemeChange()` invalidates the UI.
- **Session events vs agent events**: `AgentSessionEvent` (coding-agent level) wraps `AgentEvent` (agent-core level) with additional metadata. Subscribe to the session, not the raw agent, for complete event streams.

## Commands

- After code changes (not docs): `npm run check` (full output, no tail). Fix all errors, warnings, and infos before committing. Does not run tests.
- Never run `npm run build` or `npm test` unless requested by the user.
- Never run the full vitest suite directly: it includes e2e tests that activate when endpoint/auth env vars are present. For all non-e2e tests, run `./test.sh` from the repo root. Otherwise run specific tests from the package root: `node ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts`.
- If you create or modify a test file, run it and iterate on test or implementation until it passes.
- For `packages/coding-agent/test/suite/`, use `test/suite/harness.ts` + the faux provider. No real provider APIs, keys, or paid tokens.
- Put issue-specific regressions under `packages/coding-agent/test/suite/regressions/` named `<issue-number>-<short-slug>.test.ts`.
- For ad-hoc scripts, `write` them to a temp file (e.g. `/tmp`), run, edit if needed, remove when done. Don't embed multi-line scripts in `bash` commands.
- Never commit unless the user asks.

## Dependency and Install Security

- Treat npm dep and lockfile changes as reviewed code. Direct external deps stay pinned to exact versions.
- Hydrate/update locally with `npm install --ignore-scripts`; clean/CI-style with `npm ci --ignore-scripts`. Don't run lifecycle scripts unless the user asks.
- If dep metadata changes, refresh `package-lock.json` with `npm install --package-lock-only --ignore-scripts`.
- If `packages/coding-agent/npm-shrinkwrap.json` needs regen, run `node scripts/generate-coding-agent-shrinkwrap.mjs` (verify with `--check` or `npm run check`). New deps with lifecycle scripts require review and an explicit allowlist entry in that script; never add one silently.
- Pre-commit blocks lockfile commits unless `PI_ALLOW_LOCKFILE_CHANGE=1`. Don't bypass unless the user wants the lockfile change committed.

## Git

Multiple pi sessions may be running in this cwd at the same time, each modifying different files. Git operations that touch unstaged, staged, or untracked files outside your own changes will stomp on other sessions' work. Follow these rules:

Committing:

- Only commit files YOU changed in THIS session.
- Stage explicit paths (`git add <path1> <path2>`); never `git add -A` / `git add .`.
- Before committing, run `git status` and verify you are only staging your files.
- `packages/ai/src/models.generated.ts` may always be included alongside your files.

Never run (destroys other agents' work or bypasses checks):

- `git reset --hard`, `git checkout .`, `git clean -fd`, `git stash`, `git add -A`, `git add .`, `git commit --no-verify`.

If rebase conflicts occur:

- Resolve conflicts only in files you modified.
- If a conflict is in a file you did not modify, abort and ask the user.
- Never force push.

## Issues and PRs

See `CONTRIBUTING.md` for the contributor gate (auto-close workflows, `lgtm`/`lgtmi`, quality bar).

When reviewing PRs:

- Do not run `gh pr checkout`, `git switch`, or otherwise move the worktree to the PR branch unless the user explicitly asks.
- Use `gh pr view`, `gh pr diff`, `gh api`, and local `git show`/`git diff` against fetched refs to inspect PR metadata, commits, and patches without changing branches.
- If you need PR file contents, fetch/read them into temporary files or use `git show <ref>:<path>` without switching branches.

When creating issues:

- Add `pkg:*` labels for affected packages (`pkg:agent`, `pkg:ai`, `pkg:coding-agent`, `pkg:tui`); use all that apply.

When posting issue/PR comments:

- Write the comment to a temp file and post with `gh issue/pr comment --body-file` (never multi-line markdown via `--body`).
- Keep comments concise, technical, in the user's tone.
- End every AI-posted comment with the AI-generated disclaimer line specified by the originating prompt (e.g. `This comment is AI-generated by `/wr``).

When closing issues via commit:

- Include `fixes #<number>` or `closes #<number>` in the message so merging auto-closes the issue. For multiple issues, repeat the keyword per issue (`closes #1, closes #2`); a shared keyword (`closes #1, #2`) only closes the first.

## Testing pi Interactive Mode with tmux

Run the TUI in a controlled terminal (from the repo root):

```bash
tmux new-session -d -s pi-test -x 80 -y 24
tmux send-keys -t pi-test "./pi-test.sh" Enter
sleep 3 && tmux capture-pane -t pi-test -p     # capture after startup
tmux send-keys -t pi-test "your prompt here" Enter
tmux send-keys -t pi-test Escape               # special keys (also C-o for ctrl+o, etc.)
tmux kill-session -t pi-test
```

## Changelog

Location: `packages/*/CHANGELOG.md` (one per package).

Sections under `## [Unreleased]`: `### Breaking Changes` (API changes requiring migration), `### Added`, `### Changed`, `### Fixed`, `### Removed`.

Rules:

- All new entries go under `## [Unreleased]`. Read the full section first and append to existing subsections; never duplicate them.
- Released version sections (e.g. `## [0.12.2]`) are immutable; never modify them.

Attribution:

- Internal (from issues): `Fixed foo bar ([#123](https://github.com/earendil-works/pi-mono/issues/123))`
- External contributions: `Added feature X ([#456](https://github.com/earendil-works/pi-mono/pull/456) by [@username](https://github.com/username))`

## Releasing

**Lockstep versioning**: all packages share one version; every release updates all together. `patch` = fixes + additions, `minor` = breaking changes. No major releases.

1. **Update CHANGELOGs**: ask the user whether they ran the `/cl` prompt on the latest commit on `main`. If not, they must run `/cl` first to audit and update each package's `[Unreleased]` section before releasing.

2. **Local smoke test**: build an unpublished release and smoke test from outside the repo (so it can't resolve workspace files):
   ```bash
   npm run release:local -- --out /tmp/pi-local-release --force
   cd /tmp

   # Node package install smoke tests
   /tmp/pi-local-release/node/pi --help
   /tmp/pi-local-release/node/pi --version
   /tmp/pi-local-release/node/pi --list-models
   /tmp/pi-local-release/node/pi -p "Say exactly: ok"
   /tmp/pi-local-release/node/pi

   # Bun binary smoke tests
   /tmp/pi-local-release/bun/pi --help
   /tmp/pi-local-release/bun/pi --version
   /tmp/pi-local-release/bun/pi --list-models
   /tmp/pi-local-release/bun/pi -p "Say exactly: ok"
   /tmp/pi-local-release/bun/pi
   ```
   Verify both Node and Bun startup, model/account listing, interactive startup, and at least one real prompt with the intended default provider. The bare commands `/tmp/pi-local-release/node/pi` and `/tmp/pi-local-release/bun/pi` start interactive mode; run each in tmux, submit a prompt, and wait for the model reply before considering the interactive smoke test passed. Failures are release blockers unless the user explicitly accepts the risk.

3. **Run the release script**:
   ```bash
   PI_ALLOW_LOCKFILE_CHANGE=1 npm_config_min_release_age=0 npm run release:patch    # fixes + additions
   PI_ALLOW_LOCKFILE_CHANGE=1 npm_config_min_release_age=0 npm run release:minor    # breaking changes
   ```
   Use `npm_config_min_release_age=0` only for the release command. The repo's normal npm age gate can otherwise block the release lockfile refresh when the current workspace package version was published recently. Review any lockfile or shrinkwrap diffs the release creates before push.

   The release script bumps all package versions, updates changelogs, regenerates release artifacts, runs `npm run check`, commits `Release vX.Y.Z`, tags `vX.Y.Z`, adds fresh `## [Unreleased]` changelog sections, commits `Add [Unreleased] section for next cycle`, then pushes `main` and the tag. Do not rerun the release script after a tag was pushed.

4. **CI publishes npm packages**: pushing the `vX.Y.Z` tag triggers `.github/workflows/build-binaries.yml`. The `publish-npm` job uses npm trusted publishing through GitHub Actions OIDC with environment `npm-publish`; no local `npm publish`, `npm whoami`, OTP, or WebAuthn flow is required.

5. **If CI publish fails**: inspect the failed `publish-npm` job. The publish helper is idempotent and skips package versions already present on npm, so rerun the tag workflow after fixing CI or transient npm issues. Do not rerun `npm run release:patch` or `npm run release:minor` for the same version.

## User Override

If the user's instructions conflict with any rule in this document, ask for explicit confirmation before overriding. Only then execute their instructions.
