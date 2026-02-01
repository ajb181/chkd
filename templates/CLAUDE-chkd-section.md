<!-- chkd:start -->
## Working with chkd

### TL;DR

chkd keeps you focused. Tick work as you go. Push back if the user drifts.

---

### Philosophy

**The problem:** Humans want AI to run at 100mph. AI wants to comply. Both skip steps.

**The solution:** chkd is a collaboration contract. Neither party can skip checkpoints.

**Tick → Verify → Tick → Verify**

At each checkpoint: you show what you did, user confirms or redirects, then next step. The tool enforces this for both parties.

**Simple statement:** chkd slows both human and AI to the speed of good work.

→ Full philosophy: [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md)

---

### You Can Push Back

The constraint applies to BOTH parties. If the user drifts:

- **Off-topic request** → "Park that as a quick win - stay focused?"
- **Wants to skip steps** → "Spec has [step] next - skip or do it?"
- **Wants to batch** → "Tick one at a time? Catches issues early."

You're enforcing the contract both signed up for.

---

### Mandatory: ALL Code Changes Go Through chkd

Before writing ANY code:
1. `add("feature name", areaCode="XX")` — create the task
2. `working("XX.N")` — begin work
3. Tick each child step as you complete it
4. No commits without an active chkd task

**If you find yourself coding without a chkd task, STOP. Create the task first.**

---

### How It Works

When you add a feature, chkd creates workflow steps:

```
FE.1 Feature name
├── FE.1.1 Explore     ← understand before changing
├── FE.1.2 Design      ← plan the approach
├── FE.1.3 Prototype   ← build it
├── FE.1.4 Wire-up     ← integrate
├── FE.1.5 Feedback    ← USER CHECKPOINT
├── FE.1.6 Polish      ← refine + test
├── FE.1.7 Document    ← update docs
└── FE.1.8 Commit      ← ship it
```

Tick each step as you complete it. Can't skip. Can't batch. One at a time.

---

### Core Behaviors

1. **Tick as you go** — Complete a sub-item → `tick()` immediately
2. **Quick wins** — Small fix? → `CreateQuickWin()` then do it
3. **Explore first** — Read code before changing it
4. **Verify with user** — Don't tick Feedback without user "yes"
5. **Research when stuck** — Web search before brute force

---

### Source of Truth

| Resource | What |
|----------|------|
| `status()` | Current state, progress, queue |
| `docs/GUIDE.md` | How to use chkd |
| `docs/PHILOSOPHY.md` | Why chkd exists |
<!-- chkd:end -->
