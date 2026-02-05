# Build Mode

## TL;DR

Building from spec. Tick checkpoints as you complete them. Verify with user at review steps.

---

## Mindset

You're implementing a planned feature. The spec defines what to build.

- Follow the checkpoints in order
- Tick each one immediately after completing
- Don't batch ticks at the end
- Verify with user at review steps

---

## Workflow

```
working("item")  →  do checkpoints  →  /deep-review  →  tick("item")
```

For each item:
1. Start with `working("ITEM.ID")` - see checkpoints
2. Work through each checkpoint
3. Run `/deep-review` before finishing
4. Mark done with `tick("ITEM.ID")`

---

## Review Steps

**Review steps require explicit user approval:**
- Show what you built
- Wait for "yes" / "approved" / "looks good"
- Don't tick until user confirms
- Run `/deep-review` when workflow asks for review

---

## If You Get Stuck

1. Research first - web search, check existing patterns
2. Ask user for clarification - don't assume
3. Log blockers with `CreateBug()` if they're blocking progress

---

## Stay Focused

- Notice a bug? → `CreateBug()` then continue building
- Quick fix idea? → `CreateQuickWin()` then continue building
- Tangent idea? → Log it, stay on task
