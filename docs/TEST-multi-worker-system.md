# Multi-Worker System Test Program

**Date:** 2026-01-23
**Version:** 1.0
**Status:** Ready for Testing

---

## Pre-Test Setup

### Requirements
- [ ] chkd dev server running (`npm run dev` on port 3847)
- [ ] MCP server connected to Claude Code
- [ ] Clean git state (commit or stash changes)
- [ ] At least 2 terminal windows available

### Verify Setup
```bash
# Check server is running
curl http://localhost:3847/api/status

# Check MCP tools available
# In Claude Code, try: chkd_status
```

---

## Test Suite

### TEST 1: Worker Spawn (Basic)
**Goal:** Verify we can spawn a worker from the API/MCP

**Steps:**
1. Call `chkd_spawn_worker` with a test task:
   ```
   chkd_spawn_worker(
     taskId: "TEST.1",
     taskTitle: "Test Worker Spawn"
   )
   ```

2. Verify response contains:
   - [ ] `workerId` (format: `worker-{username}-{timestamp}-{random}`)
   - [ ] `worktreePath` (should be `../chkd-{username}-1`)
   - [ ] `branchName` (should be `feature/{username}/test1-test-worker-spawn`)
   - [ ] `command` (cd + claude command)

3. Verify worktree was created:
   ```bash
   ls -la ../chkd-*
   git worktree list
   ```

4. Verify database record:
   ```bash
   curl "http://localhost:3847/api/workers?repoPath=$(pwd)"
   ```

**Expected:** Worker in `waiting` status, worktree exists

**Cleanup:**
```bash
chkd_stop_worker(workerId, force: true, deleteBranch: true)
```

---

### TEST 2: Worker Claim & Heartbeat
**Goal:** Simulate a worker claiming a task and sending heartbeats

**Steps:**
1. Spawn a worker (as in Test 1)

2. Simulate worker claiming (PATCH to working):
   ```bash
   curl -X PATCH "http://localhost:3847/api/workers/{workerId}" \
     -H "Content-Type: application/json" \
     -d '{"status": "working", "message": "Starting work..."}'
   ```

3. Verify status changed to `working`

4. Send heartbeat updates:
   ```bash
   # 25% progress
   curl -X PATCH "http://localhost:3847/api/workers/{workerId}" \
     -H "Content-Type: application/json" \
     -d '{"message": "Implementing feature...", "progress": 25}'

   # 50% progress
   curl -X PATCH "http://localhost:3847/api/workers/{workerId}" \
     -H "Content-Type: application/json" \
     -d '{"message": "Adding tests...", "progress": 50}'

   # 75% progress
   curl -X PATCH "http://localhost:3847/api/workers/{workerId}" \
     -H "Content-Type: application/json" \
     -d '{"message": "Final touches...", "progress": 75}'
   ```

