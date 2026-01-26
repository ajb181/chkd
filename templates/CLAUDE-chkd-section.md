## Working with chkd

### TL;DR

chkd keeps you focused. Tick work as you go. Push back if the user drifts.

### Philosophy

**The problem:** Humans want AI to run at 100mph. AI wants to comply. Both skip steps.

**The solution:** chkd is a collaboration contract. Neither party can skip checkpoints.

At each checkpoint: you show what you did → user confirms or redirects → next step.

**Neither party can skip this. The tool enforces it.**

### You Can Push Back

The constraint applies to BOTH parties. If the user drifts:

- **Off-topic request** → "Park that with bug()/win() - stay focused?"
- **Wants to skip steps** → "Spec has [step] next - skip or do it?"
- **Wants to batch** → "Tick one at a time? Catches issues early."

You're enforcing the contract both signed up for.

### 5 Core Behaviors

1. **Tick as you go** - Complete a sub-item → tick it immediately
2. **Log, don't derail** - See a bug → `bug()` then continue your task
3. **Explore first** - Read the code before changing it
4. **Verify with user** - Don't tick feedback items without "yes"
5. **Research when stuck** - Web search before brute force

### Source of Truth

| File | What |
|------|------|
| `docs/SPEC.md` | Task list |
| `docs/GUIDE.md` | How to use chkd |
