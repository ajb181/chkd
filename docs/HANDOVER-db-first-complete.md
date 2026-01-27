# Handover: DB-First Migration Complete

**Date:** 2026-01-27
**Epic:** db-first-spec-storage
**Status:** Complete

---

## What Was Done

Migrated chkd from SPEC.md file parsing to SQLite database as the single source of truth.

### Commits (in order)
1. `7bfe2cf` - Remove parser fallbacks from MCP server
2. `c047370` - Remove parser dependency from more API endpoints
3. `f003e13` - Update UI endpoints to use DB (no fallback)
4. `ea3b827` - Remove parser dependency from session/spec endpoints and epic module
5. `8fc4994` - Cleanup: extract workflow.ts, update docs for DB-first

### Key Changes

| Component | Before | After |
|-----------|--------|-------|
| MCP server | Direct parser calls | HTTP API calls to DB |
| API endpoints | Parse SPEC.md | Query DB directly |
| Epic progress | Parse SPEC.md for tags | Query DB item_tags table |
| TBC checking | Parse SPEC.md | Query DB item fields |
| UI | Mixed parser/DB | DB only |

### New Files
- `src/lib/server/spec/workflow.ts` - Pure workflow templates (no parser)
- `src/lib/server/db/items.ts` - DB query layer for spec items
- `src/routes/api/spec/check-tbc/+server.ts` - TBC check API endpoint

### Deleted Files
- `src/mcp/server.ts` - Old direct-DB MCP server (untracked)
- `src/mcp/server.ts.backup` - Backup (untracked)

### Parser Still Used By (legitimate)
- `migrate-spec.ts` - Import SPEC.md into DB
- `spec/repair` - AI-powered SPEC.md reformatter
- `spec/validate` - SPEC.md format validation
- `spec/transfer` - Cross-repo item transfer
- `writer.ts` - File operations for transfer

---

## Testing Guide

### Prerequisites
```bash
cd /Users/alex/chkd
npm run dev  # Start dev server on port 3847
```

### Test 1: MCP Status
```bash
# In another terminal, in any chkd-enabled repo:
claude
> chkd status
```
**Expected:** Shows items from DB, no parser errors

### Test 2: Add Item via MCP
```bash
> chkd add "Test item" --area SD
```
**Expected:** Item created in DB, visible in UI at localhost:3847

### Test 3: Tick Item via MCP
```bash
> chkd tick "Test item"
```
**Expected:** Item marked done in DB, UI updates

### Test 4: Working (TBC Check)
```bash
> chkd working "SD.1"  # Use an item with TBC fields
```
**Expected:** If item has TBC fields, blocks with message. If filled in, proceeds.

### Test 5: Epic Progress
```bash
> chkd epics
```
**Expected:** Shows epic progress from DB tags, not parser

### Test 6: UI Operations
1. Open http://localhost:3847
2. Click an item to set anchor
3. Tick a sub-item
4. Add a new item via UI

**Expected:** All operations work, no SPEC.md file changes

### Test 7: Verify No Parser Calls
```bash
# Check MCP server has no parser imports
grep -n "SpecParser\|parseFile" src/mcp/server-http.ts
```
**Expected:** No matches

---

## Rollback (if needed)

The old commits are in git history. To rollback:
```bash
git revert 8fc4994 ea3b827 f003e13 c047370 7bfe2cf
```

But this shouldn't be needed - the migration is stable.

---

## Known Limitations

1. **Transfer endpoint** still uses parser (cross-repo file operation)
2. **SPEC.md file** is not auto-updated (DB is source of truth)
3. **Old SPEC.md** must be imported via `migrate-spec` tool

---

## Architecture Summary

```
User Request
     ↓
MCP Server (server-http.ts)
     ↓ HTTP
SvelteKit API (/api/*)
     ↓
DB Layer (items.ts, queries.ts)
     ↓
SQLite (~/.chkd/chkd.db)
```

Parser is only used for maintenance tools that operate on SPEC.md files directly.
