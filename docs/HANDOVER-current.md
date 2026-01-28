# Handover - Current State (2026-01-27)

**Status:** ✅ SPEC.md removal COMPLETE | 🔧 MCP resource fix needs verification

---

## ✅ COMPLETED: Database is Now Sole Source of Truth

### What Was Done

**Goal:** Remove SPEC.md entirely. Database is the only source of truth.

**Completed work:**
1. ✅ Deleted `src/lib/server/spec/writer.ts` (30+ file operations removed)
2. ✅ Deleted `src/routes/api/spec/validate/+server.ts`
3. ✅ Deleted `src/routes/api/spec/repair/+server.ts`
4. ✅ Deleted `src/routes/api/spec/transfer/+server.ts`
5. ✅ Removed `spec_check` and `spec_repair` from MCP server
6. ✅ Removed `repair` command from CLI
7. ✅ Updated all CLI help text (removed SPEC.md references)
8. ✅ Removed `repairSpec` from `llm.ts`
9. ✅ Updated MCP server descriptions

**Commit:** "Remove SPEC.md - database is sole source of truth" (pushed to master)

---

## ✅ COMPLETED: Recent Activity Rebuilt with Database

### Why

The `/api/spec/recent` endpoint was deleted but UI still needed it. User explicitly said: "we should build that end it is important data exactly in the ui"

### What Was Built

**New endpoint:** `src/routes/api/spec/recent/+server.ts`

Queries database directly:
- Recently added items (by `created_at`)
- Recently completed items (by `updated_at` where `status = 'done'`)

```typescript
// Recently added
SELECT display_id, title, created_at, area_code
FROM spec_items WHERE repo_id = ? AND parent_id IS NULL
ORDER BY created_at DESC LIMIT ?

// Recently completed
SELECT display_id, title, updated_at, area_code
FROM spec_items WHERE repo_id = ? AND status = 'done' AND parent_id IS NULL
ORDER BY updated_at DESC LIMIT ?
```

**API function added to `src/lib/api.ts`:**
```typescript
export async function getRecentActivity(repoPath: string, limit: number = 5): Promise<ApiResponse<RecentActivity>>
```

**UI updated:** `src/routes/+page.svelte` now loads and displays recent activity.

---

## 🔧 PENDING VERIFICATION: MCP Resource Fix

### Bug Found

**Bug ID:** 6ab442
**Problem:** MCP resources (`chkd://conscience`, `chkd://spec`) returned "Resource not found"

### Root Cause

Wrong API signature for `server.resource()`:

```typescript
// WRONG (what we had)
server.resource(
  "chkd://conscience",     // <- This was being used as the name
  "Description here...",   // <- This was being used as the URI!
  async () => { ... }
);

// CORRECT (fixed)
server.resource(
  "conscience",                           // name
  "chkd://conscience",                    // URI
  { description: "Description here..." }, // metadata
  async (uri, extra) => { ... }           // callback
);
```

### Fix Applied

Updated both resources in `src/mcp/server-http.ts`:
- ✅ `chkd://conscience` - session state resource
- ✅ `chkd://spec` - spec items resource

### ⚠️ Verification Needed

**Build passes** but fix needs Claude Code restart to test:

```bash
# After restart, test with:
ReadMcpResourceTool server="chkd-dev" uri="chkd://conscience"
ReadMcpResourceTool server="chkd-dev" uri="chkd://spec"
```

---

## 📁 Files Modified This Session

### Deleted
- `src/lib/server/spec/writer.ts`
- `src/routes/api/spec/validate/+server.ts`
- `src/routes/api/spec/repair/+server.ts`
- `src/routes/api/spec/transfer/+server.ts`

### Created
- `src/routes/api/spec/recent/+server.ts` (new DB-based endpoint)

### Modified
- `src/lib/api.ts` - Added `getRecentActivity`, `RecentItem`, `RecentActivity` types
- `src/routes/+page.svelte` - Added recent activity loading
- `src/cli/index.ts` - Updated all help text, removed SPEC.md references
- `src/cli/llm.ts` - Removed `repairSpec` function
- `src/mcp/server-http.ts` - Fixed resource registrations, removed spec_check/spec_repair tools

---

## 🐛 Known Issues

### MCP Resources (Pending Verification)
- **Bug:** 6ab442 - MCP resources can't be read
- **Status:** Fix applied, needs restart to verify
- **Workaround:** Use `chkd_status` tool instead

---

## 💡 Architecture Notes

### Database Location
`~/.chkd/chkd.db` (SQLite via better-sqlite3)

### Key Tables
- `repos` - Registered repositories
- `spec_items` - All tasks/items (with parent_id for hierarchy)
- `sessions` - Work sessions
- `bugs` - Bug tracking

### API Layer
All CRUD goes through `src/routes/api/spec/*` endpoints which use `src/lib/server/db/items.ts`.

### Migration Path
If a project still has `docs/SPEC.md`, run:
```bash
chkd migrate
```
This imports to DB. The plan was to delete SPEC.md on success, but that step wasn't implemented yet.

---

## ⚡ Quick Commands

**Session:**
- `chkd_status` - Current state (use this if resources don't work)
- `chkd_impromptu("desc")` - Start ad-hoc work
- `chkd_debug("what")` - Research mode
- `chkd_done` - End session

**Spec manipulation:**
- `chkd_add({title, areaCode, ...})` - Add feature
- `chkd_add_child({parentId, title})` - Add sub-task
- `chkd_tick("item")` - Mark complete
- `chkd_working("item")` - Mark in-progress

**Bugs:**
- `chkd_bug("desc")` - Log bug
- `chkd_bugs` - List all bugs
- `chkd_resolve("bug")` - Close bug

---

## 📊 Next Steps

1. **Restart Claude Code** to reload MCP server
2. **Verify MCP resources work** with ReadMcpResourceTool
3. **Mark bug 6ab442 resolved** if resources work
4. **Continue with FE.7** or other spec items

---

**Last updated:** 2026-01-27
**Session:** SPEC.md removal + MCP resource fix
**Commit:** "Remove SPEC.md - database is sole source of truth"
