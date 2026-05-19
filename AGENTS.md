# Development Rules

## Conversational Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text
- Technical prose only, be kind but direct (e.g., "Thanks @user" not "Thanks so much @user!")
- When the user asks a question, answer it first before making edits or running implementation commands.

## Code Quality

- Read files in full before making wide-ranging changes, before editing files you have not already fully inspected, and when the user asks you to investigate or audit something. Do not rely only on search snippets for broad changes.
- No `any` types unless absolutely necessary
- Single-line helper functions with a single call site are forbidden; inline them instead.
- Check node_modules for external API type definitions instead of guessing
- **NEVER use inline imports** - no `await import("./foo.js")`, no `import("pkg").Type` in type positions, no dynamic imports for types. Always use standard top-level imports.
- NEVER remove or downgrade code to fix type errors from outdated dependencies; upgrade the dependency instead
- Always ask before removing functionality or code that appears to be intentional
- Do not preserve backward compatibility unless the user explicitly asks for it
- Never hardcode key checks with, eg. `matchesKey(keyData, "ctrl+x")`. All keybindings must be configurable. Add default to matching object (`DEFAULT_EDITOR_KEYBINDINGS` or `DEFAULT_APP_KEYBINDINGS`)
- NEVER modify `packages/ai/src/models.generated.ts` directly. Update `packages/ai/scripts/generate-models.ts` instead.

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

- After code changes (not documentation changes): `npm run check` (get full output, no tail). Fix all errors, warnings, and infos before committing.
- Note: `npm run check` does not run tests.
- If `npm run check` fails with type errors in `packages/web-ui` or "Cannot find module" errors, see **Build Workflow Pitfalls** above.
- NEVER run: `npm run dev`, `npm run build`, `npm test`
- Only run specific tests if user instructs: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts`
- Run tests from the package root, not the repo root.
- If you create or modify a test file, you MUST run that test file and iterate until it passes.
- When writing tests, run them, identify issues in either the test or implementation, and iterate until fixed.
- For `packages/coding-agent/test/suite/`, use `test/suite/harness.ts` plus the faux provider. Do not use real provider APIs, real API keys, or paid tokens.
- Put issue-specific regressions under `packages/coding-agent/test/suite/regressions/` and name them `<issue-number>-<short-slug>.test.ts`.
- NEVER commit unless user asks

## Contribution Gate

- New issues from new contributors are auto-closed by `.github/workflows/issue-gate.yml`
- New PRs from new contributors without PR rights are auto-closed by `.github/workflows/pr-gate.yml`
- Maintainer approval comments are handled by `.github/workflows/approve-contributor.yml`
- Maintainers review auto-closed issues daily
- Issues that do not meet the quality bar in `CONTRIBUTING.md` are not reopened and do not receive a reply
- `lgtmi` approves future issues
- `lgtm` approves future issues and rights to submit PRs

When creating issues:

- Add `pkg:*` labels to indicate which package(s) the issue affects
  - Available labels: `pkg:agent`, `pkg:ai`, `pkg:coding-agent`, `pkg:tui`, `pkg:web-ui`
- If an issue spans multiple packages, add all relevant labels

When posting issue/PR comments:

- Write the full comment to a temp file and use `gh issue comment --body-file` or `gh pr comment --body-file`
- Never pass multi-line markdown directly via `--body` in shell commands
- Preview the exact comment text before posting
- Post exactly one final comment unless the user explicitly asks for multiple comments
- If a comment is malformed, delete it immediately, then post one corrected comment
- Keep comments concise, technical, and in the user's tone

When closing issues via commit:

- Include `fixes #<number>` or `closes #<number>` in the commit message
- This automatically closes the issue when the commit is merged

## PR Workflow

- Analyze PRs without pulling locally first
- If the user approves: create a feature branch, pull PR, rebase on main, apply adjustments, commit, merge into main, push, close PR, and leave a comment in the user's tone
- You never open PRs yourself. We work in feature branches until everything is according to the user's requirements, then merge into main, and push.

## Testing pi Interactive Mode with tmux

To test pi's TUI in a controlled terminal environment:

```bash
# Create tmux session with specific dimensions
tmux new-session -d -s pi-test -x 80 -y 24

# Start pi from source
tmux send-keys -t pi-test "cd /Users/badlogic/workspaces/pi-mono && ./pi-test.sh" Enter

# Wait for startup, then capture output
sleep 3 && tmux capture-pane -t pi-test -p

# Send input
tmux send-keys -t pi-test "your prompt here" Enter

# Send special keys
tmux send-keys -t pi-test Escape
tmux send-keys -t pi-test C-o  # ctrl+o

# Cleanup
tmux kill-session -t pi-test
```

## Changelog

Location: `packages/*/CHANGELOG.md` (each package has its own)

### Format

Use these sections under `## [Unreleased]`:

- `### Breaking Changes` - API changes requiring migration
- `### Added` - New features
- `### Changed` - Changes to existing functionality
- `### Fixed` - Bug fixes
- `### Removed` - Removed features

### Rules

- Before adding entries, read the full `[Unreleased]` section to see which subsections already exist
- New entries ALWAYS go under `## [Unreleased]` section
- Append to existing subsections (e.g., `### Fixed`), do not create duplicates
- NEVER modify already-released version sections (e.g., `## [0.12.2]`)
- Each version section is immutable once released

### Attribution

