---
name: epic
description: Plan and create a large feature (interview → design → stories)
args: epic_name
---

# /epic <name> - Epic Planning Mode

**Usage:** `/epic "Mobile Capture App"` - plan and create a large feature

---

## Overview

This skill guides you through planning a large feature that spans multiple spec items. It's a full workflow:

1. **Interview** - Understand the feature through questions
2. **Design** - Break down into stories with areas (FE/BE/SD)
3. **Create** - Make the epic doc + all linked spec items

---

## On Startup

### 1. Parse the epic name

The user runs `/epic "Mobile Capture App"` - extract the name.

If no name provided:
> "What's the epic? Run `/epic "Feature Name"`"

### 2. Start an impromptu session

```
chkd_impromptu("Planning epic: [name]")
```

### 3. Acknowledge and begin interview

> "Let's plan **[Epic Name]**. I'll ask some questions to understand the scope, then we'll break it down into stories."

---

## Phase 1: Interview

Ask questions to understand the feature. Don't assume - ask!

### Core questions (ask these):

1. **What problem does this solve?**
   > "What's the main problem this feature solves? Who has this problem?"

2. **What's the core user flow?**
   > "Walk me through the main user journey. What does the user do, step by step?"

3. **What are the must-haves vs nice-to-haves?**
   > "What absolutely must be in v1? What could wait for later?"

4. **Are there any technical constraints?**
   > "Any existing systems this needs to integrate with? Technical limitations?"

5. **What does success look like?**
   > "How will you know this feature is working well?"

### Follow-up as needed:

- If unclear: "Can you give me an example?"
- If too broad: "Let's focus on the core. What's the minimum viable version?"
- If technical: "How does this connect to existing [X]?"

### When to move on:

After 3-5 questions, summarize understanding:

> "Let me make sure I understand:
> - **Problem:** [summary]
> - **Core flow:** [summary]
> - **Must-haves:** [list]
> - **Constraints:** [any]
>
> Does that capture it? Anything I'm missing?"

Wait for confirmation before proceeding.

---

## Phase 2: Design

Break the feature into stories (spec items).

### 1. Identify areas

Based on the interview, identify which areas are involved:
- **FE** - Frontend/UI components
- **BE** - Backend/API endpoints
- **SD** - Site design/infrastructure

### 2. Draft stories

Create a list of stories, each with:
- Area code (FE/BE/SD)
- Clear title
- Brief description

### 3. Present to user

> "Here's how I'd break this down:
>
> **Frontend (FE):**
> - FE.X: [Story 1] - [description]
> - FE.X: [Story 2] - [description]
>
> **Backend (BE):**
> - BE.X: [Story 1] - [description]
>
> **Dependencies:**
> - [Story A] should come before [Story B] because...
>
> Does this breakdown make sense? Want to add, remove, or change anything?"

### 4. Iterate

Adjust based on feedback until user approves.

---

## Phase 3: Create

Once user approves the breakdown:

### 1. Create the epic document

```
chkd_epic("[Epic Name]", "[description from interview]", ["scope item 1", "scope item 2", ...])
```

This creates `docs/epics/[epic-slug].md` with the auto-generated tag.

### 2. Note the epic tag

The tag is auto-generated from the name (e.g., "Mobile Capture App" → "mobile-capture-app").

### 3. Create each story

For each story in the breakdown:

```
chkd_add("[Story title]", areaCode="[FE/BE/SD]", epic="[epic-tag]", description="[story description]")
```

### 4. Confirm creation

> "Created epic **[Name]** with [N] stories:
>
> - [x] Epic doc: `docs/epics/[slug].md`
> - [x] FE.X: [Story 1]
> - [x] FE.X: [Story 2]
> - [x] BE.X: [Story 3]
>
> All linked with tag `#[epic-tag]`
>
> Run `chkd_epics` to see progress, or `/chkd FE.X` to start building."

---

## When Done

### End the session

```
chkd_done()
```

---

## Rules

### DO:
- Ask questions before assuming
- Summarize understanding and confirm
- Let user adjust the breakdown
- Create epic FIRST, then stories
- Link all stories to the epic tag

### DON'T:
- Skip the interview
- Create stories without user approval
- Assume scope - ask!
- Create the epic without stories (that's just an empty doc)
- Rush through - this is planning, take time to get it right

---

## Example Flow

```
User: /epic "User Authentication"

Claude: Let's plan **User Authentication**. I'll ask some questions...

[Interview - 3-5 questions]

Claude: Here's the breakdown:
- FE.12: Login page - email/password form with validation
- FE.13: Signup page - registration with email verification
- BE.8: Auth API - login, logout, session management
- BE.9: Password reset - forgot password flow

Sound good?

User: Yes, but add 2FA as a future item

Claude: Got it. Creating...

[Creates epic + stories]

Claude: Created epic **User Authentication** with 4 stories + noted 2FA for future.
```
