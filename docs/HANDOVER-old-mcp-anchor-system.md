# Handover: MCP Anchor System

**Date:** 2026-01-22
**Status:** Functional, needs testing
**Design Doc:** [DESIGN-mcp-maximized.md](./DESIGN-mcp-maximized.md)

---

## What Was Built

An **anchor system** that lets users set tasks in the web UI, which the MCP server then enforces and nudges Claude to work on. This moves task control from CLI-only to 60% UI / 40% CLI.

### The Flow

```
1. User clicks spec item in web UI
2. User clicks "🎯 Set as Active Task" button
3. Anchor is saved to database (session.anchor)
4. Session remains IDLE (pending state)
5. MCP server sees anchor + idle = PENDING TASK
6. Claude reads status, sees pending task, starts working
7. When Claude starts, session becomes BUILDING
8. MCP tracks if Claude is ON TRACK or OFF TRACK vs anchor
```

---

## Files Changed

### Database (`src/lib/server/db/`)

**index.ts** - Added anchor columns to sessions table:
```sql
anchor_task_id TEXT,
anchor_task_title TEXT,
anchor_set_at TEXT,
anchor_set_by TEXT  -- 'ui' or 'cli'
```

**queries.ts** - Added anchor functions:
- `setAnchor(repoId, taskId, taskTitle, setBy)` - Set the anchor
- `clearAnchor(repoId)` - Clear the anchor
- `isOnTrack(repoId)` - Returns `{ onTrack, anchor, current }`
- Updated `getSession()` to return anchor info

### Types (`src/lib/types.ts`)

Added `AnchorInfo` interface:
```typescript
interface AnchorInfo {
  id: string;
  title: string;
  setAt: string | null;
  setBy: 'ui' | 'cli' | null;
}
```

Added `anchor` property to `TaskSession`.

### API (`src/routes/api/session/anchor/+server.ts`)

New endpoint for anchor management:
- `GET /api/session/anchor?repoPath=...` - Get anchor status
- `POST /api/session/anchor` - Set anchor (body: `{ repoPath, taskId, taskTitle }`)
- `DELETE /api/session/anchor` - Clear anchor (body: `{ repoPath }`)

### Frontend API (`src/lib/api.ts`)

Added types and functions:
- `AnchorInfo`, `AnchorStatus` types
- `getAnchor(repoPath)` - Get current anchor
- `setAnchor(repoPath, taskId, taskTitle)` - Set anchor from UI
- `clearAnchor(repoPath)` - Clear anchor

### Web UI (`src/routes/+page.svelte`)

**State:**
- `anchor: AnchorInfo | null`
- `anchorOnTrack: boolean`
- `settingAnchor: boolean`

**UI Components:**

1. **Detail Panel** - When clicking a spec item:
   - Shows "🎯 Set as Active Task" button (green, prominent)
   - If item IS the anchor, shows "🎯 Active Task" badge with Clear button

2. **Pending Card** - When session is idle but anchor is set:
   - Yellow/orange card with "🎯 PENDING" badge
   - Shows anchored task title
   - Hint: "Claude will see this and start working on it"
   - Clear button

3. **Off-Track Warning** - When building but not on anchor:
   - Yellow warning bar in session card
   - Shows "⚠️ Anchor: [task title]"

4. **Updated Quick Start Guide** - Now says:
   - Step 1: "Set a task" (click spec item, set as active)
   - Step 2: "Claude starts" (sees pending, kicks off)
   - Step 3: "Track progress"

### MCP Server (`src/mcp/server.ts`)

**chkd_status tool** - Updated to show pending anchor:
```
Status: 🎯 PENDING - Task waiting
Task: FE.7 Allow to set tags and priority...
💡 START THIS NOW → chkd_impromptu("fe-fe-7...")
```

**Contextual Nudges** - When idle with anchor:
```
🎯 PENDING TASK: "FE.7..."
   User set this anchor - START IT NOW!
   → chkd_impromptu("fe-fe-7...")
```

**Conscience Resource** - Shows prominent pending task box:
```
┌─ 🎯 PENDING TASK ────────────────────┐
│ FE.7 Allow to set tags and priority  │
│ ⚡ User set this anchor - START IT!  │
└──────────────────────────────────────┘
```

**Off-Track Detection** - When building but not on anchor:
```
⚠️ OFF TRACK: Anchor is "FE.7..." - return or pivot
```

---

## Known Issues

### 1. Conscience Resource Read Fails
```
Error: MCP error -32602: Resource chkd://conscience not found
```
The resource is listed but can't be read. `listMcpResources` works, `readMcpResource` fails. The `chkd_status` tool works as a workaround.

**Likely cause:** SDK resource URI matching issue. Needs investigation.

### 2. MCP Server Requires Restart for Code Changes
Since MCP runs as a subprocess via `tsx`, changes to `src/mcp/server.ts` require restarting Claude Code to take effect.

### 3. 15-Minute Check-In Timer
The timer is in-memory (`lastCheckIn: Map<string, number>`), so it resets when the MCP server restarts. This is intentional but worth noting.

---

## Testing Checklist

- [ ] Set anchor via UI, verify it appears in database
- [ ] Verify pending card shows when anchor set + idle
- [ ] Start new Claude Code session, verify it sees pending task
- [ ] Verify Claude starts working on anchored task
- [ ] Verify off-track warning when working on different task
- [ ] Clear anchor via UI, verify it clears
- [ ] Test `chkd_pivot` tool to formally change anchor

---

## What's Next

### Immediate
1. **Fix conscience resource read** - Debug why `readMcpResource` fails
2. **Test full flow** - User sets anchor → Claude sees it → Claude starts

### Future (from design doc)
1. **Check-in prompts** - 15-min reminders to update user
2. **Suggest tool** - Claude → User suggestions
3. **Smart session inference** - Auto-detect what Claude is doing
4. **Queue processing** - Better handling of user messages

---

## Quick Reference

**Set anchor (UI):** Click spec item → "🎯 Set as Active Task"

**Set anchor (CLI):** Not implemented yet (would be `chkd anchor "task"`)

**Clear anchor (UI):** Click anchored item → "Clear" button

**Check anchor (API):**
```bash
curl "http://localhost:3847/api/session/anchor?repoPath=/path/to/repo"
```

**MCP tools for anchor:**
- `chkd_status()` - Shows pending task prominently
- `chkd_pivot(reason)` - Formally acknowledge going off-track

---

## Architecture Notes

The anchor is **separate from currentTask**:
- `anchor` = What the USER wants Claude to work on
- `currentTask` = What Claude is ACTUALLY working on

This allows:
1. User sets anchor before Claude starts (pending state)
2. Claude works on something, we can detect if it's off-track
3. User can change anchor mid-session to redirect Claude

The `isOnTrack()` function compares:
- Direct match: `currentTask.id === anchor.id`
- Sub-item match: `currentTask.id.startsWith(anchor.id)`

---

## Related Docs

- [DESIGN-mcp-maximized.md](./DESIGN-mcp-maximized.md) - Full design vision
- [CLI.md](./CLI.md) - CLI command reference
- [GUIDE.md](./GUIDE.md) - User workflow guide
