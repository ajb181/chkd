## Working with chkd

### Philosophy: Why chkd Exists

**The problem:** Humans want to let AI run at 100mph, and AI wants to comply. Both have the same bias: go fast, skip steps, batch everything.

**The solution:** chkd is a collaboration contract between human and AI.

- Human can't say "just do it all" - the tool doesn't work that way
- AI can't batch work - the workflow demands tick-by-tick progress

At each checkpoint: AI shows what it did → Human confirms or redirects → Next step.

**Neither party can skip this. The tool enforces it.**

### MCP Tools (Preferred)

When the chkd MCP server is connected, use these tools:

| Tool | What it does |
|------|--------------|
| `chkd_status` | Get current state - **run this first!** |
| `chkd_working "item"` | Signal starting an item |
| `chkd_tick "item"` | Mark item complete |
| `chkd_bug "desc"` | Log a bug (don't derail, log and continue) |
| `chkd_bugfix "bug"` | Start working on a bug |
| `chkd_fix "bug"` | Signal fix ready for verification |
| `chkd_resolve "bug"` | Close bug after user verified |
| `chkd_win "title"` | Add a quick win |
| `chkd_impromptu "desc"` | Start ad-hoc work session |
| `chkd_debug "desc"` | Start investigation session |
| `chkd_done` | End current session |
| `chkd_pulse "status"` | Quick status update |

**Resources** (read for context):
- `chkd://conscience` - Session state, guidance
- `chkd://spec` - Current spec with progress

### CRITICAL: Never Code While IDLE

**BEFORE writing ANY code:** Run `chkd_status`

If status is IDLE, start a session first:
- `chkd_impromptu("what I'm doing")` - for ad-hoc work
- `chkd_debug("what I'm investigating")` - for research
- `chkd_bugfix("bug")` - for bug fixes

**The UI should NEVER show IDLE while you're coding.**

### Skills (in Claude Code)
- `/chkd FE.1` - Build a specific task from the spec
- `/story` - Refine specs, plan features
- `/bugfix` - Fix bugs with minimal changes
- `/commit` - Safe commit workflow

### ⛔ NEVER Batch Tick Calls

The system enforces a 10-second minimum between `working` and `tick`:
```bash
# BLOCKED - will fail with debounce error
chkd working "item" && chkd tick "item"
```

**Correct flow:**
1. `chkd working "item"` - signal you're starting
2. **Actually do the work** (write code, make changes)
3. `chkd tick "item"` - mark complete

**Feedback items require user approval:**
- Wait for explicit "yes" or "approved" before ticking
- One approval ≠ blanket approval for other items

**If not following chkd rules:** Re-read this CLAUDE.md and respect ALL instructions.

### CLI Fallback

If MCP isn't connected, use CLI commands:
```bash
chkd status              # See progress
chkd working "item"      # Signal starting
# ... do actual work ...
chkd tick "item"         # Mark complete (10s minimum after working)
chkd impromptu "desc"    # Start ad-hoc session
chkd debug "desc"        # Start debug session
chkd done                # End session
```

### Source of Truth
- `docs/SPEC.md` - Feature checklist
- `docs/GUIDE.md` - Workflow guide