- **Internal changes (from issues)**: `Fixed foo bar ([#123](https://github.com/earendil-works/pi-mono/issues/123))`
- **External contributions**: `Added feature X ([#456](https://github.com/earendil-works/pi-mono/pull/456) by [@username](https://github.com/username))`

## Adding a New LLM Provider (packages/ai)

Adding a new provider requires changes across multiple files:

### 1. Core Types (`packages/ai/src/types.ts`)

- Add API identifier to `Api` type union (e.g., `"bedrock-converse-stream"`)
- Create options interface extending `StreamOptions`
- Add mapping to `ApiOptionsMap`
- Add provider name to `KnownProvider` type union

### 2. Provider Implementation (`packages/ai/src/providers/`)

Create provider file exporting:

- `stream<Provider>()` function returning `AssistantMessageEventStream`
- `streamSimple<Provider>()` for `SimpleStreamOptions` mapping
- Provider-specific options interface
- Message/tool conversion functions
- Response parsing emitting standardized events (`text`, `tool_call`, `thinking`, `usage`, `stop`)

### 3. Provider Exports and Lazy Registration

- Add a package subpath export in `packages/ai/package.json` pointing at `./dist/providers/<provider>.js`
- Add `export type` re-exports in `packages/ai/src/index.ts` for provider option types that should remain available from the root entry
- Register the provider in `packages/ai/src/providers/register-builtins.ts` via lazy loader wrappers, do not statically import provider implementation modules there
- Add credential detection in `packages/ai/src/env-api-keys.ts`

### 4. Model Generation (`packages/ai/scripts/generate-models.ts`)

- Add logic to fetch/parse models from provider source
- Map to standardized `Model` interface

### 5. Tests (`packages/ai/test/`)

- Always add the provider to `stream.test.ts` with at least one representative model, even if it reuses an existing API implementation such as `openai-completions`.
- Add the provider to the broader provider matrix where applicable: `tokens.test.ts`, `abort.test.ts`, `empty.test.ts`, `context-overflow.test.ts`, `unicode-surrogate.test.ts`, `tool-call-without-result.test.ts`, `image-tool-result.test.ts`, `total-tokens.test.ts`, `cross-provider-handoff.test.ts`.
- For `cross-provider-handoff.test.ts`, add at least one provider/model pair. If the provider exposes multiple model families (for example GPT and Claude), add at least one pair per family.
- For non-standard auth, create utility (e.g., `bedrock-utils.ts`) with credential detection.

### 6. Coding Agent (`packages/coding-agent/`)

- `src/core/model-resolver.ts`: Add default model ID to `defaultModelPerProvider`
- `src/core/provider-display-names.ts`: Add API-key login display name so `/login` and related UI show the provider for built-in API-key auth.
- `src/cli/args.ts`: Add env var documentation
- `README.md`: Add provider setup instructions
- `docs/providers.md`: Add setup instructions, env var, and `auth.json` key

### 7. Documentation

- `packages/ai/README.md`: Add to providers table, document options/auth, add env vars
- `packages/ai/CHANGELOG.md`: Add entry under `## [Unreleased]`

## Releasing

**Lockstep versioning**: All packages always share the same version number. Every release updates all packages together.

**Version semantics** (no major releases):

- `patch`: Bug fixes and new features
- `minor`: API breaking changes

### Steps

1. **Update CHANGELOGs**: Ensure all changes since last release are documented in the `[Unreleased]` section of each affected package's CHANGELOG.md

2. **Run release script**:
   ```bash
   npm run release:patch    # Fixes and additions
   npm run release:minor    # API breaking changes
   ```

The script handles: version bump, CHANGELOG finalization, commit, tag, publish, and adding new `[Unreleased]` sections.

## **CRITICAL** Git Rules for Parallel Agents **CRITICAL**

Multiple agents may work on different files in the same worktree simultaneously. You MUST follow these rules:

### Committing

- **ONLY commit files YOU changed in THIS session**
- ALWAYS include `fixes #<number>` or `closes #<number>` in the commit message when there is a related issue or PR
- NEVER use `git add -A` or `git add .` - these sweep up changes from other agents
- ALWAYS use `git add <specific-file-paths>` listing only files you modified
- Before committing, run `git status` and verify you are only staging YOUR files
- Track which files you created/modified/deleted during the session
- It is always fine to include `packages/ai/src/models.generated.ts` in a commit alongside the actual files you want to commit

### Forbidden Git Operations

These commands can destroy other agents' work:

- `git reset --hard` - destroys uncommitted changes
- `git checkout .` - destroys uncommitted changes
- `git clean -fd` - deletes untracked files
- `git stash` - stashes ALL changes including other agents' work
- `git add -A` / `git add .` - stages other agents' uncommitted work
- `git commit --no-verify` - bypasses required checks and is never allowed

### Safe Workflow

```bash
# 1. Check status first
git status

# 2. Add ONLY your specific files
git add packages/ai/src/providers/transform-messages.ts
git add packages/ai/CHANGELOG.md

# 3. Commit
git commit -m "fix(ai): description"

# 4. Push (pull --rebase if needed, but NEVER reset/checkout)
git pull --rebase && git push
```

### If Rebase Conflicts Occur

- Resolve conflicts in YOUR files only
- If conflict is in a file you didn't modify, abort and ask the user
- NEVER force push

### User override

If the user instructions conflict with rules set out here, ask for confirmation that they want to override the rules. Only then execute their instructions.
