# chkd Philosophy

## TL;DR

chkd is a collaboration contract between human and AI. Neither party can skip checkpoints. Tick. Verify. Tick. Verify.

---

## The Problem

It's not just "Claude forgets to verify."

**It's: Humans want to let AI run at 100mph, and AI wants to comply.**

Both parties have the same bias: go fast, skip steps, batch everything, "just get it done."

### Human Nature

- "Let it run, I'll review at the end"
- "I trust the AI, it's probably fine"
- "Faster is better"
- "Checking each step is tedious"

### AI Nature

- "I'll do everything you asked"
- "I'll optimize for completion"
- "I won't stop to verify unless told"
- "I'll make assumptions to keep moving"

Both want the same thing: **Speed without friction.**

---

## The Solution

chkd says: No. Tick. Verify. Tick. Verify.

### Same Discipline, Both Parties

| Without chkd | With chkd |
|--------------|-----------|
| Human: "Build SD.13" | Human: "Build SD.13" |
| AI: builds 10 things in one go | AI: "Working on SD.13.1" |
| Human: "Looks done!" | AI: "Done. Ticking SD.13.1" |
| 3 features missing, no one notices | Human: "Ok, next" |
| | AI: "Working on SD.13.2..." |
| | *forced pause at each step* |

The human can't say "just do it all" because the tool doesn't work that way.
The AI can't batch because the workflow demands tick-by-tick progress.

**The constraint applies to both.**

---

## The Contract

chkd is a collaboration contract between human and AI.

It forces checkpoints where both parties must align:

1. AI shows what it did
2. Human confirms or redirects
3. Then next step

Neither party can skip this. The tool enforces it.

### The Verify Step

The Verify step isn't just for Claude. It's a handoff point:

```
- [ ] Build: implement the thing
- [ ] Verify: compare to spec, iterate if gaps  ← HUMAN + AI checkpoint
- [ ] Commit: what was built + assumptions
```

At "Verify":
- AI shows the work
- Human looks at it (or AI describes what to look at)
- Gap found? Iterate before moving on
- No gap? Tick, commit, continue

**Neither party can skip the checkpoint. That's the point.**

### The Commit Is Also a Contract

The commit message with assumptions isn't just documentation. It's:

1. **AI declares:** "Here's what I built, here's what I assumed"
2. **Human sees:** The assumptions, the gaps noted
3. **Both agree:** This is done, move on

If human doesn't like the assumptions, they stop. If AI skipped something, it's visible.

---

## Simple Statement

**chkd exists to slow down both human and AI to the speed of good work.**

Tick. Verify. Tick. Verify.

Same rules for both.

---

## Not Rigid - Intelligent

chkd is NOT about rigid enforcement. It's about intelligent collaboration.

- Hooks protect against dangerous operations (data loss, corruption)
- But user can skip when needed (UI toggles)
- Nudges guide behavior, don't block it
- The goal is quality work, not compliance

The philosophy is: protect don't trap, guide don't block, collaborate don't control.