5. Check UI shows progress updates (open http://localhost:3847)

**Expected:**
- Progress bar advances
- Message updates in UI
- `heartbeat_at` updates in database

**Cleanup:** Stop worker

---

### TEST 3: Manager Signals
**Goal:** Verify signals are created for worker events

**Steps:**
1. Spawn a worker
2. Check signals created:
   ```bash
   curl "http://localhost:3847/api/signals?repoPath=$(pwd)"
   ```
3. Should see "Worker spawned" signal

4. Update worker to working status
5. Check for status change signal

6. In UI, verify signal bar shows messages

**Expected:** Signals appear for spawn, status changes

---

### TEST 4: Clean Auto-Merge
**Goal:** Test auto-merge when no conflicts

**Steps:**
1. Spawn worker for a real task
2. In the worktree, make a simple change:
   ```bash
   cd ../chkd-{username}-1
   echo "// Test comment" >> src/lib/test-file.ts
   git add .
   git commit -m "Test: Add comment"
   ```

3. Call complete endpoint:
   ```bash
   curl -X POST "http://localhost:3847/api/workers/{workerId}/complete" \
     -H "Content-Type: application/json" \
     -d '{"message": "Test complete"}'
   ```

4. Verify:
   - [ ] Response shows `mergeStatus: "clean"`
   - [ ] Worker status is `merged`
   - [ ] Worktree removed
   - [ ] Branch merged to main
   - [ ] History record created

**Expected:** Automatic merge, cleanup

---

### TEST 5: Conflict Detection
**Goal:** Test conflict detection when files overlap

**Steps:**
1. Spawn two workers: Worker A and Worker B

2. In Worker A's worktree, modify `src/lib/types.ts`:
   ```bash
   cd ../chkd-{username}-1
   # Add a comment at line 1
   sed -i '' '1i\
   // Worker A was here
   ' src/lib/types.ts
   git add . && git commit -m "Worker A change"
   ```

3. In Worker B's worktree, modify same file:
   ```bash
   cd ../chkd-{username}-2
   # Add different comment at line 1
   sed -i '' '1i\
   // Worker B was here
   ' src/lib/types.ts
   git add . && git commit -m "Worker B change"
   ```

4. Complete Worker A first (should merge clean)

5. Complete Worker B (should detect conflict):
   ```bash
   curl -X POST "http://localhost:3847/api/workers/{workerBId}/complete"
   ```

6. Verify:
   - [ ] Response shows `mergeStatus: "conflicts"`
   - [ ] `conflicts` array lists the file
   - [ ] Worker status is NOT merged yet
   - [ ] Signal created asking for help

**Expected:** Conflict detected, user prompted

---

### TEST 6: Conflict Resolution
**Goal:** Test resolving conflicts via API

**Steps:**
1. Continue from Test 5 (Worker B has conflicts)

2. Resolve with "keep worker's version":
   ```bash
   curl -X POST "http://localhost:3847/api/workers/{workerBId}/resolve" \
     -H "Content-Type: application/json" \
     -d '{"resolution": "ours"}'
   ```

3. Verify:
   - [ ] Conflict resolved
   - [ ] Worker merged
   - [ ] Worktree cleaned up

4. Check main branch has both changes (Worker B's version wins on conflict)

**Expected:** Resolution completes merge

---

### TEST 7: Dead Worker Detection
**Goal:** Verify dead worker detection works

**Steps:**
1. Spawn a worker
2. Set status to working
3. Wait 2+ minutes without heartbeat
4. Call dead workers endpoint:
   ```bash
   curl "http://localhost:3847/api/workers/dead?repoPath=$(pwd)&thresholdMinutes=2"
   ```

5. Verify worker appears in dead list

**Expected:** Worker detected as dead after timeout

---

### TEST 8: MCP Worker Tools (Full Flow)
**Goal:** Test the actual MCP tools Claude would use

**Steps:**
1. As "Master Claude", spawn worker:
   ```
   chkd_spawn_worker("SD.99", "Integration Test Task")
   ```

2. Open new terminal, cd to worktree

3. As "Worker Claude", simulate heartbeat via MCP:
   ```
   chkd_worker_heartbeat(workerId, "Working on it...", 50)
   ```

4. Check `chkd_workers()` shows the worker

5. Pause worker:
   ```
   chkd_pause_worker(workerId)
   ```

6. Resume worker:
   ```
   chkd_resume_worker(workerId)
   ```

7. Merge worker:
   ```
   chkd_merge_worker(workerId)
   ```

**Expected:** All MCP tools work correctly

---

### TEST 9: UI Components
**Goal:** Verify UI displays correctly

**Steps:**
1. Open http://localhost:3847
2. Spawn a worker
3. Verify:
   - [ ] Worker appears in repo card
   - [ ] Progress bar shows
   - [ ] Status badge correct color
   - [ ] Message displayed
   - [ ] Pause/Stop buttons work

4. Open Split Brain View (if available)
5. Verify:
   - [ ] Worker panels display
   - [ ] Manager signal bar shows
   - [ ] Actions work from UI

**Expected:** UI accurately reflects worker state

---

### TEST 10: Parallel Workers (Stress Test)
**Goal:** Test two workers running simultaneously

**Steps:**
1. Spawn Worker 1 for task A
2. Spawn Worker 2 for task B
3. Verify both appear in UI
4. Update both with progress:
   - Worker 1: 25%, 50%, 75%
   - Worker 2: 30%, 60%, 90%
5. Complete Worker 2 first
6. Complete Worker 1
7. Verify:
   - [ ] Both merged successfully
   - [ ] No race conditions
   - [ ] History shows both

**Expected:** Parallel operation works

---

## Post-Test Cleanup

```bash
# Remove any remaining worktrees
git worktree list
git worktree remove ../chkd-* --force

# Remove test branches
git branch | grep "feature/" | xargs git branch -D

# Reset test changes
git checkout main
git reset --hard HEAD~1  # If needed
```

---

## Test Results Log

| Test | Status | Notes |
|------|--------|-------|
| TEST 1: Worker Spawn | | |
| TEST 2: Worker Claim & Heartbeat | | |
| TEST 3: Manager Signals | | |
| TEST 4: Clean Auto-Merge | | |
| TEST 5: Conflict Detection | | |
| TEST 6: Conflict Resolution | | |
| TEST 7: Dead Worker Detection | | |
| TEST 8: MCP Worker Tools | | |
| TEST 9: UI Components | | |
| TEST 10: Parallel Workers | | |

---

## Issues Found

_Document any issues discovered during testing:_

1.
2.
3.

---

## Recommendations

_Post-testing recommendations:_

1.
2.
3.
