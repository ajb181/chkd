# chkd Tool Responses - Deep Dive

All MCP tool return messages. Use this to plan customization by task type/area code.

---

## Session Management

### `status()`
```
📁 {repoName}
Progress: {pct}% ({completed}/{total})
MCP: http-based v2.1.0 ✓

📬 QUEUE ({count} message(s) from user):
  • {message}

Status: IDLE - No active task / {STATUS}
Task: {currentTask}
Duration: {elapsed}

(contextual nudges based on time since check-in, off-track, etc.)
```

### `impromptu(description)`
```
⚡ Impromptu session started
Working on: {description}
───────────────────
This tracks ad-hoc work so nothing is forgotten.
When done: done() to end session

📬 Queue ({count}):
  • {message}
```

### `debug(description)`
```
🔍 INVESTIGATION MODE
═══════════════════════════════════════
Investigating: {description}

MINDSET: You're a detective, not a fixer.
Your goal is UNDERSTANDING, not solutions.
───────────────────────────────────────

📓 START DEBUG NOTES:
   echo "## Investigation: $(date '+%H:%M')" >> .debug-notes.md

INVESTIGATION PROCESS:
1. OBSERVE  → What exactly is happening?
2. QUESTION → Ask the user for context
3. HYPOTHESIZE → List 2-3 possible causes
4. TEST    → Check each systematically
5. CONCLUDE → Document it

⚠️  DISCIPLINE:
• Don't jump to fixes - understand first
• Don't assume - ask the user
• Don't rush - investigation takes time

CHECKPOINTS (get user alignment):
□ "Here's what I'm seeing..."
□ "I have 3 hypotheses..."
□ "I think I found the cause..."

When done: done()
```

### `done()`
```
✅ Session ended: {taskTitle}
📊 Duration: {duration}

───────────────────────────────────────
WHAT'S NEXT?
• 📬 Queue has {count} message(s) - check these first
• Was this a bug? → bug("description") to log it  (if debugging)
• 🐛 {count} open bug(s) - bugfix() to work on one
• 💬 Discuss with user what to work on next
• 📊 status() to see full project state
```

---

## Core Workflow

### `working(item)`
```
🔨 Working on: {fullTitle}

(if Confirm/Verify step)
🛑 USER APPROVAL REQUIRED
   This step needs explicit user approval before ticking.
   Show your findings → wait for user "yes" → then tick.

📬 Queue ({count}):
  • {message}

⚠️ IMPORTANT: Tick each sub-item as you complete it.
   Do NOT batch ticks at the end - tick as you go!

💭 When done, run tick() immediately.
```

### `tick(item)`
```
✅ Completed: {fullTitle}

(if Confirm/Verify step)
⚠️  CHECKPOINT: Did you get explicit user approval?
   If not, discuss with user before proceeding.

📬 Queue ({count}):
  • {message}

💭 Tick as you go - don't batch at the end.
```

---

## Bug Workflow

### `bug(description)`
```
✓ Bug logged: {description}

🎯 Continue with: {currentTask}  (if in session)
   Don't derail - fix bugs later!

OR

💭 Fix it later with bugfix()
```

### `bugfix(query)`
```
🔧 BUGFIX MODE
═══════════════════════════════════════
Bug: {title}
Severity: {icon} {SEVERITY}

MINDSET: Surgical precision. Fix the bug, nothing more.
───────────────────────────────────────

FIRST: SIZE THE BUG
┌─────────────────────────────────────┐
│ SMALL BUG (Quick Fix Track)         │
│ • Clear error with stack trace      │
│ • Fix will be < 10 lines            │
│                                     │
│ BIG BUG (Deep Investigation)        │
│ • Vague symptoms, no clear error    │
│ → Use debug() instead               │
└─────────────────────────────────────┘

THE PROCESS:
1. ALIGN    → Explain understanding to user
2. RESEARCH → Search first!
3. REPRODUCE → Confirm you can trigger it
4. ISOLATE  → Find root cause
5. PROPOSE  → Describe fix to user
6. FIX      → Minimal change only
7. VERIFY   → User confirms, not you

⚠️  DISCIPLINE:
• DON'T refactor "while you're in there"
• DON'T add features or improvements
• DON'T fix things that aren't broken

RED FLAGS:
• "While I'm here, I should also..."  → NO
• "This code is messy, let me clean..." → NO

When fix ready: fix("{query}")
After user verifies: resolve("{query}")
```

### `fix(query)`
```
🔧 Fix ready: {title}
─────────────────────────────────
⚠️  VERIFY WITH USER:
   Ask user to confirm the fix solves the problem.
   Do not close until user has verified.
─────────────────────────────────
📦 BEFORE RESOLVING:
   1. Review docs - update if behavior changed
   2. Commit with descriptive message
   3. Push to remote
   4. Then resolve
─────────────────────────────────
💡 Run resolve("{query}") after docs+commit+push and user confirms
```

### `resolve(query)`
```
✅ Bug resolved: {title}
📴 Debug session ended

📦 Commit your fix:
   git add -A && git commit -m "fix: {title}"
   git push

💭 Nice work. What's next?
```

### `bugs()`
```
🐛 Open Bugs ({count})
─────────────────
{id} {sevIcon} {title}
...

💭 Fix bugs with bugfix("title or id")
```

---

## Spec Management

