# BUG.3: epic() rejects pre-written epic files

## Bug
`epic()` threw "already exists" when the agent had written the epic doc before calling the MCP tool. This blocked the natural workflow of: write rich doc first, then register with chkd.

## Root Cause
`createEpic()` in `src/lib/server/epic/index.ts` used `fs.access()` to check if the file existed, then threw unconditionally if it did.

## Fix
When the file already exists:
1. Parse it with `parseEpicFile()` and return the adopted epic
2. If parsing fails (no `# Epic:` title), throw a clear error instead of silently overwriting

This matches the design-file-first pattern used by `add()`.

## Additional Change: Workflow Simplification
Collapsed the Explore (2 checkpoints) and Design (2 checkpoints) phases into a single Understand phase (1 checkpoint) in `src/lib/server/spec/workflow.ts`.

**Rationale:** Tasks arrive well-spec'd by the user. The agent just needs to read the design and confirm it's clear — not do independent research and design review.

**Before:** Explore (Research, Share) + Design (Review, Approve) = 4 checkpoints
**After:** Understand (Confirm) = 1 checkpoint

Affected workflows:
- DEFAULT (FE/SD): 11 → 8 checkpoints
- BE: 9 → 6 checkpoints
- REMOVE, AUDIT: Updated index references

## Files Changed
- `src/lib/server/epic/index.ts` — adopt-or-error instead of always-error
- `src/lib/server/spec/workflow.ts` — collapsed Explore+Design into Understand
