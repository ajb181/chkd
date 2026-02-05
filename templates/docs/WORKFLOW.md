# Workflow Orchestration

## 1. Plan Mode Default

Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
If something goes sideways, STOP and re-plan immediately - don't keep pushing
Use plan mode for verification steps, not just building
Write detailed specs upfront to reduce ambiguity

## 2. Subagent Strategy

Keep main context window CLEAN - offload research, exploration, parallel analysis to subagents
For complex problems, throw more compute at it via subagents
One task per subagent for focused execution

## 3. Self-Improvement Loop

After ANY correction from the user: update `tasks/lessons.md` with the pattern
Write rules for yourself that prevent the same mistake
Ruthlessly iterate on these lessons until mistake rate drops
Review lessons at session start for relevant project

## 4. Verification Before Done

Never mark a task complete without proving it works
Diff behavior between main and your changes when relevant
Ask yourself: "Would a staff engineer approve this?"
Run tests, check logs, demonstrate correctness

## 5. Demand Elegance (Balanced)

For non-trivial changes: pause and ask "is there a more elegant way?"
If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
Skip this for simple, obvious fixes - don't over-engineer
Challenge your own work before presenting it

## 6. Autonomous Bug Fixing

When given a bug report: just fix it. Don't ask for hand-holding
Point at logs, errors, failing tests -> then resolve them
Zero context switching required from the user
Go fix failing CI tests without being told how

---

## Reuse First — Never Duplicate

This is a mature, robust codebase. Assume everything you need already exists until proven otherwise.

### The Golden Rule

Before writing ANY new function, component, utility, hook, helper, type, constant, or abstraction — search the codebase first. The answer is almost always already there, possibly needing only a minor adjustment.

### Mandatory Search-Before-Create

- **Before creating a new function:** Search for existing functions that do the same or similar thing. Check utils, helpers, services, and shared modules.
- **Before creating a new component:** Search for existing components. Check shared/common component directories, feature modules, and UI libraries already in use.
- **Before adding a new dependency:** Check if the functionality is already covered by an existing dependency or a built-in utility in the codebase.
- **Before defining a new type/interface:** Search for existing types. Check shared type files, API response types, and domain models.
- **Before adding a new constant or config value:** Search for existing constants. Check env files, config modules, and shared constants.

### When You Find Something Close

- **Minor adjustment needed** → Modify the existing element. Extend its signature, add an optional parameter, broaden its scope slightly. This is the expected path 90% of the time.
- **Moderate refactor needed** → Refactor the existing element to support both the old and new use case. Do not create a parallel version.
- **The existing version is fundamentally wrong for the new need** → This is rare. See below.

### When Something Truly New Is Required

If — and only if — you have exhausted reuse options and genuinely need to introduce a significant new element:

1. **STOP. Do not implement.** Surface this to the user explicitly.
2. **Explain why reuse isn't viable:** Show what you searched, what you found, and why it doesn't fit.
3. **Propose the change in detail:** What will be added or reworked, where it will live, and how it integrates with existing patterns.
4. **Consider platform-wide impact:** Will other parts of the codebase benefit from this? Should it be a shared utility? Does it replace something that should be deprecated?
5. **Plan for consistency:** Follow existing naming conventions, file structure, and architectural patterns. New code should look like it belongs.
6. **Get explicit approval before writing a single line.**

### Red Flags You're About to Duplicate

- You're about to name something very similar to something that already exists
- You're copying logic from one file into another instead of extracting it into a shared module
- You're creating a new component that looks suspiciously like an existing one but "slightly different"
- You're writing a wrapper around a library that already has a wrapper in the codebase
- You're adding a new API call handler when a generic one already exists

### Accountability

- Every PR-worthy change should be able to answer: "Why couldn't this reuse what already exists?"
- If the answer is "I didn't check" — that's a failure. Go back and check.
- Duplicate code is tech debt created in real time. Treat it as a bug, not a shortcut.

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Core Principles

**Simplicity First**: Make every change as simple as possible. Impact minimal code.

**No Laziness**: Find root causes. No temporary fixes. Senior developer standards.

**Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

**Reuse Relentlessly**: The codebase is the source of truth. Search it, learn it, extend it — don't rebuild it.
