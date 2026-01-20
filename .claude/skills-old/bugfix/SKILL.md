---
name: bugfix
description: Fix bugs without feature creep - research first, minimal changes
---

# /bugfix - Fix Bugs Without Feature Creep

**Purpose**: Fix the reported bug. Nothing more. Go slow, research first, verify with the user, and resist the urge to "improve" things while you're in there.

---

## CRITICAL: BUG FIX ONLY

**You are in BUGFIX MODE. You fix what's broken, not what's missing.**

### What you CAN do:
- Research the issue (web search, docs, stack traces)
- Read code to understand the problem
- Ask user to test/verify things
- Make minimal changes to fix the bug
- Add regression test for the specific bug

### What you CANNOT do:
- Add new features
- Refactor "while you're in there"
- Improve performance (unless that IS the bug)
- Add error handling for unrelated scenarios
- Clean up code style
- "Fix" things that aren't broken

### The Rule:
> If the code worked before and still works after, **don't touch it**.

---

## The Bugfix Process

### 1. UNDERSTAND - Don't code yet

**First, gather information:**

```
"Tell me more about the bug:
- What did you expect to happen?
- What actually happened?
- Can you reproduce it consistently?
- When did it start? (After a specific change?)"
```

**Read the error/stack trace carefully.** Don't guess.

### 2. RESEARCH - Before brute force

**Search before you experiment:**

```bash
# Web search for the error message
WebSearch: "error message here" site:stackoverflow.com OR site:github.com

# Search docs
WebSearch: "library name" "the specific issue"
```

**Why research first?**
- Someone probably hit this before
- The fix might be non-obvious
- Brute force wastes time and can introduce new bugs

**Tell the user what you found:**
> "I found a similar issue on GitHub. It looks like this happens when X. Let me check if that applies here..."

### 3. REPRODUCE - Confirm the bug

**Before fixing, confirm you understand it:**

```
"Can you run this command and tell me what you see?"
"Does the bug happen if you do X?"
"What's in the console/logs when it fails?"
```

**Ask the user to verify.** Don't assume.

### 4. ISOLATE - Find the root cause

**Narrow it down:**

- Read the relevant code
- Add temporary logging if needed
- Check recent changes (git log, git diff)
- Test hypotheses with the user

**Think out loud:**
> "Based on the error, I think the issue is in X. Let me check... Yes, on line 42, we're calling Y without checking for null. That matches your error."

### 5. FIX - Minimal change only

**The smallest fix that solves the problem:**

- Don't refactor
- Don't "improve" nearby code
- Don't add features
- Just fix the bug

**Before editing, explain:**
> "I'm going to add a null check on line 42. This should prevent the crash when Z is undefined. Sound right?"

### 6. VERIFY - User confirms the fix

**Don't assume it worked:**

```
"Can you test this now? Try the same steps that caused the bug."
"Does it work as expected now?"
"Any other issues?"
```

---

## Handling Scope Creep

### When you notice other issues:

```
"While looking at this, I noticed X could also be improved.
That's not the bug we're fixing, so I'm noting it for later."
```

Then capture it:

```bash
chkd bug "Improvement: what you noticed"
```

### When user asks for features:

```
"That's a feature request, not a bug fix. Let me capture it:
[captures to chkd]
Let's finish the bug fix first, then you can plan that feature properly."
```

### When you want to refactor:

**Stop yourself.** Ask:
- Is this required to fix the bug? -> Do it
- Would the bug be fixed without this? -> Don't do it

---

## Red Flags - You're Going Off Track

Watch for these signs you're drifting from bugfix:

| You're thinking... | Reality check |
|-------------------|---------------|
| "While I'm here, I should also..." | No. Fix the bug only. |
| "This code is messy, let me clean it up" | Not your job right now. |
| "I could add a feature that prevents this" | That's a feature, not a fix. |
| "Let me refactor this to be more robust" | Fix the bug. Capture the refactor idea. |
| "I'll just quickly improve..." | Nothing is "just quickly" in bugfix mode. |

---

## Debugging Checklist

Before declaring victory:

- [ ] User confirmed the original bug is fixed
- [ ] You didn't change unrelated code
- [ ] You didn't add new features
- [ ] Any ideas/improvements are captured in chkd
- [ ] The fix is minimal and focused

---

## Example Bugfix Session

```
User: "The save button doesn't work"

Claude: "Let me understand the issue:
- What happens when you click it? Nothing? Error?
- Is there anything in the browser console?
- Did this work before? When did it stop?"

User: "It shows a spinner forever. Console says 'TypeError: Cannot read property 'id' of undefined'"

Claude: "Thanks. Let me search for this pattern...
[WebSearch: svelte TypeError Cannot read property of undefined save button]

I found similar issues. Usually this means we're accessing data before it's loaded. Let me check the save handler...

[Reads code]

Found it. On line 87, we call `user.id` but `user` can be null if the session hasn't loaded yet.

The fix: Add a guard check before accessing user.id.

Should I make this change?"

User: "Yes"

Claude: [Makes minimal edit - just the null check]

"Done. Can you test the save button now?"

User: "Works! But while you're there, could you also add a loading indicator?"

Claude: "That's a feature, not a bug fix. I've captured it in chkd:
'Feature: Add loading indicator to save button'

The bug is fixed. Want to plan that feature separately?"
```

---

## Important Principles

1. **Research before coding** - Web search is faster than trial and error
2. **Verify with user** - They know the expected behavior
3. **Minimal changes** - The smallest fix that works
4. **Capture, don't act** - Ideas go to chkd, not into the code
5. **Stay humble** - Ask questions, don't assume
6. **Go slow** - Rushing causes new bugs

**Bugfix mode = disciplined restraint.**
