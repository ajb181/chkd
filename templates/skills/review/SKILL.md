---
name: review
description: Independent code review via sub-agent - rates complexity, quality, reuse, smell
args: files
---

# /review - Independent Code Review

Spawn a sub-agent for objective code review. Fresh context, no bias from the work you just did.

## Usage

`/review src/components/UserCard.tsx` or `/review` (reviews files from current task)

## Process

### 1. Identify Files to Review

If files specified, use those. Otherwise:
- Check current chkd task for `filesToChange`
- Or use `git diff --name-only` to find modified files

### 2. Spawn Review Sub-Agent

Use the Task tool with `subagent_type: "Explore"` for fresh context:

```
Task({
  subagent_type: "Explore",
  prompt: "[Review prompt below]",
  description: "Code review"
})
```

### 3. Review Prompt for Sub-Agent

Pass this to the sub-agent:

```
You are a code reviewer. Review the following files objectively.

FILES TO REVIEW:
[file contents here]

TASK CONTEXT:
[what was the task]

Rate each category 1-5:
- **Complexity**: Is this as simple as it could be? (5 = minimal, elegant)
- **Quality**: Error handling, types, edge cases? (5 = production-ready)
- **Reuse**: Did it leverage existing code? (5 = excellent reuse)
- **Smell**: Any code smells or anti-patterns? (5 = clean)

Return your review as:

RATINGS:
- Complexity: X/5
- Quality: X/5
- Reuse: X/5
- Smell: X/5

ISSUES (if any):
- [file:line] [issue] (severity: low/medium/high)

GOOD:
- [things done well]

SUMMARY:
[1-2 sentence summary]

APPROVED: yes/no
MUST_FIX: [list items that must be fixed before shipping, or "none"]
```

### 4. Handle Review Results

After sub-agent returns:

**If all ratings >= 3 and APPROVED = yes:**
```
✅ Review passed
   Complexity: 4/5, Quality: 4/5, Reuse: 5/5, Smell: 4/5

   Ready to proceed.
```

**If any rating < 3 or MUST_FIX has items:**
```
❌ Review found issues

MUST FIX before proceeding:
- [issue 1]
- [issue 2]

Address these issues, then run /review again.
```

### 5. Log the Review

Call the `decisions` logging (if chkd available):
- Log review result to `.chkd/decisions.json`
- Include ratings, approved status, mustFix items

## Rules

- **Fresh context**: Sub-agent must NOT have your conversation history
- **Be objective**: Don't argue with the review - fix or escalate to user
- **Block on failures**: Any rating < 3 = must address before continuing
- **User override**: If you disagree with review, ask user to decide

## When to Use

- After completing any implementation work
- Before marking a task as done
- Before running `/commit` or `/pr`
- When the workflow step says "Review"
