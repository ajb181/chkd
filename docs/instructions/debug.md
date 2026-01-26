# Debug Mode

## TL;DR

Investigation session. Research and understand before acting.

---

## Mindset

You're investigating, not fixing yet. Goal is understanding.

- Gather information systematically
- Form hypotheses, test them
- Document findings
- Don't jump to fixes until you understand the problem

---

## The Process

1. **Define** → What exactly is the problem?
2. **Gather** → Collect logs, errors, reproduction steps
3. **Research** → Web search for similar issues
4. **Hypothesize** → What could cause this?
5. **Test** → Verify or eliminate hypotheses
6. **Document** → Share findings with user

---

## Research First

Before diving into code:
- Search for error messages
- Check if others hit this issue
- Look for known solutions
- Understand the system involved

---

## Think Out Loud

Share your reasoning with the user:
- "I'm seeing X which suggests Y..."
- "Let me check if Z is the cause..."
- "This rules out A, so it's likely B..."

---

## When Done Investigating

You have two paths:

**Ready to fix:**
- Share findings with user
- Get agreement on the fix approach
- Switch to bugfix mode with `bugfix("issue")`

**Need more info:**
- Summarize what you learned
- Identify what's still unknown
- Ask user for help or access

---

## Stay in Investigation Mode

Don't fix while debugging unless:
- User explicitly says "go ahead and fix it"
- The fix is trivial and obvious

Investigation and fixing are separate phases.
