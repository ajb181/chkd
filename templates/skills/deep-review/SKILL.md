---
name: deep-review
description: AI-focused code review with 4 parallel sub-agents - catches duplication, over-engineering, assumptions, fallbacks, code smells
args: scope
---

# /deep-review - AI-Focused Code Review

Reviews code for mistakes AI commonly makes. Spawns 4 parallel sub-agents, each with fresh context.

## Usage

`/deep-review` or `/deep-review src/features/auth/`

---

## Step 1: Gather Context

### 1a. Find files to review

```bash
git diff main --name-only
```

If scope arg provided, use that instead.

### 1b. Get task requirements (if chkd active)

```
status() or working()
```

### 1c. Get design file (if exists)

Check for design file at `docs/{ITEM.ID}/design.md`. This is the reference for what was planned vs what was built.

### 1d. Get any flags from assume()

Check `.chkd/decisions.json` for assumptions logged during this task. Pass them to Agent 4.

### 1e. Show user and confirm

```
Deep Review Scope
═══════════════════════════════════════

FILES TO REVIEW:
- src/components/Feature.tsx
- src/lib/api.ts

REQUIREMENTS (from task):
- [requirement 1]
- [requirement 2]

FLAGS (from assume()):
- [any assumptions logged during build]

Launching 4 sub-agents:
1. Spec Compliance
2. Codebase Fit (reuse + patterns)
3. Code Quality (simplicity + smells)
4. Assumptions & Error Handling

Proceed? (y/n)
```

Wait for confirmation.

---

## Step 2: Read All Files

Read every file in scope. You'll pass contents to sub-agents.

---

## Step 3: Spawn 4 Parallel Sub-Agents

Launch ALL of these in parallel. Pass actual file contents, not placeholders.

---

### Sub-Agent 1: Spec Compliance

**Purpose:** Did it actually meet the requirements and design?

```
Task({
  subagent_type: "Explore",
  description: "Spec compliance check",
  prompt: `
You are checking if implementation matches requirements AND the original design.

FILES:
--- src/components/Feature.tsx ---
[actual contents]

DESIGN FILE (docs/{ITEM.ID}/design.md):
[actual design contents - problem, approach, key decisions]

REQUIREMENTS:
1. [actual requirement]
2. [actual requirement]

For EACH requirement:
- [ ] Implemented? yes/no
- [ ] Correct? yes/no/partial
- [ ] Edge cases handled? yes/no

Compare to DESIGN FILE:
- [ ] Problem solved as described?
- [ ] Approach followed?
- [ ] Key decisions honored?

Return:
SPEC_COMPLIANCE: X/Y requirements met
DESIGN_COMPLIANCE: matches/deviates
MISSING: [requirements not implemented]
WRONG: [requirements implemented incorrectly]
PARTIAL: [requirements partially done]
DESIGN_DEVIATIONS: [if any - what changed from original design and why]
`
})
```

---

### Sub-Agent 2: Codebase Fit

**Purpose:** Does the new code fit with the existing codebase? Catches duplication AND pattern violations.

```
Task({
  subagent_type: "Explore",
  description: "Codebase fit - reuse and pattern check",
  prompt: `
You are auditing whether new code fits with the existing codebase. Two concerns:

A) REUSE — Did the AI duplicate existing code instead of reusing it?
B) PATTERNS — Does the new code follow existing codebase conventions?

NEW CODE:
--- src/components/Feature.tsx ---
[actual contents]

PART A — REUSE AUDIT:
Search the codebase for:
1. Functions with similar names or purposes
2. Components that do similar things
3. Utilities that could have been extended
4. Types/interfaces that are near-duplicates
5. API patterns that were reinvented

For each new function/component/utility, search for existing alternatives.

PART B — PATTERN COMPLIANCE:
Analyze the codebase for existing patterns and compare:
1. File/folder structure conventions
2. Naming conventions (functions, components, variables)
3. Error handling patterns
4. State management patterns
5. API call patterns
6. Component structure patterns
7. Import organization

