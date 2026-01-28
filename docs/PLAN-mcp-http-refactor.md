# Plan: MCP Server HTTP Refactor

## Problem

The MCP server and SvelteKit web app are separate processes that both access the same SQLite database directly. This causes sync issues:

- MCP server writes to DB → SQLite file updated
- Web app polls DB every 2s → may not see fresh data immediately
- Even with WAL mode, cached connections don't sync instantly
- **Result:** UI shows "IDLE" when MCP is actually working

## Current Architecture (Hacky)

```
MCP Server → SQLite DB ← SvelteKit App
  (writes)               (reads, polling)

Problem: Two processes, shared file, cache sync issues
```

## Target Architecture (Clean)

```
MCP Server → HTTP → SvelteKit API → SQLite DB
                         ↓
                    Frontend (polling)

Benefit: Single writer, proper invalidation, no sync issues
```

## Implementation Plan

### Phase 1: Preparation ✅ (DONE)

- [x] Create HTTP client (`src/mcp/http-client.ts`)
- [x] Map all MCP operations to existing API endpoints
- [x] Verify all needed endpoints exist

### Phase 2: Clean Rewrite

**Step 1: Create new server-http.ts**
- Copy structure from `server.ts`
- Replace all DB imports with HTTP client imports
- Update all functions to be async and use HTTP calls
- Keep spec file reading local (read-only operations)

**Step 2: Update function signatures**
- `getContextualNudges()` → async, takes repoPath not repoId
- `requireRepo()` → async
- All tool handlers → already async, just update internals

**Step 3: Handle data transformations**
- API returns `{ success, data, error }` format
- Extract `data` from responses
- Handle errors gracefully (server not running, etc.)

**Step 4: Keep local operations local**
- Spec file parsing (read-only) - stays local
- Resource reads (conscience, spec) - stays local
- Everything else → HTTP

### Phase 3: Testing Strategy

**Test each MCP tool individually:**

1. `chkd_status` → verify shows correct state
2. `chkd_impromptu` → verify creates session via API
3. `chkd_bug` → verify bug appears in UI immediately
4. `chkd_tick` → verify spec updates and UI refreshes
5. `chkd_working` → verify UI shows current item
6. `chkd_pulse` → verify updates last activity
7. All other tools → similar verification

**Critical test: UI sync**
- Call MCP tool
- Wait <2 seconds (one polling cycle)
- Verify UI updated without manual refresh

### Phase 4: Deployment

**Step 1: Update package.json**
```json
"mcp": "node --loader ts-node/esm src/mcp/server-http.ts"
```

**Step 2: Test in Claude Code**
- Restart Claude Code to pick up new MCP server
- Run through full workflow
- Verify UI stays in sync

**Step 3: Rollback if needed**
```json
"mcp": "node --loader ts-node/esm src/mcp/server.ts"
```

## What Could Go Wrong

### Issue: Dev server not running
**Symptom:** MCP tools fail with "connection refused"
**Fix:** Clear error message telling user to run `npm run dev`
**Mitigation:** Check server health on first call, cache result

### Issue: Port conflicts
**Symptom:** Server running on different port than expected
**Fix:** Make port configurable or auto-detect
**Future:** Read from `.chkd/config.json`

### Issue: API endpoints missing fields
**Symptom:** MCP tools get incomplete data
**Fix:** Add missing fields to API responses
**Prevention:** Type-check API responses in HTTP client

### Issue: Performance degradation
**Symptom:** MCP tools slower due to HTTP overhead
**Measurement:** Time operations before/after
**Acceptable:** <50ms overhead per operation
**Mitigation:** Add request batching if needed

## Success Criteria

- ✅ UI updates within 2 seconds of MCP call (one poll cycle)
- ✅ No "IDLE" shown when MCP tools are active
- ✅ All existing MCP tools work identically
- ✅ Clear error messages when server not running
- ✅ No database lock errors
- ✅ No cache sync issues

## Files Changed

### New files:
- `src/mcp/http-client.ts` ✅ (created)
- `src/mcp/server-http.ts` (to create)

### Modified files:
- `package.json` (change MCP server entry point)

### Backup files (keep until verified):
- `src/mcp/server.ts.backup` (rename old server)

## Rollback Plan

If issues found after deployment:

1. Revert package.json to old server
2. Restart Claude Code
3. Fix issues in server-http.ts
4. Test again
5. Deploy again

## Timeline

- **Phase 2 (Rewrite):** 30-45 min
- **Phase 3 (Testing):** 15-20 min
- **Phase 4 (Deploy):** 5 min
- **Total:** ~1 hour

## Open Questions

1. Should we keep spec parsing local or move to API?
   - **Decision:** Keep local - it's read-only and fast

2. What happens if server crashes mid-operation?
   - **Answer:** MCP tool returns error, no state corruption

3. Do we need request caching?
   - **Answer:** Not initially - measure first

## Next Steps

1. Review this plan with user
2. Create `server-http.ts` with clean architecture
3. Test thoroughly
4. Deploy and verify UI sync works
5. Close the original bug
