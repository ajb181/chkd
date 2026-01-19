# chkd v0.2.0 Build Plan

> Recovery doc - if interrupted, read this to continue.

## Current State: PHASE 3 COMPLETE ✅

All core functionality is working:
- `npm run dev` starts server on :3847
- All API endpoints functional
- CLI commands work end-to-end
- Workflow template auto-added to new features
- Claude Code skills ready

## What's Built

```
✅ Project scaffold (SvelteKit + adapter-node)
✅ Database layer (src/lib/server/db/)
✅ Spec parser (src/lib/server/spec/parser.ts)
✅ Spec writer (src/lib/server/spec/writer.ts)
✅ All API routes:
   - GET /api/health
   - GET/POST /api/repos
   - GET /api/session
   - GET /api/status
   - POST /api/session/start
   - POST /api/session/complete
   - POST /api/session/check
   - GET /api/spec/full
   - POST /api/spec/tick
   - POST /api/spec/add (with workflow template!)
   - GET/POST /api/bugs
✅ CLI with workflow docs (src/cli/index.ts)
✅ Types (src/lib/types.ts)
✅ Claude Code skills:
   - /chkd - Build mode with polish permission
   - /bugfix - Research-first bug fixing
   - /story - Story development and spec refinement
   - /spec-check - Validate SPEC.md format
```

## Phase 1: DONE ✅
## Phase 3: DONE ✅

## What's Next

### Phase 2: UI (Optional)
Copy or rebuild essential components:
```
Old: src/lib/components/StoryList.svelte
Old: src/lib/components/StoryDetail.svelte
Old: src/lib/components/CurrentTaskCard.svelte
```

The CLI is the primary interface, but UI is nice for visual progress.

### Phase 4: Polish
- Fix emoji duplication bug (phase status)
- Better elapsed time display in CLI
- Error handling improvements

## Key Files Reference

| Purpose | File |
|---------|------|
| Database schema | `src/lib/server/db/index.ts` |
| Database queries | `src/lib/server/db/queries.ts` |
| Spec parser | `src/lib/server/spec/parser.ts` |
| Types | `src/lib/types.ts` |
| CLI | `src/cli/index.ts` |
| API routes | `src/routes/api/*/+server.ts` |
| Skills | `.claude/skills/*/SKILL.md` |

## Available Skills

| Skill | Purpose |
|-------|---------|
| `/chkd` | Build mode - check session, implement tasks with polish |
| `/bugfix` | Fix bugs without feature creep - research first |
| `/story` | Develop stories - assess, question, refine specs |
| `/spec-check` | Validate SPEC.md format after editing |

## Commands

```bash
# Start dev server
cd /Users/alex/chkd-v2
npm run dev

# Test CLI
npx tsx src/cli/index.ts help
npx tsx src/cli/index.ts workflow
npx tsx src/cli/index.ts status

# Test API
curl http://localhost:3847/api/health
curl http://localhost:3847/api/status?repoPath=$(pwd)
```

## Old Project Reference

If you need to copy code from the old daemon:
```
/Users/alex/chkd/daemon/src/
├── db/schema.ts        → Already copied
├── db/queries.ts       → Partially copied
├── validator/spec-parser.ts → Already copied
├── validator/spec-writer.ts → NEED TO COPY
├── index.ts            → Reference for API patterns
```

## Design Principles (from V2_WORKFLOW_VISION.md)

1. **Keep it simple** - avoid over-engineering
2. **Backend-first** - test data in API, not frontend
3. **Workflow catches duplicates** - no heavy tooling
4. **CLI is documentation** - help text teaches the flow

## Quick Recovery Steps

1. `cd /Users/alex/chkd-v2`
2. `npm run dev`
3. Read this file
4. Continue from "What's Next"
