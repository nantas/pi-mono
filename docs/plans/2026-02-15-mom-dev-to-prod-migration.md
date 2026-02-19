# Mom Dev-to-Prod Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a repeatable, low-risk migration path that moves pi-mom Discord runtime from development to production with isolated sandboxes and persistent data outside the repository.

**Architecture:** Use two fully isolated environments (`discord-dev` and `discord-prod`) under `~/.pi/mom/`, each with its own Docker container, env file, and `data/` workspace. Keep the Docker bind mount host path and `mom` working directory argument identical to prevent path drift. Migrate by backup-first copy (`tar` + `rsync`) with explicit validation and rollback checkpoints.

**Tech Stack:** Docker, Bash, `rsync`, `tar`, `pi-mom` CLI, Discord bot tokens, Anthropic/OpenCode API keys.

---

## Prerequisites

Run from any shell on host machine:

```bash
docker --version
mom --version
```

Required values (do not commit these):

- `DEV_DISCORD_TOKEN`
- `PROD_DISCORD_TOKEN`
- `ANTHROPIC_API_KEY` (or your configured auth flow)

Canonical directories used by this plan:

- Dev: `~/.pi/mom/discord-dev/`
- Prod: `~/.pi/mom/discord-prod/`

---

### Task 1: Establish Canonical Environment Layout

**Files:**
- Create: `docs/runbooks/mom-discord-environments.md`
- Modify: `packages/mom/README.md`

**Step 1: Write the failing test**

Run:
```bash
test -f docs/runbooks/mom-discord-environments.md
```
Expected: exit code `1` (file does not exist yet).

**Step 2: Run test to verify it fails**

Run:
```bash
test -d "$HOME/.pi/mom/discord-dev/data" && test -d "$HOME/.pi/mom/discord-prod/data"
```
Expected: exit code `1` on a fresh machine.

**Step 3: Write minimal implementation**

Create `docs/runbooks/mom-discord-environments.md` with:

- Fixed directory model (`~/.pi/mom/discord-dev`, `~/.pi/mom/discord-prod`)
- Container naming (`mom-sandbox-discord-dev`, `mom-sandbox-discord-prod`)
- Rule: Docker `-v <host-data>:/workspace` host path must equal `mom ... <working-dir>`
- Security rule: no persistent mom data inside repository working tree

Append a short section to `packages/mom/README.md` pointing production users to this runbook.

**Step 4: Run test to verify it passes**

Run:
```bash
grep -q "mom-sandbox-discord-prod" docs/runbooks/mom-discord-environments.md && grep -q "repository" docs/runbooks/mom-discord-environments.md
```
Expected: exit code `0`.

**Step 5: Commit**

```bash
git add docs/runbooks/mom-discord-environments.md packages/mom/README.md
git commit -m "docs(mom): define canonical dev/prod environment layout"
```

---

### Task 2: Create Environment Files and Permission Baseline

**Files:**
- Create: `$HOME/.pi/mom/discord-dev/env.sh`
- Create: `$HOME/.pi/mom/discord-prod/env.sh`
- Test: shell checks in this task

**Step 1: Write the failing test**

Run:
```bash
test -f "$HOME/.pi/mom/discord-dev/env.sh" && test -f "$HOME/.pi/mom/discord-prod/env.sh"
```
Expected: exit code `1` before setup.

**Step 2: Run test to verify it fails**

Run:
```bash
test -d "$HOME/.pi/mom/discord-dev/data" && test -d "$HOME/.pi/mom/discord-prod/data"
```
Expected: exit code `1` on fresh setup.

**Step 3: Write minimal implementation**

Run:
```bash
mkdir -p "$HOME/.pi/mom/discord-dev/data" "$HOME/.pi/mom/discord-prod/data"

cat > "$HOME/.pi/mom/discord-dev/env.sh" <<'EOF'
export MOM_DISCORD_TOKEN='DEV_DISCORD_TOKEN_VALUE'
export ANTHROPIC_API_KEY='ANTHROPIC_API_KEY_VALUE'
EOF

cat > "$HOME/.pi/mom/discord-prod/env.sh" <<'EOF'
export MOM_DISCORD_TOKEN='PROD_DISCORD_TOKEN_VALUE'
export ANTHROPIC_API_KEY='ANTHROPIC_API_KEY_VALUE'
EOF

chmod 700 "$HOME/.pi/mom/discord-dev" "$HOME/.pi/mom/discord-prod"
chmod 700 "$HOME/.pi/mom/discord-dev/data" "$HOME/.pi/mom/discord-prod/data"
chmod 600 "$HOME/.pi/mom/discord-dev/env.sh" "$HOME/.pi/mom/discord-prod/env.sh"
```

**Step 4: Run test to verify it passes**

Run:
```bash
test -f "$HOME/.pi/mom/discord-dev/env.sh" && test -f "$HOME/.pi/mom/discord-prod/env.sh" && test -d "$HOME/.pi/mom/discord-dev/data" && test -d "$HOME/.pi/mom/discord-prod/data"
```
Expected: exit code `0`.

