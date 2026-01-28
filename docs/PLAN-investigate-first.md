# Plan: Investigate-First Workflow

> Building this plan collaboratively. User makes decisions, Claude facilitates.

---

## Problem

- AI (Claude) dives into changes without understanding complexity first
- Messy code gets messier because we add features on top
- Context gets lost when AI tries to be "efficient"
- No easy way to edit AI-generated content in UI

---

## Solutions

### 1. "Investigate Before Changing" Guidance

Add to CLAUDE.md and /chkd skill:

```markdown
## Before Making Changes

If the code you're about to touch looks complex or messy:
1. Tell the user: "This area could use refactoring first"
2. Let them decide
3. If yes: `chkd pause` current task, create refactor story, do that first
4. If no: proceed with minimal changes
```

**Status:** To implement

---

### 2. UI Editability

Everything should be editable:
- **At creation:** Edit before saving
- **Afterward:** Edit existing items anytime
- Bug titles/descriptions
- Quick win titles
- Story titles/descriptions

AI might get 90% right, user tweaks the rest.

**Status:** To implement

---

### 3. Discovery Phase Enhancements

Keep it simple - just guidance for Claude:
- Look at the code before proposing changes
- Offer feedback when appropriate ("this file is complex", "might want to refactor first")
- User can always ask for more context if needed

No fancy complexity analysis - just encourage thoughtful observation.

**Status:** Add guidance to CLAUDE.md and /chkd skill

---

### 4. CLI Reminder on `chkd working` (Explore tasks only)

When Claude calls `chkd working` on a task containing "Explore" keyword:
- Show reminder to research first
- Not for every task - only Explore phase tasks

Example output:
```
✓ Working on: Explore: check existing auth patterns

💡 Research first:
   - Review the code you'll touch
   - Flag complexity or refactor opportunities to user
```

Regular tasks (Design, Prototype, Implement, etc.): no extra message.

**Status:** To implement in CLI

---

### 5. AI Story/Task Setup Strategy

**Single API call creates everything:**
```json
{
  "title": "Clean, concise title (AI cleaned)",
  "story": "As a [user], I want [feature] so that [benefit]",
  "area": "SD|FE|BE",
  "tasks": ["Explore: ...", "Design: ...", "Prototype: ...", "Feedback: ...", "Implement: ...", "Polish: ..."]
}
```

**AI role - structure, don't rewrite:**
- Clean up title (remove "can we", "I want", etc.) but keep meaning
- Generate user story from context (preserve user's words)
- Pick appropriate area
- Use standard 6-phase template, adapt descriptions to feature

**Template phases (flexible, not rigid):**
1. Explore: research problem, check existing code/patterns
2. Design: plan approach (skip wireframes for backend-only)
3. Prototype: build with mock data where it makes sense
4. Feedback: user reviews and approves
5. Implement: connect real logic
6. Polish: error states, edge cases, performance
7. Docs: update documentation & guide if relevant (optional)

**Flexibility:**
- Not every phase applies to every feature (skip what doesn't make sense)
- Backend tasks don't need wireframes
- Some projects have custom steps that fit their workflow
- Goal: solid controlled dev cycle, not rigid checklist

**Key principles:**
- Don't lose context - user's original words are valuable
- Template is a guide, adapt to what makes sense
- Task descriptions fit the actual feature
- Everything editable in UI after creation

**Status:** Rethink LLM prompts with this approach

---

### 6. AI for Bugs & Quick Wins

Same philosophy - structure, don't over-summarize:

**Bugs:**
- Clean title (what's broken)
- Keep description details
- Suggest severity based on keywords
- Flag if looks small (<10 lines) or big

**Quick wins:**
- Clean title (action verb + what)
- Estimate effort (tiny/small/medium)
- Keep original context

**Status:** Update LLM prompts

---

## Open Questions

1. ~~What does "code complexity review" look like in practice?~~ → Just guidance, no tooling
2. Priority order for these improvements?
3. ~~Should investigation be automatic or opt-in?~~ → Reminder on Explore tasks only

---

## Next Steps

1. Update CLAUDE.md with "investigate before changing" guidance
2. Update /chkd skill with same
3. Add CLI reminder on `chkd working` for Explore tasks
4. Rethink LLM prompts (preserve context, use template)
5. Add UI editability for bugs/wins/stories