### `add(title, areaCode, ...)`
```
✅ Added: {specCode} {title}
Area: {areaCode}
Workflow: {stepCount} steps, {checkpointCount} checkpoints
Epic: #{epic} ✓  (if epic specified)

💡 Use working("{specCode}") to start working on it
```

### `add_child(parentId, title)`
```
✅ Added sub-task: {title}
Parent: {parentId}
Child ID: {childId}

💡 Use working("{title}") when ready to start
```

### `add_task(title)`
```
✅ Added sub-task to current item
═══════════════════════════════════════

📝 "{title}"
📍 Parent: {parentId} ({anchorTitle})
🆔 ID: {childId}

💡 Use tick("{title}") when done
```

### `tag(itemId, tags)`
```
🏷️ Tags set on {itemId}: #tag1 #tag2

💡 Filter by tag in the UI
```

---

## Quick Wins

### `CreateQuickWin(title, files, test)`
```
⚡ Quick win created: {sectionId} {title}
📁 Files: {files}
✓ Test: {test}
📋 Workflow: Scope → Align → Fix → Verify → Commit

💡 Start: chkd_start("{sectionId}")
```

### `ListQuickWins()`
```
⚡ Quick Wins
═══════════════════════════════════════

⬜ PENDING ({count}):
  ○ {displayId} {title}

✅ COMPLETED ({count}):
  ✓ {displayId} {title}

💡 Start with chkd_start("FUT.X")
```

### `CompleteQuickWin(id)`
```
✅ Quick win done: {displayId} {title}

📦 Before committing:
   1. Review docs if behavior changed
   2. Commit with descriptive message
   3. Push to remote
```

---

## Epics

### `epic(name, description)`
```
✅ Epic created: {name}
───────────────────────────────────
📁 File: docs/epics/{slug}.md
🏷️  Tag: {tag}

💡 Link items to this epic:
   add("title", areaCode="FE", epic="{tag}")
   Or existing items: tag("FE.1", ["{tag}"])
```

### `epics()`
```
📦 Epics
═══════════════════════════════════════

{statusEmoji} {name}
   Tag: #{tag} | [{completed}/{total}] {progress}%
   {description}

💡 Link items: tag("ITEM.ID", ["epic-tag"])
```

---

## Attachments

### `attach(itemType, itemId, filePath)`
```
📎 Attached: {originalName}
   To: {itemType} {itemId}
   Path: {path}

💡 View attachments with attachments("{itemType}", "{itemId}")
```

### `attachments(itemType?, itemId?)`
```
📎 Attachments for {itemType} {itemId}
═══════════════════════════════════════

• {originalName} ({sizeKB}KB)
  Type: {itemType}, ID: {itemId}
  Path: {path}
```

---

## Workers

### `spawn_worker(taskId, taskTitle)`
```
👷 Worker spawned!
═══════════════════════════════════════

Task: {taskId} - {taskTitle}
Worker ID: {workerId}
Branch: {branchName}
Worktree: {worktreePath}

┌─ START WORKER ────────────────────────┐
│ Open a NEW terminal and run:          │
│ {command}                             │
└───────────────────────────────────────┘

💡 The worker will connect automatically.
   Use workers() to monitor progress.
```

### `workers()`
```
👷 Workers ({count}/{max})
═══════════════════════════════════════

{statusIcon} {workerId}...
   Task: {taskId} {taskTitle}
   Status: {STATUS} ({progress}%)
   Time: {elapsed} • "{message}"
   Next: {nextTaskId} {nextTaskTitle}

💡 Slot available! Spawn with spawn_worker()
```

### `worker_heartbeat()`
```
💓 Heartbeat recorded
Status: {status}
Next task queued: {taskId} - {taskTitle}

💡 Keep working. Next heartbeat in ~30 seconds.

(if pause requested)
⏸️ PAUSE REQUESTED: Stop work and wait for resume signal.

(if abort requested)
🛑 ABORT REQUESTED: Stop work immediately.
```

### `worker_complete()`
```
✅ Task complete and merged!

Summary: {summary}

📋 Your next task: {nextTaskId} - {nextTaskTitle}
💡 Start working on it now!

OR

🎉 No more tasks assigned. Good work!
```

---

## Utility

### `upgrade_mcp()`
```
╔══════════════════════════════════════╗
║       MCP SERVER VERSION CHECK       ║
╚══════════════════════════════════════╝

Server Type: http-based
Version: 2.1.0
Status: ✅ Up to date

Benefits of HTTP-based server:
• UI syncs automatically
• Single source of truth
• No database lock conflicts

📋 TO UPGRADE OTHER PROJECTS:
...
```

---

## Customization Opportunities

### By Task Type (workflowType)
| Type | Could customize |
|------|-----------------|
| `quickwin` | "⏱️ Keep under 30 min" |
| `debug` | "🔍 Understand first, fix later" |
| `refactor` | "⚠️ No behavior changes!" |
| `remove` | "🗑️ Check dependencies first" |
| `audit` | "📋 Document findings" |
| (default) | Full workflow guidance |

### By Area Code
| Area | Could customize |
|------|-----------------|
| `SD` | "📐 System design - think architecture" |
| `FE` | "🖼️ Check all UI states: loading, error, empty" |
| `BE` | "📡 API contract first, implementation second" |
| `FUT` | "⚡ Quick iteration, ship fast" |

### Implementation Points
- `working()` — add type/area-specific reminders
- `tick()` — add type/area-specific verification prompts
- `done()` — customize next-step suggestions by type
- Nudges in `getContextualNudges()` — could be type-aware
