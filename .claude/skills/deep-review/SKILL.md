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

### Sub-Agent 2: Codebase Fit & Duplication

**Purpose:** Does the new code fit with the existing codebase? Catches duplication AND pattern violations.

**IMPORTANT:** This agent must be EXHAUSTIVE. Do not skim. Every new function, type, constant, and component must be searched against the existing codebase. Partial matches count — if something is 70% similar, report it.

```
Task({
  subagent_type: "Explore",
  description: "Codebase fit - reuse and pattern check",
  prompt: `
You are auditing whether new code fits with the existing codebase. Two concerns:

A) REUSE — Did the AI duplicate existing code instead of reusing it?
B) PATTERNS — Does the new code follow existing codebase conventions?

YOUR JOB IS TO BE THOROUGH, NOT POLITE. Report everything you find. Do not skip items because they seem minor. Do not soften findings. If you find duplication, say so plainly with exact file paths and line numbers.

NEW CODE:
--- src/components/Feature.tsx ---
[actual contents]

PART A — REUSE AUDIT (MANDATORY — do not skip any of these):

For EVERY new function, class, component, type, interface, constant, and utility in the changed files:
1. Search for functions with similar names (Grep for the function name and synonyms)
2. Search for functions with similar PURPOSE (Grep for key terms from what the function does)
3. Search for similar type definitions or interfaces
4. Search for constants or config with overlapping values
5. Search for components that render similar UI or handle similar logic
6. Search for utilities that do the same transformation

YOU MUST actually run searches. Do not assume "nothing exists". Run at least 2-3 Grep searches per new function/type/component. Use multiple search terms.

For each search, report:
- What you searched for
- What you found (or "nothing found" — but prove you searched)
- Whether the existing code could have been reused or extended

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

SEARCHES PERFORMED:
- Searched for "[term]" → found [result] at [path:line] | nothing
- Searched for "[term]" → found [result] at [path:line] | nothing
(list ALL searches — this proves thoroughness)

DUPLICATIONS FOUND:
- [new thing at path:line] duplicates [existing thing at path:line] — [% similarity]
- [new thing] is near-duplicate of [existing thing] — differs only in [what]

SHOULD_HAVE_EXTENDED:
- [thing] was created but [existing thing] could have been extended because [reason]

PATTERN_VIOLATIONS:
- [file:line] doesn't follow convention: expected [X] but got [Y]
- [error handling at file:line] doesn't match codebase pattern at [reference file:line]

GOOD_FIT:
- [correctly reused existing code or followed patterns]

If you find ZERO duplications, explicitly state: "No duplications found after N searches" — but this should be rare. Most new code has at least partial overlap with something.
`
})
```

---

### Sub-Agent 3: Code Quality & Smells

**Purpose:** Is the code clean, simple, and well-structured? Catches over-engineering AND code smells.

**IMPORTANT:** This agent must report ALL smells, not just the worst ones. A review that only lists 1-2 major issues and says "otherwise looks good" is a FAILED review. Go line by line. Report every smell with exact file:line references.

```
Task({
  subagent_type: "Explore",
  description: "Code quality - simplicity and smells",
  prompt: `
You are checking code quality. Two concerns:

A) SIMPLICITY — Did the AI over-engineer?
B) CODE SMELLS — Is there technical debt?

YOUR JOB IS TO BE EXHAUSTIVE. Do not summarize. Do not group smells together. Report each one individually with exact file:line. A "clean" review with zero findings is almost always wrong — look harder.

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
7. Unnecessary generics or type parameters when concrete types would do
8. Builder/factory patterns for things only constructed once
9. Event systems or pub/sub for simple direct calls
10. Strategy pattern when there's only one strategy

Ask: "What's the simplest way to solve this problem?"
Compare to what was built. If the simplest version is 30%+ shorter, flag it.

PART B — CODE SMELLS (check EVERY item against EVERY file):
1. Long functions (>50 lines) — count the lines, report exact count
2. Long files (>300 lines) — count the lines, report exact count
3. Deep nesting (>3 levels) — report exact depth and location
4. Magic numbers/strings — report each one with the value
5. God objects/components doing too much — list the responsibilities
6. Tight coupling — what's coupled to what
7. Dead code or commented-out code — quote it
8. Copy-paste code within the new code itself — show both copies
9. Poor naming — what's the name, what should it be
10. Boolean parameters (hard to read at call site)
11. Functions with >3 parameters
12. Inconsistent return types (sometimes X, sometimes Y)
13. Mutable state where immutable would work
14. String concatenation for paths/URLs (use template or path.join)
15. Hardcoded values that should be constants
16. console.log left in production code

PART C — INTERNAL DUPLICATION:
Look within the changed files themselves for:
1. Repeated code blocks (3+ lines that appear more than once)
2. Similar functions that could be unified
3. Repeated conditionals or guard clauses
4. Copy-pasted error messages or strings

Return:
SIMPLICITY_SCORE: X/5 (5 = minimal and elegant, 1 = over-engineered)
SMELL_SCORE: X/5 (5 = clean, 1 = smelly)

OVER_ENGINEERING:
- [file:line] [abstraction] is only used once - inline it
- [file:line] [wrapper] adds no value - remove it
- [file:line] could be replaced with [simpler alternative]

SMELLS FOUND (list EVERY one — do not batch or summarize):
- [file:line] [smell type]: [description] — SEVERITY: HIGH/MEDIUM/LOW
- [file:line] [smell type]: [description] — SEVERITY: HIGH/MEDIUM/LOW
- [file:line] [smell type]: [description] — SEVERITY: HIGH/MEDIUM/LOW

INTERNAL DUPLICATION:
- [file:line1] and [file:line2]: [description of repeated code]

GOOD_QUALITY:
- [correctly kept it simple and clean]

If you report fewer than 3 total findings across all categories, explain why you believe the code is exceptionally clean — this is rare and worth calling out.
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

─── DUPLICATION (from Agent 2) ───
Searches performed: N
Duplications found: N
[ ] [new thing at path:line] → use [existing thing at path:line] instead
[ ] [near-duplicate] → extend [existing] instead of creating new

─── CODE SMELLS (from Agent 3) ───
Total smells found: N
[ ] HIGH: [file:line] [smell]: [description]
[ ] MEDIUM: [file:line] [smell]: [description]
[ ] LOW: [file:line] [smell]: [description]

─── SHOULD FIX ───
[ ] [minor reuse opportunity]
[ ] [slight over-engineering]
[ ] [minor pattern deviation]
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
- **Duplication requires proof**: Agent 2 must list searches performed — "no duplication" without searches is a failed review
- **Smells require line numbers**: Agent 3 must cite exact file:line for every smell — vague findings are rejected
- **Surface everything**: Do not filter or condense sub-agent findings in the report. Every finding from every agent appears in the final output. Let the user decide what matters.

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
