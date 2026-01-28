# Handover: Workflow Sub-Items Feature

**Date:** 2026-01-23
**Status:** Lost in the weeds - needs fresh start

---

## The Original Insight (Don't Lose This)

**The Problem chkd Solves:**

Both humans and AI want to go fast. Both skip steps. Both batch work.

- Human: "Just build SD.13" → AI builds 10 things → 3 features missing, no one notices
- The natural tendency is speed without friction

**The Solution:**

chkd is a **collaboration contract** that forces checkpoints where:
1. AI shows what it did
2. Human confirms or redirects
3. Then next step

**Neither party can skip this. The tool enforces it.**

---

## What We Were Trying To Build

**BE.20: Workflow Step Sub-Items**

The idea: When you add a task, each workflow step (Explore, Design, Prototype, etc.) automatically gets sub-items that force a checkpoint.

**Example of what we WANTED:**

```
- [ ] Explore: research problem, check existing code/patterns
  - [ ] Research: investigate codebase and problem space
  - [ ] Share: inform user of findings before continuing  ← CHECKPOINT

- [ ] Prototype: build UI with mock data
  - [ ] Build: create the prototype
  - [ ] Verify: compare to spec/wireframe  ← CHECKPOINT
```

The sub-items create natural pause points between human and AI.

---

## Where We Got Lost

1. **Added the 8-step workflow everywhere** (Explore → Design → Prototype → Feedback → Implement → Polish → Document → Commit) ✓

2. **Updated all the files:**
   - `FeatureCapture.svelte` - DEFAULT_TASKS now has 8 steps
   - `writer.ts` - DEFAULT_WORKFLOW_STEPS now has 8 steps
   - `SPEC.md` - Workflow template updated
   - `/chkd` skill - Updated to reference 8 steps
   - Templates - Updated

3. **Then we tried to spec BE.20 itself** and it became:
   - Generic workflow placeholders
   - "Build: update FeatureCapture with nested sub-items" ← vague
   - Lost the WHAT in favor of process
   - No concrete understanding of HOW it should work

---

## What's Missing (The Gap)

We never answered these questions:

1. **What's the data structure?**
   - Currently DEFAULT_TASKS is `string[]`
   - Need it to be something like `{ step: string, children: string[] }[]`?
   - Or something else?

2. **How does buildItemLines() change?**
   - Currently adds flat sub-items
   - Needs to add nested sub-items
   - What's the indent structure?

3. **What does the OUTPUT look like?**
   - We never wrote down a concrete example of what SPEC.md should look like after `chkd add "My Feature"`

4. **Is this even the right approach?**
   - Maybe the nested sub-items are overkill
   - Maybe a simpler solution exists

---

## Files Changed In This Session

| File | Change |
|------|--------|
| `docs/GUIDE.md` | Added philosophy section ("The Problem chkd Solves") |
| `CLAUDE.md` | Added condensed philosophy |
| `templates/CLAUDE-chkd-section.md` | Added philosophy |
| `templates/docs/GUIDE.md` | Added philosophy |
| `src/lib/components/FeatureCapture.svelte` | DEFAULT_TASKS now 8 steps |
| `src/lib/server/spec/writer.ts` | DEFAULT_WORKFLOW_STEPS now 8 steps |
| `docs/SPEC.md` | Updated workflow template, added BE.20 (vague) |
| `templates/docs/SPEC.md.template` | Updated workflow template |
| `templates/skills/chkd/SKILL.md` | Updated to reference 8 steps |

---

## What To Do Next

### Option A: Design First
1. Write out exactly what a new feature should look like in SPEC.md (concrete example)
2. Define the data structure for nested sub-items
3. Then spec the implementation with specific tasks

### Option B: Simpler Solution
1. Maybe nested sub-items in the spec is overkill
2. Maybe the `/chkd` skill instructions are enough to guide behavior
3. Maybe we just need better prompting, not structural changes

### Option C: Question the Premise
1. Does adding nested checkboxes actually force checkpoints?
2. Or does Claude just tick them all anyway?
3. What actually creates the pause?

---

## The Core Question

**What mechanism actually forces the checkpoint?**

- Is it the checkbox structure in SPEC.md?
- Is it the `/chkd` skill instructions?
- Is it the MCP tools (chkd_working, chkd_tick)?
- Is it something else entirely?

We've been adding structure without answering this.

---

## Key Philosophy (Preserve This)

From the session:

> "chkd exists to slow down both human and AI to the speed of good work."
>
> Tick. Verify. Tick. Verify.
>
> Same rules for both.

This is now in GUIDE.md and CLAUDE.md. Don't lose it.

---

## Commands To Check State

```bash
# See what's changed
git status
git diff --stat

# See the current BE.20 spec
grep -A 30 "BE.20" docs/SPEC.md

# See the 8 steps in writer.ts
grep -A 10 "DEFAULT_WORKFLOW_STEPS" src/lib/server/spec/writer.ts
```

---

## Recommendation

Start fresh with a clear question:

**"What does a well-specified task look like that naturally creates checkpoints between human and AI?"**

Write the example output first. Then figure out how to generate it.
