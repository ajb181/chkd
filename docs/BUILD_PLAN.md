# chkd v0.2.0 Build Plan

> Recovery doc - if interrupted, read this to continue.

## Current State: SCAFFOLD COMPLETE ✅

The basic SvelteKit app is working:
- `npm run dev` starts server on :3847
- API routes respond
- CLI skeleton works
- Database schema ready

## What's Built

```
✅ Project scaffold (SvelteKit + adapter-node)
✅ Database layer (src/lib/server/db/)
✅ Spec parser (src/lib/server/spec/parser.ts)
✅ Basic API routes:
   - GET /api/health
   - GET /api/repos, POST /api/repos
   - GET /api/session
   - GET /api/status
✅ CLI skeleton with workflow docs (src/cli/index.ts)
✅ Types (src/lib/types.ts)
```

## What's Next (in order)

### Phase 1: Wire Up CLI Commands
The CLI shows help but commands don't actually work yet.

```
1. POST /api/session/start   - Start a task
2. POST /api/session/complete - Complete current task
3. POST /api/spec/tick       - Mark item complete
4. POST /api/session/check   - Check if on-plan
5. POST /api/spec/add        - Add item to spec
6. POST /api/bugs            - Create a bug
```

Each needs:
- API route in `src/routes/api/`
- Wire to database queries
- Test with CLI

### Phase 2: Spec Writer
Need `src/lib/server/spec/writer.ts` to modify SPEC.md files:
- Mark items complete `[ ]` → `[x]`
- Add new items
- Copy from old project: `daemon/src/validator/spec-writer.ts`

### Phase 3: UI (Optional for MVP)
Copy essential components from old project:
```
Old: src/lib/components/StoryList.svelte
Old: src/lib/components/StoryDetail.svelte
Old: src/lib/components/CurrentTaskCard.svelte
```

Or build fresh - the CLI is the primary interface now.

### Phase 4: Skills
Update `.claude/skills/chkd/` to use new endpoints.
Add workflow template language per V2_WORKFLOW_VISION.md.

## Key Files Reference

| Purpose | File |
|---------|------|
| Database schema | `src/lib/server/db/index.ts` |
| Database queries | `src/lib/server/db/queries.ts` |
| Spec parser | `src/lib/server/spec/parser.ts` |
| Types | `src/lib/types.ts` |
| CLI | `src/cli/index.ts` |
| API routes | `src/routes/api/*/+server.ts` |

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
