---
name: deep-review
description: Thorough code review with 6 parallel sub-agents and interactive walkthrough of every finding
args: scope
---

# /deep-review - AI-Focused Code Review

Reviews code for mistakes AI commonly makes. Spawns 6 parallel sub-agents, then walks through EVERY finding interactively with the user.

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

Launching 6 sub-agents:
1. Spec Compliance
2. Codebase Fit (reuse + patterns)
3. Code Quality (simplicity + smells)
4. Assumptions & Error Handling
5. Fit for Purpose (overcomplexity check)
6. UX/UI Standards (if frontend files in scope)

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

JUSTIFICATION (MANDATORY for any score below 4):
- Score is X because: [specific reason]
- To reach 5: [what would need to change]

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

JUSTIFICATION (MANDATORY for any score below 4):
- Score is X because: [specific reason with file:line references]
- To reach 5: [concrete changes needed]

OVER_ENGINEERING:
- [file:line] [abstraction] is only used once - inline it
- [file:line] [wrapper] adds no value - remove it
- [file:line] could be replaced with [simpler alternative]

SMELLS FOUND (list EVERY one — do not batch or summarize):
- [file:line] [smell type]: [description]
- [file:line] [smell type]: [description]
- [file:line] [smell type]: [description]

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

**Purpose:** Did the AI make silent decisions that weren't in the plan? Did it create fallback behavior instead of proper errors?

**CRITICAL:** This agent's primary job is to find code decisions that were NOT in the design/requirements. Every choice the AI made that wasn't explicitly asked for is a finding. These MUST be surfaced to the user — they may be correct, but the user needs to confirm.

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

REQUIREMENTS / DESIGN:
1. [actual requirement]
2. [actual requirement]

[design file contents if available]

FLAGS FROM BUILD (assumptions the AI logged during coding):
[any flags from .chkd/decisions.json, or "none logged"]

PART A — ASSUMPTIONS (this is the most important part):

Go through the code line by line. For EVERY implementation decision, ask: "Was this in the plan/requirements?"

Look for:
1. Data format choices (JSON vs FormData, date formats, string vs enum)
2. Error handling strategy chosen (throw vs return null vs default)
3. State management approach
4. API design choices (REST conventions, response shape, status codes)
5. Default values chosen — what are they, why those values?
6. Edge case handling decisions — what edge cases were handled, which were ignored?
7. Validation rules — what gets validated, what doesn't?
8. Ordering/sorting choices
9. Naming choices that imply behavior (e.g., "soft delete" vs "delete")
10. Caching/memoization decisions
11. Timeout values, retry counts, limits
12. Data transformation logic

For EACH assumption found, provide:
- WHAT: The specific decision made (with file:line)
- WHY IT MATTERS: What could go wrong if this assumption is incorrect
- QUESTION: The plain-English question the user should answer to confirm

PART B — FALLBACK / ERROR HIDING:
AI loves to "be helpful" by returning defaults instead of errors.
Flag ALL of these:

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
ASSUMPTION_SCORE: X/5 (5 = all decisions explicit in plan, 1 = many silent assumptions)
ERROR_HANDLING_SCORE: X/5 (5 = errors propagate correctly, 1 = errors hidden everywhere)

JUSTIFICATION (MANDATORY for any score below 4):
- Score is X because: [specific reason]
- To reach 5: [what would need to change]

SILENT_ASSUMPTIONS (list ALL — do not filter by importance):
For each:
- WHAT: [file:line] [what was decided]
- WHY IT MATTERS: [what breaks if wrong]
- QUESTION: [plain English question for the user]

FALLBACK_VIOLATIONS:
- [file:line]: catch returns [fallback] instead of throwing — error is hidden
- [file:line]: || [default] masks failure of [expression]
- [file:line]: ?. silently skips [thing] that should be required

GOOD_ERROR_HANDLING:
- [correctly lets errors propagate]
- [appropriate top-level catch with user-facing error message]
`
})
```

---

### Sub-Agent 5: Fit for Purpose (Overcomplexity Check)

**Purpose:** Is this code doing what it needs to do, or has it grown beyond its purpose? Is it overbuilt, doing too many things, or solving problems that don't exist?

