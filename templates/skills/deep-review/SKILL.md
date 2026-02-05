---
name: deep-review
description: AI-focused code review with 6 parallel sub-agents - catches duplication, over-engineering, assumptions, code smells
args: scope
---

# /deep-review - AI-Focused Code Review

Reviews code for mistakes AI commonly makes. Spawns 6 parallel sub-agents, each with fresh context.

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

### 1d. Show user and confirm

```
📋 Deep Review Scope
═══════════════════════════════════════

FILES TO REVIEW:
- src/components/Feature.tsx
- src/lib/api.ts

REQUIREMENTS (from task):
- [requirement 1]
- [requirement 2]

Launching 6 sub-agents:
1. Spec Compliance
2. Reuse Audit
3. Simplicity Check
4. Pattern Compliance
5. Code Smells
6. Assumptions Audit

Proceed? (y/n)
```

Wait for confirmation.

---

## Step 2: Read All Files

Read every file in scope. You'll pass contents to sub-agents.

---

## Step 3: Spawn 6 Parallel Sub-Agents

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

### Sub-Agent 2: Reuse Audit

**Purpose:** Did the AI duplicate existing code instead of reusing?

```
Task({
  subagent_type: "Explore",
  description: "Reuse audit - find duplicated code",
  prompt: `
You are auditing for code duplication. AI often creates new code when existing code would work.

NEW CODE CREATED:
--- src/components/Feature.tsx ---
[actual contents]

SEARCH THE CODEBASE FOR:
1. Functions with similar names or purposes
2. Components that do similar things
3. Utilities that could have been extended
4. Helpers that already exist
5. Types/interfaces that are near-duplicates
6. API patterns that were reinvented

For each new function/component/utility created, search for existing alternatives.

Return:
REUSE_SCORE: X/5 (5 = excellent reuse, 1 = created everything from scratch)

DUPLICATIONS:
- [new thing] duplicates [existing thing at path:line]
- [new function] could have used [existing function]

SHOULD_HAVE_EXTENDED:
- [thing] was created but [existing thing] could have been extended

GOOD_REUSE:
- [correctly reused existing code]
`
})
```

---

### Sub-Agent 3: Simplicity Check

**Purpose:** Did the AI over-engineer?

```
Task({
  subagent_type: "Explore",
  description: "Simplicity check - find over-engineering",
  prompt: `
You are checking for over-engineering. AI tends to over-complicate.

CODE TO REVIEW:
--- src/components/Feature.tsx ---
[actual contents]

CHECK FOR:
1. Abstractions used only once (premature abstraction)
2. Unnecessary wrapper functions
3. Config/options objects when a simple parameter would do
4. Generic solutions for specific problems
5. Multiple layers when one would work
6. "Future-proofing" that adds complexity now
7. Would a senior dev say "this is too complicated"?

Ask: "What's the simplest way to solve this problem?"
Compare to what was built.

Return:
SIMPLICITY_SCORE: X/5 (5 = minimal and elegant, 1 = over-engineered)

OVER_ENGINEERING:
- [abstraction] is only used once - inline it
- [wrapper] adds no value - remove it
- [generic solution] for a specific problem - simplify

GOOD_SIMPLICITY:
- [correctly kept it simple]
`
})
```

---

### Sub-Agent 4: Pattern Compliance

**Purpose:** Did the AI follow existing codebase patterns?

```
Task({
  subagent_type: "Explore",
  description: "Pattern compliance - check conventions",
  prompt: `
You are checking if new code follows existing codebase patterns.

NEW CODE:
--- src/components/Feature.tsx ---
[actual contents]

ANALYZE THE CODEBASE FOR EXISTING PATTERNS:
1. File/folder structure conventions
2. Naming conventions (functions, components, variables)
3. Error handling patterns
4. State management patterns
5. API call patterns
6. Component structure patterns
7. Import organization
8. Comment/documentation style

Compare new code to existing patterns.

Return:
PATTERN_SCORE: X/5 (5 = fits perfectly, 1 = ignores conventions)

VIOLATIONS:
- [file] doesn't follow naming convention: [expected] vs [actual]
- [component] structured differently than existing components
- [error handling] doesn't match codebase pattern

GOOD_ADHERENCE:
- [correctly followed existing patterns]
`
})
```

---

### Sub-Agent 5: Code Smells

**Purpose:** Catch technical debt and bad practices.

```
Task({
  subagent_type: "Explore",
  description: "Code smell detection",
  prompt: `
You are hunting code smells. These are technical debt created in real-time.

