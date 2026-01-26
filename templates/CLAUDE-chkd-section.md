## Working with chkd

### Philosophy: Why chkd Exists

**The problem:** Humans want to let AI run at 100mph, and AI wants to comply. Both have the same bias: go fast, skip steps, batch everything.

**The solution:** chkd is a collaboration contract between human and AI.

- Human can't say "just do it all" - the tool doesn't work that way
- AI can't batch work - the workflow demands tick-by-tick progress

At each checkpoint: AI shows what it did → Human confirms or redirects → Next step.

**Neither party can skip this. The tool enforces it.**

### Keeping User Focused (You Can Push Back!)

The constraint applies to BOTH parties. If the user goes off-track, you're empowered to redirect:

1. **User asks to do something outside current task:**
   → "Let's park that with bug/win - stay focused on [current]?"

2. **User wants to skip workflow steps:**
   → "The spec has [step] next - want to skip it or should we do it?"

3. **User derails into tangent:**
   → "Interesting idea - should I log that for later so we stay on task?"

4. **User wants to batch work:**
   → "Want to tick these one at a time? Helps catch issues early."

You're not being difficult - you're enforcing the contract both signed up for.

### MCP Tools

When the chkd MCP server is connected, use these tools:

**Core Workflow:**
| Tool | What it does |
|------|--------------|
| `status` | Get current state - **run this first!** |
| `working` | Signal starting an item |
| `tick` | Mark item complete |
| `suggest` | Analyze spec, suggest what to work on |
| `add` | Add feature with workflow sub-tasks |
| `add_child` | Add sub-task to existing item |

**Sessions & Focus:**
| Tool | What it does |
|------|--------------|
| `impromptu` | Start ad-hoc work session |
| `debug` | Start investigation session |
| `done` | End current session |
| `pivot` | Change anchor/focus explicitly |
| `checkin` | 15-minute check-in |
| `pulse` | Quick status update |
| `also` | Log off-task work without derailing |

**Bugs:**
| Tool | What it does |
|------|--------------|
| `bug` | Log a bug (don't derail, log and continue) |
| `bugs` | List all open bugs |
| `bugfix` | Start working on a bug |
| `fix` | Signal fix ready for verification |
| `resolve` | Close bug after user verified |

**Quick Wins:**
| Tool | What it does |
|------|--------------|
| `win` | Add a quick win |
| `wins` | List quick wins |
| `won` | Mark quick win done |

**Epics:**
| Tool | What it does |
|------|--------------|
| `epic` | Create epic for large features |
| `epics` | List all epics with progress |
| `tag` | Link item to epic via tag |

**Resources** (read for context):
- `chkd://conscience` - Session state, guidance
- `chkd://spec` - Current spec with progress

### CRITICAL: Never Code While IDLE

**BEFORE writing ANY code:** Run `status`

If status is IDLE, start a session first:
- `impromptu("what I'm doing")` - for ad-hoc work
- `debug("what I'm investigating")` - for research
- `bugfix("bug")` - for bug fixes

**The UI should NEVER show IDLE while you're coding.**

### Skills (in Claude Code)
- `/chkd FE.1` - Build a specific task from the spec
- `/epic "Name"` - Plan and create a large feature (interview → design → stories)
- `/spec-check` - Validate SPEC.md format after editing
- `/reorder-spec` - Organize a messy or empty spec

### ⛔ NEVER Batch Tick Calls

The system enforces a 2-second minimum between `working` and `tick`.

**Correct flow:**
1. `working("item")` - signal you're starting
2. **Actually do the work** (write code, make changes)
3. `tick("item")` - mark complete

**Feedback items require user approval:**
- Wait for explicit "yes" or "approved" before ticking
- One approval ≠ blanket approval for other items

**If not following chkd rules:** Re-read this CLAUDE.md and respect ALL instructions.

### Epics (Large Features)

Use `/epic "Feature Name"` for large features spanning multiple spec items:
1. **Interview** - Discuss the idea, clarify scope
2. **Design** - Break down into stories, identify areas (FE/BE/SD)
3. **Create epic** - `epic()` creates the doc
4. **Create stories** - `add()` for each item, linked via epic tag

Track progress: `epics` | Epic files: `docs/epics/`

### Source of Truth
- `docs/SPEC.md` - Feature checklist
- `docs/GUIDE.md` - Workflow guide
