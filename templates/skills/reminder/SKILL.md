---
name: reminder
description: Re-read governance docs and audit docs are current - reset your behavior
args: none
---

# /reminder - Reset & Re-read

Stop. Re-read the governance rules. Audit docs are current.

---

## Step 1: Re-read AGENT-GOVERNANCE.md

Read the full file now:

```
Read docs/AGENT-GOVERNANCE.md
```

Key sections to internalize:
- **Assumption Surfacing** - State assumptions explicitly
- **Confusion Management** - STOP when unclear, don't guess
- **Reuse First** - Search before creating anything new
- **Scope Discipline** - Touch only what you're asked to
- **Simplicity Enforcement** - Resist overcomplicating

---

## Step 2: Re-read WORKFLOW.md

```
Read docs/WORKFLOW.md
```

Key behaviors:
- Plan mode for non-trivial tasks
- Subagent strategy (offload research)
- Self-improvement loop (update lessons.md)
- Verification before done

---

## Step 3: Audit Docs Currency

Check each doc is current and relevant:

| Doc | Check |
|-----|-------|
| `AGENT-GOVERNANCE.md` | Still reflects desired behavior? |
| `WORKFLOW.md` | Still matches how we work? |
| `GUIDE.md` | Matches current chkd features? |
| `PHILOSOPHY.md` | Still relevant? |

If any doc is stale:
```
⚠️ docs/[FILE] may be outdated:
- [what seems wrong]
- Suggest: [update or remove]
```

---

## Step 4: Self-Check

Ask yourself:
1. Have I been surfacing assumptions? Or silently guessing?
2. Have I been searching before creating? Or just writing new code?
3. Have I been staying in scope? Or "cleaning up" adjacent code?
4. Have I been keeping it simple? Or overengineering?

If any answer is concerning → correct behavior now.

---

## Step 5: Acknowledge

Report back:

```
✅ Governance reminder complete

Re-read:
- AGENT-GOVERNANCE.md ✓
- WORKFLOW.md ✓

Self-check:
- Assumptions: [good/needs improvement]
- Reuse-first: [good/needs improvement]
- Scope: [good/needs improvement]
- Simplicity: [good/needs improvement]

Docs audit:
- All current / [list any issues]

Ready to continue with refreshed mindset.
```

---

## When to Use

- Start of a new session
- After a long context
- When you notice yourself drifting
- After user corrects you
- Before major implementation work
