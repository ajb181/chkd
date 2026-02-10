# BUG.2: CreateBug() incorrectly requires design file

## Bug

`CreateBug()` returns `❌ 📄 Design file required` — should not require a design file.

**Introduced in:** v0.4.0 (commit 751ae75) when design file requirement was added to `add()`.

## Root Cause

`src/routes/api/spec/add/+server.ts` line 84:

```typescript
// BEFORE (broken)
const needsDesignFile = !workflowType || workflowType === 'default' || workflowType === 'refactor';
```

The check only exempts by `workflowType`. But `CreateBug()` sends `areaCode: 'BUG'` with **no workflowType**. Since `!workflowType` is `true`, the design file is required.

`CreateQuickWin()` works because it sends `workflowType: 'quickwin'`.

## Fix

```typescript
// AFTER (fixed)
const isBugOrQuickWin = areaCode === 'BUG' || workflowType === 'quickwin';
const needsDesignFile = !isBugOrQuickWin && (!workflowType || workflowType === 'default' || workflowType === 'refactor');
```

Now explicitly checks `areaCode === 'BUG'` in addition to `workflowType`.

## Test

1. Call `CreateBug("test bug", "steps", "file.ts", "expected")` — should succeed without design file
2. Call `add("feature", "BE", ...)` without designFile — should still require it
3. Call `CreateQuickWin(...)` — should still work without design file