**IMPORTANT:** This is a higher-level review than Agent 3 (code smells). Agent 3 looks at code quality line-by-line. This agent looks at the WHOLE SOLUTION and asks: "Is this the right thing to build? Is it doing too much?"

```
Task({
  subagent_type: "Explore",
  description: "Fit for purpose - overcomplexity check",
  prompt: `
You are reviewing whether this code is FIT FOR PURPOSE. Not code quality — PURPOSE.

Ask yourself: "If I described what this code does to someone in one sentence, would they say 'that sounds about right' or 'why does it do all that?'"

CODE TO REVIEW:
--- src/components/Feature.tsx ---
[actual contents]

REQUIREMENTS / DESIGN:
[what was asked for]

CHECK EACH OF THESE:

1. SCOPE CREEP — Does it do more than what was asked?
   - Features nobody requested
   - Edge cases that will never happen in practice
   - Configurability that nobody needs
   - Supporting multiple formats/protocols when only one is used
   - Report: [what's extra] vs [what was requested]

2. WRONG ABSTRACTION LEVEL — Is it solving at the right level?
   - Building a framework when a function would do
   - Creating a service when a utility is enough
   - Making something generic when it's used in one place
   - Building infrastructure when the task is "add a button"
   - Report: [what level it's at] vs [what level it should be at]

3. UNNECESSARY INDIRECTION — Can you follow the logic?
   - How many files do you need to open to understand one feature?
   - How many layers does a request pass through?
   - Could someone new to the codebase understand this in 5 minutes?
   - Report: [the path through the code] and whether it's justified

4. DOING TOO MANY THINGS — Single responsibility at the feature level
   - Does this one change touch concerns it shouldn't?
   - Is it mixing data fetching with presentation with business logic?
   - Could this be 2-3 smaller, focused changes?
   - Report: [the responsibilities] and whether they belong together

5. GOLD PLATING — Is it polished beyond what's needed?
   - Elaborate error messages for internal functions
   - Documentation for obvious code
   - Tests for trivial getters
   - Animations/transitions nobody asked for
   - Report: [what's gold-plated] vs [what's appropriate]

Return:
FIT_FOR_PURPOSE_SCORE: X/5 (5 = does exactly what's needed, 1 = massively overbuilt)

JUSTIFICATION (MANDATORY for any score below 4):
- Score is X because: [specific reason]
- To reach 5: [what to simplify or remove]

SCOPE_CREEP:
- [what was asked] vs [what was built] — [what's extra]

WRONG_LEVEL:
- [file:line] built as [what] but should be [what]

UNNECESSARY_INDIRECTION:
- To do [simple thing], you must: [step 1] → [step 2] → [step 3]...

TOO_MANY_THINGS:
- [file/component] handles: [responsibility 1], [responsibility 2], [responsibility 3]

GOLD_PLATING:
- [file:line] [what's over-done] — [what's appropriate instead]

GOOD_FIT:
- [things that are well-scoped and appropriate]

ONE-SENTENCE SUMMARY:
"This code [does X]. For the requirement [Y], this is [appropriate/overbuilt/underbuilt] because [reason]."
`
})
```

---

### Sub-Agent 6: UX/UI Standards (Frontend Only)

**Purpose:** Does the UI follow the project's design standards? Is it consistent with the rest of the app?

**IMPORTANT:** Only run this agent if the changed files include frontend code (.tsx, .jsx, .svelte, .vue, .css, .scss, .html). Skip entirely for pure backend changes.

**Design Standards Doc:** Check for `docs/design-standards.md` in the project root. If it doesn't exist, the agent should CREATE one by analyzing 3-5 existing UI files for patterns, then review the new code against those patterns.

```
Task({
  subagent_type: "Explore",
  description: "UX/UI standards review",
  prompt: `
You are reviewing frontend code against the project's design standards.

NEW CODE:
--- src/components/Feature.tsx ---
[actual contents]

STEP 1: Find or create design standards

Check if docs/design-standards.md exists in the project. Read it if it does.

If it DOESN'T exist, analyze 3-5 existing UI files in the project to discover:
- Color system (CSS variables, theme tokens, hardcoded values?)
- Spacing system (rem, px, spacing scale?)
- Typography (font families, sizes, weights, headings?)
- Component patterns (how are forms built? buttons? cards? modals?)
- Layout approach (flexbox, grid, containers, breakpoints?)
- Animation/transition patterns
- Accessibility patterns (aria labels, keyboard nav, focus management?)
- Naming conventions (BEM, utility classes, CSS modules, styled-components?)
- Icon system
- Responsive approach

Report what you found as: DISCOVERED_STANDARDS

STEP 2: Review the new code against standards

For each standard you found (or from the doc):

1. CONSISTENCY — Does the new code match?
   - Same color variables or hardcoded different ones?
   - Same spacing units or mixing px/rem/em?
   - Same component structure or reinvented?
   - Same naming patterns?

2. ACCESSIBILITY — Basic checks
   - Interactive elements have visible focus styles?
   - Images have alt text?
   - Color contrast sufficient?
   - Semantic HTML used (not div soup)?
   - aria labels where needed?

3. RESPONSIVENESS — If applicable
   - Works at mobile/tablet/desktop?
   - Uses the project's breakpoint system?
   - Touch targets adequate size?

4. VISUAL COHERENCE — Does it look like it belongs?
   - Consistent with the rest of the app?
   - Not introducing new visual patterns without reason?
   - Spacing and alignment feel right?

Return:
UX_STANDARDS_SCORE: X/5 (5 = perfectly consistent, 1 = ignores all standards)

JUSTIFICATION (MANDATORY for any score below 4):
- Score is X because: [specific reason]
- To reach 5: [what to change]

STANDARDS_SOURCE: [docs/design-standards.md | discovered from existing code]

If discovered (no standards doc exists):
DISCOVERED_STANDARDS:
- Colors: [what system is used]
- Spacing: [what units/scale]
- Components: [patterns found]
- Layout: [approach]
(Include recommendation to create docs/design-standards.md from these findings)

VIOLATIONS:
- [file:line] uses [X] but project standard is [Y]
- [file:line] introduces new pattern [X] — existing pattern is [Y]
- [file:line] accessibility: [issue]

SUGGESTIONS:
- [improvement that would better match project standards]

GOOD_UX:
- [things that match standards well]
- [good accessibility practices]

STANDARDS_UPDATE:
If you found patterns in the new code that are BETTER than existing standards,
or new patterns that should become standards, note them here:
- [new pattern] should be added to design-standards.md because [reason]
`
})
```

---

## Step 4: Aggregate Results

After all 6 sub-agents return (or 4-5 if no frontend files), compile the full report. Do NOT filter findings. Every finding from every agent appears.

```
╔══════════════════════════════════════════════════════╗
║              DEEP REVIEW REPORT                      ║
╚══════════════════════════════════════════════════════╝

SPEC COMPLIANCE:       X/Y requirements
DESIGN COMPLIANCE:     matches/deviates
REUSE SCORE:           X/5
PATTERN SCORE:         X/5
SIMPLICITY SCORE:      X/5
SMELL SCORE:           X/5
ASSUMPTION SCORE:      X/5
ERROR HANDLING SCORE:  X/5
FIT FOR PURPOSE SCORE: X/5
UX STANDARDS SCORE:    X/5 (or N/A if no frontend)

Total findings: N

─── SPEC ISSUES ───
[ ] [missing/wrong/partial requirement]

─── FIT FOR PURPOSE ───
[ ] [scope creep / wrong level / too many things]
One-sentence: "[summary from Agent 5]"

─── ASSUMPTIONS NOT IN PLAN ───
[ ] [file:line] [what was decided] — needs user confirmation

─── DUPLICATION ───
Searches performed: N
[ ] [new thing at path:line] → [existing thing at path:line]

─── CODE SMELLS ───
[ ] [file:line] [smell]: [description]

─── ERROR HANDLING ───
[ ] [file:line] [fallback/swallow description]

─── UX/UI STANDARDS ───
[ ] [file:line] [violation]: [description]
Standards source: [doc | discovered]

─── GOOD ───
[things done well — always include positives]
```

---

## Step 5: Interactive Walkthrough

**This is the most important step. Do NOT skip it. Do NOT batch-fix.**

After showing the report, walk through EVERY finding one at a time using `AskUserQuestion`. The user decides what to do with each finding — not you.

### How to present each finding:

Use `AskUserQuestion` with clear, plain-English explanation. No jargon. Explain it like you're talking to someone smart who isn't looking at the code right now.

For each finding, structure it as:

```
AskUserQuestion({
  questions: [{
    question: "[Plain English: what's happening, why it matters, what could go wrong]

[file:line] — [the actual code snippet]

What would you like to do?",
    header: "Finding N",
    options: [
      { label: "Fix it", description: "[specific proposed fix]" },
      { label: "Leave it", description: "Accept this as-is, it's intentional" },
      { label: "Discuss", description: "I want to understand this better before deciding" }
    ],
    multiSelect: false
  }]
})
```

### Rules for the walkthrough:

1. **One finding at a time** — never batch multiple findings into one question
2. **Plain English first** — explain WHAT is happening and WHY it matters before showing code
3. **Always offer "Discuss"** — the user might want to talk through it, ask questions, or explain context you don't have
4. **If user picks "Discuss"** — have the conversation. Answer questions. Explain trade-offs. When they're ready, re-present the options
5. **If user picks "Fix it"** — note it down, move to next finding. Fix everything at the end
6. **If user picks "Leave it"** — move on, no argument
7. **Assumptions get special treatment** — for findings from Agent 4 (assumptions not in plan), always frame as: "The code does X, but the plan didn't specify this. Is X correct?"
8. **Group related findings** — if 3 findings are all about the same function, you CAN present them together in one AskUserQuestion, but still list each as a separate option

### Walkthrough order:

1. Spec issues first (missing/wrong requirements)
2. Fit for purpose (is this overbuilt or underbuilt?)
3. Assumptions not in plan (decisions that need confirmation)
4. Error handling (fallbacks and swallowed errors)
5. Code smells and duplication
6. UX/UI standards (if applicable)
7. Pattern violations

---

## Step 6: Apply Fixes

After the walkthrough, summarize what was decided:

```
Walkthrough Complete
═══════════════════════════════════════

FIX (N items):
- [finding] → [proposed fix]

ACCEPTED AS-IS (N items):
- [finding] → user confirmed intentional

Applying fixes now...
```

Apply all fixes. Then show the user a summary of changes made.

---

## Rules

- **Show scope first**: Confirm files with user before proceeding
- **Pass real content**: Sub-agents get actual file contents
- **Parallel execution**: Launch all 6 sub-agents at once (skip Agent 6 if no frontend files)
- **Fresh context**: Each sub-agent has no prior knowledge
- **Surface EVERYTHING**: Do not filter, prioritize, or condense sub-agent findings. Every finding appears in the report. The user decides what matters during the walkthrough.
- **Interactive walkthrough is mandatory**: After the report, walk through every finding with AskUserQuestion. No exceptions.
- **Plain English**: Explain findings like the user isn't staring at the code. What's happening, why it matters, what could go wrong.
- **Scores need justification**: Any score below 4/5 MUST include specific reasons and what would fix it. "3/5" with no explanation is not acceptable.
- **Assumptions are findings**: Every code decision not in the plan is a finding that needs user confirmation. Don't assume the AI made the right call.
- **Duplication requires proof**: Agent 2 must list searches performed — "no duplication" without searches is a failed review
- **Smells require line numbers**: Agent 3 must cite exact file:line for every smell — vague findings are rejected
- **No auto-fixing**: Never fix findings without walking through them with the user first
- **UX standards doc**: Agent 6 creates `docs/design-standards.md` if missing. After each review, ask user if any new patterns should be added to it. Keep the doc alive.
- **Fit for purpose is high priority**: Agent 5 findings go right after spec issues in the walkthrough — overcomplexity is the #2 AI failure mode after missing requirements

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
| Decisions not in the plan | Assumptions |
| Swallowed errors with fallbacks | Error Handling |
| catch-and-return-default | Error Handling |
| Optional chaining hiding required data | Error Handling |
| Scope creep / built too much | Fit for Purpose |
| Wrong abstraction level | Fit for Purpose |
| Too many responsibilities | Fit for Purpose |
| Gold plating | Fit for Purpose |
| Inconsistent UI patterns | UX/UI Standards |
| Hardcoded colors/spacing | UX/UI Standards |
| Missing accessibility | UX/UI Standards |

---

## Quick Mode

`/deep-review --quick` → Only runs:
1. Spec Compliance
2. Assumptions & Error Handling

(The 2 most critical for AI mistakes. Still does interactive walkthrough.)