**Step 5: Commit**

No git commit for secret-bearing files outside repository. Log completion in runbook.

---

### Task 3: Bootstrap and Validate Development Sandbox

**Files:**
- Modify: `docs/runbooks/mom-discord-environments.md`
- Test: Docker and runtime checks in this task

**Step 1: Write the failing test**

Run:
```bash
docker inspect -f '{{.State.Running}}' mom-sandbox-discord-dev
```
Expected: non-zero exit (container not yet created) on first run.

**Step 2: Run test to verify it fails**

Run:
```bash
docker ps --format '{{.Names}}' | grep -qx mom-sandbox-discord-dev
```
Expected: exit code `1` before container creation.

**Step 3: Write minimal implementation**

Run:
```bash
docker run -d --name mom-sandbox-discord-dev \
  -v "$HOME/.pi/mom/discord-dev/data:/workspace" \
  alpine:latest tail -f /dev/null

source "$HOME/.pi/mom/discord-dev/env.sh"
mom --sandbox=docker:mom-sandbox-discord-dev "$HOME/.pi/mom/discord-dev/data"
```

**Step 4: Run test to verify it passes**

In a second shell, run:
```bash
docker inspect -f '{{.State.Running}}' mom-sandbox-discord-dev | grep -qx true
```
Expected: exit code `0`.

Then trigger a Discord test mention and confirm these files appear:

```bash
ls -la "$HOME/.pi/mom/discord-dev/data"
```

Expected:
- `settings.json`
- `events/` (if used)
- one or more channel-id directories with `log.jsonl` and `context.jsonl`

**Step 5: Commit**

```bash
git add docs/runbooks/mom-discord-environments.md
git commit -m "docs(mom): add dev sandbox bootstrap and validation steps"
```

---

### Task 4: Prepare Production Sandbox (Without Cutover)

**Files:**
- Modify: `docs/runbooks/mom-discord-environments.md`
- Test: Docker and path consistency checks in this task

**Step 1: Write the failing test**

Run:
```bash
docker inspect -f '{{.State.Running}}' mom-sandbox-discord-prod
```
Expected: non-zero exit before creation.

**Step 2: Run test to verify it fails**

Run:
```bash
test -d "$HOME/.pi/mom/discord-prod/data" && [ -z "$(ls -A "$HOME/.pi/mom/discord-prod/data")" ]
```
Expected: exit code `0` for an empty prod workspace before migration.

**Step 3: Write minimal implementation**

Run:
```bash
docker run -d --name mom-sandbox-discord-prod \
  -v "$HOME/.pi/mom/discord-prod/data:/workspace" \
  alpine:latest tail -f /dev/null
```

Do not start mom in prod yet.

**Step 4: Run test to verify it passes**

Run:
```bash
docker inspect -f '{{.State.Running}}' mom-sandbox-discord-prod | grep -qx true
docker exec mom-sandbox-discord-prod sh -c 'test -d /workspace'
```
Expected: both commands exit `0`.

**Step 5: Commit**

```bash
git add docs/runbooks/mom-discord-environments.md
git commit -m "docs(mom): add production sandbox pre-cutover preparation"
```

---

### Task 5: Perform Dev-to-Prod Data Migration (Backup First)

**Files:**
- Create: `docs/runbooks/mom-discord-migration-execution.md`
- Modify: `docs/runbooks/mom-discord-environments.md`

**Step 1: Write the failing test**

Run:
```bash
SRC_DEV_DATA="$HOME/.pi/mom/discord-dev/data"
DST_PROD_DATA="$HOME/.pi/mom/discord-prod/data"
test -d "$SRC_DEV_DATA" && test -d "$DST_PROD_DATA"
```
Expected: exit code `0`.

Then validate prod is still empty (precondition):

```bash
[ -z "$(ls -A "$DST_PROD_DATA")" ]
```
Expected: exit code `0`.

**Step 2: Run test to verify it fails**

Run:
```bash
test -f "$DST_PROD_DATA/settings.json"
```
Expected: exit code `1` before migration.

**Step 3: Write minimal implementation**

Run:
```bash
set -euo pipefail

SRC_DEV_DATA="$HOME/.pi/mom/discord-dev/data"
DST_PROD_DATA="$HOME/.pi/mom/discord-prod/data"
BACKUP_DIR="$HOME/.pi/mom/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

# Freeze writes: stop dev mom process manually before continuing.

tar -czf "$BACKUP_DIR/dev-data-$STAMP.tgz" -C "$HOME/.pi/mom/discord-dev" data
tar -czf "$BACKUP_DIR/prod-data-before-$STAMP.tgz" -C "$HOME/.pi/mom/discord-prod" data

rsync -a "$SRC_DEV_DATA/" "$DST_PROD_DATA/"
```

**Step 4: Run test to verify it passes**

Run:
```bash
test -f "$DST_PROD_DATA/settings.json"
find "$DST_PROD_DATA" -maxdepth 2 -name log.jsonl | grep -q log.jsonl
find "$DST_PROD_DATA" -maxdepth 2 -name context.jsonl | grep -q context.jsonl
```
Expected: all commands exit `0`.

