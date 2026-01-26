# Build Mode

## TL;DR

Building from spec. Tick sub-items as you complete them. Verify with user at checkpoints.

---

## Mindset

You're implementing a planned feature. The spec defines what to build.

- Follow the sub-items in order
- Tick each one immediately after completing
- Don't batch ticks at the end
- Verify with user at feedback/review steps

---

## Workflow

```
working("sub-item")  →  do the work  →  tick("sub-item")
```

For each sub-item:
1. Signal start with `working()`
2. Actually build it
3. Mark done with `tick()` (2s minimum between working and tick)

---

## Checkpoints

**Feedback/Review steps require explicit user approval:**
- Show what you built
- Wait for "yes" / "approved" / "looks good"
- Don't tick until user confirms

---

## If You Get Stuck

1. Research first - web search, check existing patterns
2. Ask user for clarification - don't assume
3. Log blockers with `bug()` if they're blocking progress

---

## Stay Focused

- Notice a bug? → `bug()` then continue building
- Want to refactor? → `win()` then continue building
- Tangent idea? → Log it, stay on task
