# Mem0 Search Limit & Retry Guardrails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix issue where user asks for 20 items but agent repeatedly calls mem0 with default limit of 5. Solution: update system prompt to enforce limit usage and cap total calls.

**Architecture:** Modify system prompt in packages/mom/src/agent.ts to add strict mem0 usage guardrails: max 2 calls (1 normal + 1 retry), proper limit selection based on user request, no multi-keyword loops.

**Tech Stack:** TypeScript, pi-mom package, system prompt modification only (no code changes).

---

### Task 1: Update mem0 Usage Guide in System Prompt

**Files:**
- Modify: `packages/mom/src/agent.ts:340-348`

**Step 1: Edit the mem0 Usage Guide section**

Replace lines 340-348 with updated guidance:

```typescript
### mem0 Usage Guide
- Use action=write when users ask you to remember something, or when you capture durable preferences, key decisions, and best practices.
- Use action=read or action=search before complex tasks and when users ask about prior context.
- **Limit parameter (critical):**
  - User specifies quantity N (e.g., "20 items", "5 memories"): set limit=min(N, 20)
  - User asks broadly without number (e.g., "all memories", "everything"): set limit=10
  - Default limit is 5 - NEVER use default when user wants more
- **Call limits (critical):**
  - Maximum 2 mem0 search calls per conversation turn
  - First call: normal search with appropriate limit
  - Second call: ONLY if first call returned fewer results than user requested AND you have strong reason to believe more exist
  - Never call mem0 more than twice - if still insufficient, inform user and suggest refining search
  - Never loop through multiple keywords trying to "fill" results - this wastes API calls
- Scope selection: scope=user for user preferences (default), scope=agent for mom-specific experience, scope=project with project_dir for project-specific memory.
- Keep mem0 failures non-blocking: continue helping and return a short warning.
```

**Step 2: Commit**

```bash
git add packages/mom/src/agent.ts
git commit -m "fix(mom): add mem0 search limit and retry guardrails to system prompt"
```

---

### Task 2: Update mem0 Tool Description for Clarity

**Files:**
- Modify: `packages/mom/src/tools/mem0.ts:97-99`

**Step 1: Update the tool description to reinforce prompt guidance**

Replace lines 97-99:

```typescript
return {
    name: "mem0",
    label: "mem0",
    description: "Read and write long-term memory directly via Mem0 API. For search: use limit parameter appropriately (max 20). Maximum 2 search calls per conversation.",
    parameters: mem0Schema,
```

**Step 2: Commit**

```bash
git add packages/mom/src/tools/mem0.ts
git commit -m "fix(mom): update mem0 tool description with limit guidance"
```

---

### Task 3: Verify Implementation

**Step 1: Run type check**

```bash
cd packages/mom && npm run check
```

Expected: PASS (no errors)

**Step 2: Commit final**

```bash
git add -A && git commit -m "chore: mem0 search guardrails complete"
```