Also append migration evidence to `docs/runbooks/mom-discord-migration-execution.md`:

- timestamp
- source path
- destination path
- backup file names
- validation command outputs

**Step 5: Commit**

```bash
git add docs/runbooks/mom-discord-environments.md docs/runbooks/mom-discord-migration-execution.md
git commit -m "docs(mom): document backup-first dev-to-prod data migration"
```

---

### Task 6: Cut Over to Production and Run Smoke Tests

**Files:**
- Modify: `docs/runbooks/mom-discord-migration-execution.md`
- Modify: `docs/runbooks/mom-discord-environments.md`

**Step 1: Write the failing test**

Run:
```bash
docker exec mom-sandbox-discord-prod sh -c 'test -d /workspace && ls /workspace | head -n 1'
```
Expected: non-empty output after migration.

**Step 2: Run test to verify it fails**

Before starting prod mom process, verify no active prod mom process:

```bash
ps aux | grep '[m]om --sandbox=docker:mom-sandbox-discord-prod'
```
Expected: no output.

**Step 3: Write minimal implementation**

Run:
```bash
source "$HOME/.pi/mom/discord-prod/env.sh"
mom --sandbox=docker:mom-sandbox-discord-prod "$HOME/.pi/mom/discord-prod/data"
```

**Step 4: Run test to verify it passes**

From Discord, perform smoke tests:

1. Mention bot with a simple prompt.
2. Ask it to read prior channel context.
3. Trigger one tool action (e.g., list files under workspace).

Host-side validation:

```bash
find "$HOME/.pi/mom/discord-prod/data" -maxdepth 2 -name log.jsonl | xargs -I{} tail -n 3 {}
```

Expected: new production interaction entries appended.

**Step 5: Commit**

```bash
git add docs/runbooks/mom-discord-migration-execution.md docs/runbooks/mom-discord-environments.md
git commit -m "docs(mom): add production cutover and smoke test checklist"
```

---

### Task 7: Rollback Procedure and Operational Hardening

**Files:**
- Create: `docs/runbooks/mom-discord-rollback.md`
- Modify: `docs/runbooks/mom-discord-environments.md`

**Step 1: Write the failing test**

Run:
```bash
test -f docs/runbooks/mom-discord-rollback.md
```
Expected: exit code `1` before file is created.

**Step 2: Run test to verify it fails**

Run:
```bash
ls "$HOME/.pi/mom/backups" | grep -q 'prod-data-before-'
```
Expected: exit code `0` only if Task 5 backups were created.

**Step 3: Write minimal implementation**

Create rollback runbook with exact commands:

```bash
# Stop prod mom process first (manual/terminal interrupt)
docker stop mom-sandbox-discord-prod

# Restore latest prod backup
LATEST="$(ls -t "$HOME/.pi/mom/backups"/prod-data-before-*.tgz | head -n 1)"
rm -rf "$HOME/.pi/mom/discord-prod/data"
mkdir -p "$HOME/.pi/mom/discord-prod"
tar -xzf "$LATEST" -C "$HOME/.pi/mom/discord-prod"

# Restart container and mom
docker start mom-sandbox-discord-prod
source "$HOME/.pi/mom/discord-prod/env.sh"
mom --sandbox=docker:mom-sandbox-discord-prod "$HOME/.pi/mom/discord-prod/data"
```

Include hardening checklist:

- Separate dev/prod Discord bots
- `chmod 600` on env files
- Weekly backup cron for prod data
- Never run production with repository-local `./data`

**Step 4: Run test to verify it passes**

Run:
```bash
grep -q "prod-data-before" docs/runbooks/mom-discord-rollback.md && grep -q "Never run production with repository-local" docs/runbooks/mom-discord-rollback.md
```
Expected: exit code `0`.

**Step 5: Commit**

```bash
git add docs/runbooks/mom-discord-rollback.md docs/runbooks/mom-discord-environments.md
git commit -m "docs(mom): add rollback and hardening runbook"
```

---

## Migration Flow (Dev -> Prod)

Use this exact order during execution:

1. Freeze dev writes (stop dev mom process).
2. Confirm source data health (`log.jsonl`, `context.jsonl`, `settings.json` present).
3. Create dev and prod backups (`tar` snapshots).
4. Copy dev data to prod (`rsync -a`).
5. Validate copied structure and channel files.
6. Start prod mom with prod token + prod data path.
7. Run Discord smoke tests.
8. Monitor for 30-60 minutes.
9. If failure: execute rollback runbook immediately.

---

## Final Verification Checklist

- [ ] Dev and prod use different container names.
- [ ] Dev and prod use different Discord bot tokens.
- [ ] Production data path is outside repository.
- [ ] Docker mount path equals mom working directory for each environment.
- [ ] Backup artifacts exist before every migration.
- [ ] Smoke tests pass in production channel/DM.
- [ ] Rollback commands are tested and documented.
