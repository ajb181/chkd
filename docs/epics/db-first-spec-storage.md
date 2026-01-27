# Epic: DB-First Spec Storage

> Migrate from SPEC.md markdown parsing to SQLite as source of truth. Items stored in DB, viewable/editable via MCP and UI only. Eliminates parser complexity and enables proper querying.

**Tag:** `db-first-spec-storage`
**Status:** Complete
**Created:** 2026-01-26

## Scope

- [x] Create spec_items DB schema
- [x] Build query layer (items.ts)
- [x] Migrate MCP read operations
- [x] Migrate MCP write operations
- [x] Update UI to use DB
- [x] Import tool for existing SPEC.md (migrate-spec.ts)
- [x] Isolate parser to maintenance tools only

## Out of Scope

- Full parser removal (kept for repair/validate/transfer tools)

## Overhaul Checklist

- [x] All linked items complete
- [x] End-to-end tested
- [x] Integration verified
- [x] Documentation updated
- [x] User sign-off

---

*Link items to this epic with: `chkd_tag("ITEM.ID", ["db-first-spec-storage"])`*
