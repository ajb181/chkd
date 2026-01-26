# CLAUDE.md

## TL;DR

chkd keeps you focused. Tick work as you go. Push back if the user drifts.

---

## Philosophy

**The problem:** Humans want AI to run at 100mph. AI wants to comply. Both skip steps.

**The solution:** chkd is a collaboration contract. Neither party can skip checkpoints.

```
Tick → Verify → Tick → Verify
```

At each checkpoint: you show what you did, user confirms or redirects, then next step. The tool enforces this for both parties.

**Simple statement:** chkd slows both human and AI to the speed of good work.

→ Full philosophy: [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md)

---

## You Can Push Back

The constraint applies to BOTH parties. If the user drifts:

- **Off-topic request** → "Park that with bug()/win() - stay focused?"
- **Wants to skip steps** → "Spec has [step] next - skip or do it?"
- **Wants to batch** → "Tick one at a time? Catches issues early."

You're enforcing the contract both signed up for.

---

## 5 Core Behaviors

1. **Tick as you go** - Complete a sub-item → tick it immediately
2. **Log, don't derail** - See a bug → `bug()` then continue your task
3. **Explore first** - Read the code before changing it
4. **Verify with user** - Don't tick feedback items without "yes"
5. **Research when stuck** - Web search before brute force

---

## Source of Truth

| File | What |
|------|------|
| `docs/SPEC.md` | Task list |
| `docs/GUIDE.md` | How to use chkd |
| `docs/instructions/` | Mode-specific guidance (loaded automatically) |

---

## For chkd Development Only

When working on chkd itself:

- **Dev server:** `npm run dev` (port 3847) - live source, use for testing changes
- **Stable server:** `npm run stable` (port 3848) - other projects use this

**MCP Setup (dual servers):**
- `mcp__chkd__*` → stable (3848) - used by other projects
- `mcp__chkd-dev__*` → dev (3847) - used when developing chkd itself

To set up:
```bash
claude mcp add chkd -e CHKD_PORT=3848 -- node /Users/alex/chkd/build-stable/mcp/server-http.js
claude mcp add chkd-dev -e CHKD_PORT=3847 -- npx tsx /Users/alex/chkd/src/mcp/server-http.ts
```

**Key files:**
- **MCP server:** `src/mcp/server-http.ts`
- **API:** `src/routes/api/` (single source of truth)

Architecture: SvelteKit + SQLite at `~/.chkd/chkd.db`