CODE TO REVIEW:
--- src/components/Feature.tsx ---
[actual contents]

CHECK FOR:
1. Long functions (>50 lines) - should be broken up
2. Long files (>300 lines) - should be split
3. Deep nesting (>3 levels) - flatten or extract
4. Magic numbers/strings - should be constants
5. God objects/components - doing too much
6. Tight coupling - hard to test or change
7. Error swallowing - catch blocks that hide errors
8. Dead code - unreachable or commented out code
9. Copy-paste code - within the new code itself
10. Poor naming - unclear what something does
11. Missing error handling - happy path only
12. Hardcoded values - should be configurable

Return:
SMELL_SCORE: X/5 (5 = clean, 1 = smelly)

SMELLS_FOUND:
- [file:line] [smell type]: [description]
- [file:line] [smell type]: [description]

SEVERITY:
- HIGH: [smells that will cause bugs or maintenance hell]
- MEDIUM: [smells that should be fixed]
- LOW: [minor issues]
`
})
```

---

### Sub-Agent 6: Assumptions Audit

**Purpose:** Did the AI make silent decisions that should have been surfaced?

```
Task({
  subagent_type: "Explore",
  description: "Assumptions audit - find silent decisions",
  prompt: `
You are auditing for unstated assumptions. AI often makes decisions without asking.

CODE TO REVIEW:
--- src/components/Feature.tsx ---
[actual contents]

REQUIREMENTS:
1. [actual requirement]
2. [actual requirement]

LOOK FOR DECISIONS MADE WITHOUT EXPLICIT INSTRUCTION:
1. Data format choices (JSON vs FormData, date formats, etc.)
2. Error handling strategy (throw vs return null vs show message)
3. State management approach (local vs global vs URL)
4. API design choices (REST conventions, field names)
5. UI/UX decisions (loading states, empty states, error display)
6. Performance tradeoffs (eager vs lazy, cache vs fetch)
7. Security choices (validation, sanitization, auth checks)
8. Edge case handling (what happens when X is null/empty/invalid?)
9. Default values chosen
10. Ordering/sorting decisions

For each assumption found, ask:
- Was this explicitly requested?
- Could a reasonable person have chosen differently?
- Should the user have been asked?

Return:
ASSUMPTION_SCORE: X/5 (5 = all decisions explicit or obvious, 1 = many silent assumptions)

SILENT_ASSUMPTIONS:
- [assumption]: [what was decided] - should have asked because [reason]
- [assumption]: [what was decided] - reasonable default, but worth noting

GOOD_COMMUNICATION:
- [decision that was properly surfaced or obviously correct]

QUESTIONS_THAT_SHOULD_HAVE_BEEN_ASKED:
- [question AI should have asked before implementing]
`
})
```

---

## Step 4: Aggregate Results

After all 6 sub-agents return:

```
╔══════════════════════════════════════════════════════╗
║              DEEP REVIEW REPORT                      ║
╚══════════════════════════════════════════════════════╝

SPEC COMPLIANCE:    X/Y requirements
DESIGN COMPLIANCE:  matches/deviates
REUSE SCORE:        X/5
SIMPLICITY SCORE:   X/5
PATTERN SCORE:      X/5
SMELL SCORE:        X/5
ASSUMPTION SCORE:   X/5

─── MUST FIX (blocks ship) ───
[ ] [missing requirement]
[ ] [duplicated existing code - use X instead]
[ ] [over-engineered - simplify]
[ ] [pattern violation - follow existing]
[ ] [code smell - HIGH severity]
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
- **Parallel execution**: Launch all 6 sub-agents at once
- **Fresh context**: Each sub-agent has no prior knowledge
- **Be objective**: Sub-agent ratings are authoritative
- **Fix before ship**: MUST FIX items block completion

---

## What This Catches

| AI Mistake | Sub-Agent |
|------------|-----------|
| Didn't meet requirements | Spec Compliance |
| Duplicated existing code | Reuse Audit |
| Created instead of extending | Reuse Audit |
| Over-engineered | Simplicity Check |
| Premature abstraction | Simplicity Check |
| Ignored codebase patterns | Pattern Compliance |
| Inconsistent naming | Pattern Compliance |
| Long functions/files | Code Smells |
| Magic numbers | Code Smells |
| Error swallowing | Code Smells |
| Made decisions without asking | Assumptions Audit |
| Silent tradeoffs | Assumptions Audit |

---

## Quick Mode

`/deep-review --quick` → Only runs:
1. Spec Compliance
2. Reuse Audit
3. Assumptions Audit

(The 3 most critical for AI mistakes)