Return:
REUSE_SCORE: X/5 (5 = excellent reuse, 1 = reinvented everything)
PATTERN_SCORE: X/5 (5 = fits perfectly, 1 = ignores conventions)

DUPLICATIONS:
- [new thing] duplicates [existing thing at path:line]

SHOULD_HAVE_EXTENDED:
- [thing] was created but [existing thing] could have been extended

PATTERN_VIOLATIONS:
- [file] doesn't follow convention: [expected] vs [actual]
- [error handling] doesn't match codebase pattern

GOOD_FIT:
- [correctly reused existing code or followed patterns]
`
})
```

---

### Sub-Agent 3: Code Quality

**Purpose:** Is the code clean, simple, and well-structured? Catches over-engineering AND code smells.

```
Task({
  subagent_type: "Explore",
  description: "Code quality - simplicity and smells",
  prompt: `
You are checking code quality. Two concerns:

A) SIMPLICITY — Did the AI over-engineer?
B) CODE SMELLS — Is there technical debt?

CODE TO REVIEW:
--- src/components/Feature.tsx ---
[actual contents]

PART A — SIMPLICITY:
1. Abstractions used only once (premature abstraction)
2. Unnecessary wrapper functions
3. Config/options objects when a simple parameter would do
4. Generic solutions for specific problems
5. Multiple layers when one would work
6. "Future-proofing" that adds complexity now

Ask: "What's the simplest way to solve this problem?"
Compare to what was built.

PART B — CODE SMELLS:
1. Long functions (>50 lines)
2. Long files (>300 lines)
3. Deep nesting (>3 levels)
4. Magic numbers/strings
5. God objects/components doing too much
6. Tight coupling
7. Dead code or commented-out code
8. Copy-paste code within the new code itself
9. Poor naming

Return:
SIMPLICITY_SCORE: X/5 (5 = minimal and elegant, 1 = over-engineered)
SMELL_SCORE: X/5 (5 = clean, 1 = smelly)

OVER_ENGINEERING:
- [abstraction] is only used once - inline it
- [wrapper] adds no value - remove it

SMELLS_FOUND:
- [file:line] [smell type]: [description]

SEVERITY:
- HIGH: [will cause bugs or maintenance problems]
- MEDIUM: [should be fixed]
- LOW: [minor]

GOOD_QUALITY:
- [correctly kept it simple and clean]
`
})
```

---

### Sub-Agent 4: Assumptions & Error Handling

**Purpose:** Did the AI make silent decisions? Did it create fallback behavior instead of proper errors?

```
Task({
  subagent_type: "Explore",
  description: "Assumptions and error handling audit",
  prompt: `
You are auditing for two AI failure modes:

A) SILENT ASSUMPTIONS — decisions made without asking
B) FALLBACK HIDING — swallowing errors with defaults instead of surfacing them

CODE TO REVIEW:
--- src/components/Feature.tsx ---
[actual contents]

REQUIREMENTS:
1. [actual requirement]
2. [actual requirement]

FLAGS FROM BUILD (assumptions the AI logged during coding):
[any flags from .chkd/decisions.json, or "none logged"]

PART A — ASSUMPTIONS:
Look for decisions made without explicit instruction:
1. Data format choices (JSON vs FormData, date formats)
2. Error handling strategy chosen
3. State management approach
4. API design choices
5. Default values chosen
6. Edge case handling decisions

For each: Was this explicitly requested? Should the user have been asked?

PART B — FALLBACK / ERROR HIDING:
This is CRITICAL. AI loves to "be helpful" by returning defaults instead of errors.
Flag ALL of these as MUST FIX:

1. catch blocks that return fallback values ([], null, {}, 0, '', false) instead of throwing or re-throwing
2. catch blocks that log but don't re-throw — error is swallowed
3. || defaultValue or ?? defaultValue that hides a failure that should be visible
4. Optional chaining (?.) used to silently skip missing data that should be REQUIRED
5. "Graceful degradation" that hides broken state from the user
6. Functions that return empty/default results on error instead of surfacing the error
7. try/catch wrapping code that should just throw to the caller
8. Default parameter values that mask missing required arguments

