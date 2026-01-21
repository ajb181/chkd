---
name: bugfix
description: Fix bugs without feature creep - research first, minimal changes
---

# /bugfix - Fix Bugs Without Feature Creep

**Purpose**: Fix the reported bug. Nothing more. Go slow, research first, verify with the user, and resist the urge to "improve" things while you're in there.

---

## FIRST: Start Debug Session

**When entering bugfix mode, ALWAYS do this first:**

1. Check project status: `chkd status`
2. Create/append to debug notes file:

```bash
echo "## Debug Session: $(date '+%Y-%m-%d %H:%M')" >> .debug-notes.md
echo "**Bug:** [describe bug here]" >> .debug-notes.md
echo "" >> .debug-notes.md
```

**You are now in DEBUG MODE. Stay here until the bug is verified fixed.**

### Debug Notes File (`.debug-notes.md`)

Track your investigation in this file:

```markdown
## Debug Session: 2024-01-20 14:30
**Bug:** Save button doesn't work

### Research
- Found similar issue on SO: [link]
- Error suggests null reference

### Findings
- Line 87: user.id accessed without null check
- user is null before session loads

### Fix Applied
- Added guard: `if (!user) return;`

### Verified
- [x] User confirmed fix works
- [x] No regression in related features
```

**Always update `.debug-notes.md` as you work.** This helps you (and the user) track progress.

---

## Bug Sizing: Small vs Big

**Before diving in, size the bug. The approach differs significantly.**

### Small Bug (Quick Fix Track)

**Characteristics:**
- Clear error message with stack trace
- Points to a specific line/function
- Single, obvious cause (typo, null check, off-by-one)
- No architectural implications
- Fix will be < 10 lines

**Approach:**
1. Quick research (1-2 searches max)
2. Read the error, find the line
3. Make the minimal fix
4. Verify with user
5. Done in one session

**Example small bugs:**
- `TypeError: Cannot read property 'x' of undefined`
- "Button doesn't do anything" (forgot event handler)
- "Shows wrong date" (timezone issue)
- "Form submits twice" (missing preventDefault)

### Big Bug (Deep Investigation Track)

**Characteristics:**
- Vague symptoms ("it's slow", "sometimes fails", "feels broken")
- No clear error, or misleading error
- Multiple possible causes
- Involves multiple files/systems
- Root cause is unclear
- User can't reliably reproduce it

**Approach:**
1. Extended research (search thoroughly)
2. Interview the user in detail
3. Create hypotheses (list 3-5 possible causes)
4. Add instrumentation/logging if needed
5. Test hypotheses systematically
6. May span multiple sessions
7. Document everything in `.debug-notes.md`

**Example big bugs:**
- "The app is slow" (where? when? for whom?)
- "Data sometimes disappears" (race condition?)
- "It works on my machine" (environment issue)
- "Users are complaining about X" (vague reports)

### Sizing Questions

Ask yourself:

| Question | Small | Big |
|----------|-------|-----|
| Is there a clear error message? | Yes | No/vague |
| Can I reproduce it in 30 seconds? | Yes | Maybe not |
| Do I know which file to look at? | Yes | Not sure |
| Is the fix obvious once found? | Probably | Unclear |
| Could this have multiple causes? | No | Yes |

**If 3+ answers point to "Big", treat it as a big bug.**

---

## Philosophy: How to Think About Bugs

### Bugs are symptoms, not problems

The bug you see is rarely the bug you have. A null pointer exception isn't the problem—it's a symptom of data not being where it should be. Ask: "Why is this null?" not "How do I handle null?"

### Every bug exists because something was assumed

Code works when assumptions are true. Bugs appear when assumptions break. Your job is to find the broken assumption:
- "I assumed the user would be logged in"
- "I assumed this array would have items"
- "I assumed the API would return in order"

### Fix the cause, not the symptom

Adding a null check might stop the crash, but if the data should never be null, you've just hidden a deeper problem. Ask: "Should I prevent this state, or handle this state?"

### The best fix is often the smallest

Resist the urge to refactor. A surgical 2-line fix is better than a 50-line "improvement" that might introduce new bugs. You can always refactor later, deliberately.

### When stuck, explain it out loud

Rubber duck debugging works. Write out the problem in `.debug-notes.md`:
- "The user clicks save"
- "This calls handleSave()"
- "Which calls api.save(data)"
- "But data is undefined because..."

Often you'll find the bug while explaining it.

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

---

## EXITING DEBUG MODE

**⚠️ CRITICAL: Get explicit user acceptance before marking done!**

Do NOT run `chkd fix` until the user has confirmed the bug is fixed.

**You stay in debug mode until ALL of these are true:**

1. ✅ User has explicitly confirmed the bug is fixed ("yes it works", "looks good", etc.)
2. ✅ You've updated `.debug-notes.md` with findings and fix
3. ✅ No unrelated changes were made

**Then mark it done:**
```bash
chkd fix "bug description"
```

**Only after user acceptance.** Don't assume the fix worked.

### If Bug Can't Be Fixed This Session

Don't just leave it hanging. Update notes and tell the user:

```markdown
### Status: BLOCKED
- Need more info: [what's missing]
- OR: This requires [bigger change]
```

```bash
# Capture for later
chkd bug "Unresolved: [bug description] - needs [what]"
```

**Tell the user:**
> "I couldn't fully fix this bug. I've documented what I found in `.debug-notes.md` and captured it as a bug for follow-up. Here's what's needed: [explain]"
