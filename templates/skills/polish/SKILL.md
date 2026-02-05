---
name: polish
description: Hardcore code review with parallel sub-agents - spec compliance, quality, tests, dead code
args: scope
---

# /polish - Parallel Review Mode

Spawn multiple sub-agents for thorough, objective review. Each agent has fresh context.

## Usage

`/polish` or `/polish src/features/auth/`

---

## Step 1: Identify Scope

Quick inline check - no sub-agent needed:

```bash
git diff main --name-only
```

If scope arg provided, use that. Otherwise use changed files.

---

## Step 2: Spawn Parallel Sub-Agents

Launch ALL of these in parallel using Task tool:

### Sub-Agent 1: Spec Compliance

```
Task({
  subagent_type: "Explore",
  description: "Spec compliance check",
  prompt: `
You are checking if implementation matches requirements.

FILES: [list files]
REQUIREMENTS: [from chkd task or user-provided spec]

For EACH requirement:
- [ ] Implemented? yes/no
- [ ] Correct? yes/no/partial
- [ ] Edge cases handled? yes/no

Return:
COMPLIANCE: X/Y requirements met
MISSING: [list anything not implemented]
WRONG: [list anything implemented incorrectly]
`
})
```

### Sub-Agent 2: Code Quality

```
Task({
  subagent_type: "Explore",
  description: "Code quality scan",
  prompt: `
You are a code quality reviewer. Be ruthless.

FILES: [list files]

Check:
- Functions >50 lines? Flag them
- Files >300 lines? Flag them
- Unclear naming? Flag it
- Errors swallowed silently? Flag it
- Security issues? Flag them
- Would you write it this way fresh? If no, flag it

Return:
QUALITY: X/5
ISSUES:
- [file:line] [issue] (severity)
REFACTOR: [list things that need rewriting]
`
})
```

### Sub-Agent 3: Test Coverage

```
Task({
  subagent_type: "Explore",
  description: "Test coverage check",
  prompt: `
You are checking test coverage for changed code.

FILES: [list files]

For each file, find its tests. Check:
- Happy path tested?
- At least one edge case?
- Error conditions tested?
- Assertions meaningful (not just "doesn't crash")?

Return:
COVERAGE: X/5
UNTESTED: [list functions/components with no tests]
WEAK: [list tests that exist but are weak]
`
})
```

### Sub-Agent 4: Dead Code & Unused

```
Task({
  subagent_type: "Explore",
  description: "Dead code detection",
  prompt: `
You are hunting dead code and unused dependencies.

SCOPE: [repo path]

Find:
1. Exported functions never imported elsewhere
2. Components never used
3. Types/interfaces never referenced
4. Files that nothing imports
5. npm packages in package.json not imported anywhere

Return:
DEAD_EXPORTS: [list with file locations]
ORPHAN_FILES: [list files nothing imports]
UNUSED_DEPS: [list npm packages]
`
})
```

---

## Step 3: Aggregate Results

After all sub-agents return, combine:

```
╔══════════════════════════════════════╗
║         POLISH REPORT                ║
╚══════════════════════════════════════╝

SPEC COMPLIANCE: X/Y requirements
QUALITY SCORE: X/5
TEST COVERAGE: X/5
DEAD CODE: X items found

─── MUST FIX ───
[ ] [from spec compliance - missing/wrong]
[ ] [from quality - severity high]
[ ] [from tests - critical untested code]

─── SHOULD FIX ───
[ ] [from quality - medium severity]
[ ] [from dead code - cleanup]

─── NICE TO HAVE ───
[ ] [minor issues]
```

---

## Step 4: Fix or Escalate

**If MUST FIX is empty:**
```
✅ Polish complete. Ready to ship.
```

**If MUST FIX has items:**
```
❌ Issues found. Fixing now...
[fix each issue]
[re-run relevant sub-agent to verify]
```

**If disagreement with sub-agent:**
Ask user to decide. Don't argue with the review.

---

## Rules

- **Parallel execution**: Launch all 4 sub-agents at once
- **Fresh context**: Each sub-agent has no knowledge of your work
- **Be objective**: Sub-agent ratings are authoritative
- **Fix before ship**: MUST FIX items block completion
- **Log results**: If chkd available, log to decisions.json

---

## Quick Mode

For small changes, can skip sub-agents 3 & 4:

`/polish --quick` → Only spec compliance + quality
