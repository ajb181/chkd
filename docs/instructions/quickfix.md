# Quick Fix Mode

## TL;DR

Small improvements from the quick wins list. Fast but still verify.

---

## Mindset

Quick wins are small improvements - not urgent, not complex. Keep them quick.

- Pick one, do it, mark done
- Don't over-engineer
- Commit and push after each one

---

## Workflow

```
wins()           →  see what's available
[pick one]       →  do the work
won("title")     →  mark it done
commit + push    →  don't forget!
```

---

## Guidelines

**Keep it simple:**
- If it's getting complex, it's not a quick win
- If it needs design discussion, it's a story
- If it's blocked, move on to another

**Still verify:**
- Quick doesn't mean sloppy
- Test that it works
- User should see the result

---

## After Each One

1. Commit with clear message
2. Push to remote
3. Then mark as won

Don't batch - complete the cycle for each quick win.

---

## If Something Grows

If a "quick win" reveals a bigger issue:
- Log the bigger issue with `bug()` or `add()`
- Decide: finish the quick part now, or pivot to the bigger thing
- Ask user if unsure
