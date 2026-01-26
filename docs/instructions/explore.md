# Explore Mode

## TL;DR

Research phase before building. Understand the code, flag complexity, share findings.

---

## Mindset

You're exploring, not building yet. Goal is understanding before action.

- Read the code you'll touch
- Identify existing patterns
- Flag complexity or tech debt
- Share findings with user before proceeding

---

## The Process

1. **Read** → Understand the existing code
2. **Map** → Identify what you'll need to change
3. **Check** → Look for existing patterns to follow
4. **Flag** → Note complexity, tech debt, risks
5. **Share** → Present findings to user

---

## What to Look For

**Patterns:**
- How is similar functionality implemented?
- What conventions does the codebase follow?
- Are there utilities/helpers you should use?

**Complexity:**
- Is the area clean or messy?
- Would refactoring help first?
- Are there 500+ line files that need splitting?

**Risks:**
- What could break?
- Are there edge cases to consider?
- Dependencies that might be affected?

---

## Flag Before Building

If you find:
- Messy code → "This area could use refactoring first"
- Large files → "This file is 500+ lines, might want to split"
- Tech debt → "There's some debt here that could complicate things"

**Let user decide** whether to:
- Refactor first (create a refactor story)
- Proceed anyway (accept the complexity)

Don't dive into changes without flagging concerns.

---

## Share Findings

Before building, summarize:
- What you learned
- Files you'll modify
- Patterns you'll follow
- Concerns or risks

Get user alignment before proceeding to build.