The CORRECT pattern is: let errors propagate. Return errors to the caller.
Only catch errors at the TOP of the call stack (API route handler, UI error boundary).
Internal functions should THROW, not catch-and-default.

Exception: retry logic, circuit breakers, and explicit user-facing fallbacks with clear comments are OK.

Return:
ASSUMPTION_SCORE: X/5 (5 = all decisions explicit, 1 = many silent assumptions)
ERROR_HANDLING_SCORE: X/5 (5 = errors propagate correctly, 1 = errors hidden everywhere)

SILENT_ASSUMPTIONS:
- [assumption]: [what was decided] - should have asked because [reason]

FALLBACK_VIOLATIONS (MUST FIX):
- [file:line]: catch returns [fallback] instead of throwing — error is hidden
- [file:line]: || [default] masks failure of [expression]
- [file:line]: ?. silently skips [thing] that should be required

GOOD_ERROR_HANDLING:
- [correctly lets errors propagate]
- [appropriate top-level catch with user-facing error message]

QUESTIONS_THAT_SHOULD_HAVE_BEEN_ASKED:
- [question AI should have asked before implementing]
`
})
```

---

## Step 4: Aggregate Results

After all 4 sub-agents return:

```
╔══════════════════════════════════════════════════════╗
║              DEEP REVIEW REPORT                      ║
╚══════════════════════════════════════════════════════╝

SPEC COMPLIANCE:      X/Y requirements
DESIGN COMPLIANCE:    matches/deviates
REUSE SCORE:          X/5
PATTERN SCORE:        X/5
SIMPLICITY SCORE:     X/5
SMELL SCORE:          X/5
ASSUMPTION SCORE:     X/5
ERROR HANDLING SCORE: X/5

─── MUST FIX (blocks ship) ───
[ ] [missing requirement]
[ ] [duplicated existing code - use X instead]
[ ] [catch returns fallback instead of throwing]
[ ] [error swallowed - should propagate]
[ ] [over-engineered - simplify]
[ ] [silent assumption - should have asked]

─── SHOULD FIX ───
[ ] [minor reuse opportunity]
[ ] [slight over-engineering]
[ ] [minor pattern deviation]
[ ] [code smell - MEDIUM severity]
[ ] [assumption worth noting]

─── NOTES ───
[observations, good things, questions for user]
```

---

## Step 5: Fix or Escalate

**If MUST FIX is empty:**
```
✅ Deep review passed. Ready to ship.
```

**If MUST FIX has items:**
```
❌ Issues found.

Show user:
- What needs to change
- Why (which AI mistake)
- Proposed fix

Get approval, then fix.
Re-run relevant sub-agent to verify.
```

**If disagreement with sub-agent:**
Ask user to decide. Don't argue with the review.

---

## Rules

- **Show scope first**: Confirm files with user before proceeding
- **Pass real content**: Sub-agents get actual file contents
- **Parallel execution**: Launch all 4 sub-agents at once
- **Fresh context**: Each sub-agent has no prior knowledge
- **Be objective**: Sub-agent ratings are authoritative
- **Fix before ship**: MUST FIX items block completion
- **Fallbacks are bugs**: catch-and-default is a MUST FIX, not a suggestion

---

## What This Catches

| AI Mistake | Sub-Agent |
|------------|-----------|
| Didn't meet requirements | Spec Compliance |
| Deviated from design | Spec Compliance |
| Duplicated existing code | Codebase Fit |
| Ignored codebase patterns | Codebase Fit |
| Over-engineered | Code Quality |
| Premature abstraction | Code Quality |
| Long functions/files | Code Quality |
| Magic numbers | Code Quality |
| Swallowed errors with fallbacks | Assumptions & Error Handling |
| catch-and-return-default | Assumptions & Error Handling |
| Silent decisions without asking | Assumptions & Error Handling |
| Optional chaining hiding required data | Assumptions & Error Handling |

---

## Quick Mode

`/deep-review --quick` → Only runs:
1. Spec Compliance
2. Assumptions & Error Handling

(The 2 most critical for AI mistakes)
