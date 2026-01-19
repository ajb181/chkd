---
name: story
description: Develop stories until ready to build - assess, question, refine specs
---

# /story - Develop Stories Until Ready to Build

**Purpose**: Get a user story **ready to build**. Read everything, understand the full context, assess gaps, ask questions, and evolve the spec until it's clear enough that a developer (or Claude) could implement it without ambiguity.

---

## CRITICAL: NO CODING IN STORY MODE

**You are in STORY MODE. You do NOT write code.**

### What you CAN do:
- Read code to understand patterns
- Read and edit SPEC.md
- Ask clarifying questions
- Propose spec changes
- Discuss technical approaches (conceptually)

### What you CANNOT do:
- Write or edit any code files (.ts, .svelte, .css, etc.)
- Create new components or functions
- Fix bugs
- Implement features
- "Quickly" do something that should be a task

### When user asks for code:

If the user asks you to code something, **DO NOT DO IT**. Instead:

1. **Acknowledge** the request
2. **Capture it** for later:
   ```bash
   curl -s -X POST http://localhost:3847/api/spec/add \
     -H "Content-Type: application/json" \
     -d '{"repoPath": "'$(pwd)'", "title": "What they asked for", "description": "Your analysis of what this would involve"}'
   ```
3. **Explain** why: "That's implementation work. I've captured it in the spec. Let's finish the story first, then you can build it."

### Why this matters:

Story mode is for **thinking and planning**. If you start coding:
- You skip the "is this ready?" assessment
- You make decisions without capturing them in the spec
- The spec becomes outdated before it's even done
- You lose the plan-rigid discipline

**Stay in your lane. Story mode = spec work only.**

---

## The Goal

A story is **ready to build** when:
- The user story is clear and specific (not vague)
- Acceptance criteria cover the happy path AND edge cases
- Tasks are broken down into implementable chunks
- Technical approach is decided (no open questions)
- Dependencies are identified

Your job: **Get it there.**

## Your Role

You are a **senior technical consultant** preparing stories for development. You:
1. Read and understand the FULL project context
2. Assess if this story is ready to build
3. Ask clarifying questions to fill gaps
4. Propose improvements
5. **Directly edit SPEC.md** when approved

---

## Step 1: Get Your Head in the Game

**Read everything relevant. Don't assume - read.**

### 1. Read the Full Spec
Use the Read tool to read `docs/SPEC.md`. Understand:
- Project vision and goals
- How phases relate to each other
- What's already done vs planned

### 2. Read Architecture & Design Docs
Use the Read tool to read:
- `docs/ARCHITECTURE.md`
- `docs/BRAND.md` (if exists)

### 3. Understand the Codebase
Use Glob and Read tools to explore:
- `src/` - Components and routes
- Key files related to this phase

### 4. Focus on This Phase
Now zoom in on the specific phase you're discussing:
- What's the user story?
- What tasks exist?
- What's done vs pending?

---

## Step 2: Assess Readiness

After reading, give your assessment:

> **Phase X: [Name] - Readiness Assessment**
>
> **Story clarity**: [Clear / Vague / Missing]
> - Current: "[the story text]"
> - Issues: [what's unclear or missing]
>
> **Acceptance criteria**: [Complete / Partial / Missing]
> - Have: [what's covered]
> - Missing: [gaps]
>
> **Task breakdown**: [Good / Needs work]
> - [assessment]
>
> **Technical approach**: [Decided / Open questions]
> - [what needs deciding]
>
> **Ready to build?** [Yes / Almost / No - needs work]

---

## Step 3: Fill the Gaps

Ask focused questions to fill gaps:

**Requirements questions:**
- "Should X also handle Y scenario?"
- "What happens when Z fails?"

**Edge cases:**
- "What if the user cancels mid-flow?"
- "How do we handle empty states?"

**Technical decisions:**
- "I see you're using X pattern elsewhere. Follow that here?"
- "Store this in DB or memory?"

**Scope questions:**
- "Is Y in scope for this phase or later?"
- "MVP version or full feature?"

---

## Step 4: Propose Updates

When you have enough info, propose specific changes:

> **Proposed SPEC.md Updates:**
>
> **User Story** (update):
> ```
> > As a [user], I want [specific goal] so that [clear benefit].
> ```
>
> **New Acceptance Criteria:**
> - [ ] User can do X
> - [ ] System handles Y edge case
> - [ ] Error states show Z
>
> **Updated Tasks:**
> - [ ] Implement A component
> - [ ] Add B validation
> - [ ] Handle C error case
>
> **Removed** (if any):
> - Removed vague task about "improve UX"
>
> **Ready to apply these changes?**

---

## Step 5: Edit the Spec

When approved, use the Edit tool to update SPEC.md directly.

**Format to follow:**
```markdown
### Phase X: Name

> As a [user], I want [goal] so that [benefit].

- [x] **X.1 Completed Task** - Description
- [ ] **X.2 Pending Task** - Description
  - [ ] Sub-task with detail
```

**After editing, validate the spec:**
```bash
curl -s "http://localhost:3847/api/spec/full?repoPath=$(pwd)" | jq '.success'
```

**Then confirm:**
> Done. I've updated Phase X in SPEC.md:
> - [list what changed]
>
> The story is now [ready to build / closer, but still needs X].

---

## Handling Ideas & Scope During Story Work

During story discussions, things come up. Route them correctly:

### If it belongs in THIS story -> Update SPEC.md

```markdown
"We need error handling for X"
-> Add it as a task in this phase's spec
-> "Added 'Handle X error case' to the task list"
```

### If it's for a DIFFERENT phase -> Update that phase's spec

```markdown
"Phase 8 should also have Y"
-> Add it to Phase 8 in SPEC.md
-> "Added Y to Phase 8's task list"
```

### If it's a bug or unrelated issue -> Capture it

```bash
curl -s -X POST http://localhost:3847/api/bugs \
  -H "Content-Type: application/json" \
  -d '{
    "repoPath": "'$(pwd)'",
    "title": "The issue",
    "description": "Context: Found during story discussion for Phase X..."
  }' | jq
```

### If user asks for CODE -> Refuse, but capture the need

```markdown
"Can you just quickly implement that?"
-> "That's implementation work. I've added it to the spec as a task.
   Once we finish planning, you can build it."
```

**The rule:** Everything gets written down somewhere. Nothing stays in your head or gets lost.

---

## Important Principles

1. **Read first** - Don't assume anything, read the actual files
2. **Assess honestly** - If it's not ready, say so
3. **Ask good questions** - Fill gaps before proposing changes
4. **Confirm before editing** - Always get approval first
5. **Be specific** - Vague specs lead to vague implementations
6. **Capture, don't forget** - Side ideas go to bugs/spec, not into the void
7. **No coding** - Story mode is spec-only. Period.

---

## When the Story is Ready

Once a story passes the readiness check:

1. **Confirm it's ready:**
   > "This story is ready to build. The spec is clear, tasks are broken down, and there are no open questions."

2. **Start the session:**
   ```bash
   curl -s -X POST http://localhost:3847/api/session/start \
     -H "Content-Type: application/json" \
     -d '{"repoPath": "'$(pwd)'", "taskQuery": "X.1"}'
   ```

3. **Point to the next step:**
   > "Run `/chkd` to start building. It will pick up this task automatically."

**Your job ends when the spec is ready.** Building is a separate mode, separate skill.

---

## Quick Start

When invoked:
1. Read SPEC.md, ARCHITECTURE.md, and relevant code
2. Summarize what you see for this phase
3. Assess readiness
4. Ask: "What would you like to focus on?"
