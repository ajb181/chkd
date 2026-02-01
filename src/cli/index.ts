#!/usr/bin/env -S npx tsx

/**
 * chkd CLI - Setup and status commands
 *
 * Usage:
 *   chkd init [name]     - Initialize new project
 *   chkd upgrade         - Add chkd to existing project
 *   chkd status          - What's going on?
 *   chkd workflow        - Show the development workflow
 *   chkd help            - Show all commands
 *
 * For building tasks, use /chkd <task_id> in Claude Code:
 *   /chkd 3.2            - Build task 3.2 from spec
 */

// Load .env file from chkd installation directory
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '..', '..', '.env');

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length) {
        process.env[key] = valueParts.join('=');
      }
    }
  }
}

const API_BASE = 'http://localhost:3847';

// ============================================
// Helpers
// ============================================

async function api(endpoint: string, options?: RequestInit) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    return await res.json();
  } catch {
    return { success: false, error: 'Cannot connect to chkd. Is it running? (npm run dev)' };
  }
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

// Animated spinner for long operations
function createSpinner(message: string) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${frames[i]} ${message}`);
    i = (i + 1) % frames.length;
  }, 80);

  return {
    stop: (finalMessage?: string) => {
      clearInterval(interval);
      process.stdout.write(`\r  ${finalMessage || '✓ ' + message}${' '.repeat(20)}\n`);
    }
  };
}

// Show current context footer (task/subtask or idle)
async function showContext() {
  const cwd = process.cwd();
  const res = await api(`/api/session?repoPath=${encodeURIComponent(cwd)}`);

  if (!res.success || !res.data) return;

  const session = res.data;

  console.log(`  ─────────────────────────────────`);
  if (session.currentTask) {
    // Truncate long titles
    const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) + '...' : s;
    console.log(`  📍 ${truncate(session.currentTask.title, 50)}`);
    if (session.currentItem) {
      console.log(`     └─ ${truncate(session.currentItem.title, 45)}`);
    }
    if (session.iteration > 1) {
      console.log(`     #${session.iteration}`);
    }
  } else {
    console.log(`  📍 Idle → chkd start "TASK_ID"`);
  }
}

// Show queue items with instruction for Claude
async function showQueueReminder() {
  const cwd = process.cwd();
  const res = await api(`/api/session/queue?repoPath=${encodeURIComponent(cwd)}`);

  if (!res.success || !res.data?.items?.length) return;

  console.log(`\n  📬 Queue (${res.data.items.length}) - Add to your internal todo:`);
  for (const item of res.data.items) {
    const title = item.title.length > 55 ? item.title.slice(0, 52) + '...' : item.title;
    console.log(`     • ${title}`);
  }
}

// ============================================
// Commands
// ============================================

async function tick(itemQuery: string) {
  const cwd = process.cwd();

  if (!itemQuery) {
    // Tick current task if no query
    const res = await api('/api/spec/tick', {
      method: 'POST',
      body: JSON.stringify({ repoPath: cwd }),
    });

    if (!res.success) {
      console.log(`\n  ❌ ${res.error}\n`);
      return;
    }

    console.log(`\n  ✓ ${res.data.message}`);
    await showContext();
    console.log('');
    return;
  }

  const res = await api('/api/spec/tick', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd, itemQuery }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  // Show what was ticked (with parent if sub-task)
  const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) + '...' : s;
  if (res.data.parentTitle) {
    console.log(`\n  ✓ ${truncate(res.data.title, 45)}`);
    console.log(`    (${truncate(res.data.parentTitle, 40)})`);
  } else {
    console.log(`\n  ✓ ${truncate(res.data.title, 50)}`);
  }

  // Warn if Feedback item ticked without proper approval
  if (res.data.warning) {
    console.log(`  ⚠️  ${res.data.warning}`);
  }

  // Reminder for next step
  if (res.data.nextStep) {
    console.log(`  → ${res.data.nextStep}`);
  }

  await showQueueReminder();
  console.log('');
}

async function sync(action?: string) {
  const cwd = process.cwd();
  const path = await import('path');
  const fs = await import('fs/promises');

  // If action is "idle" or "reset", clear session
  if (action === 'idle' || action === 'reset') {
    const res = await api('/api/session/pause', {
      method: 'POST',
      body: JSON.stringify({ repoPath: cwd }),
    });

    if (!res.success) {
      console.log(`\n  ❌ ${res.error}\n`);
      return;
    }

    console.log(`\n  ✓ Session reset to idle`);
    console.log(`  App will now show idle state.\n`);
    return;
  }

  // If action is "skills" or "files", sync from chkd source
  if (action === 'skills' || action === 'files') {
    console.log(`\n  🔄 Syncing chkd assets...`);
    console.log(`  ─────────────────────────────────`);

    // Find chkd source directory (where this CLI is installed)
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const chkdRoot = path.resolve(__dirname, '..', '..');
    const templatesDir = path.join(chkdRoot, 'templates');

    // Read manifest
    let manifest: any;
    try {
      const manifestPath = path.join(chkdRoot, 'chkd-sync.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      manifest = JSON.parse(manifestContent);
    } catch (err) {
      console.log(`  ❌ Could not read chkd-sync.json: ${err}`);
      return;
    }

    console.log(`  Source version: ${manifest.version}`);
    console.log(``);

    // Helper to check if file content differs
    async function contentDiffers(file1: string, file2: string): Promise<boolean> {
      try {
        const [content1, content2] = await Promise.all([
          fs.readFile(file1, 'utf-8'),
          fs.readFile(file2, 'utf-8'),
        ]);
        return content1 !== content2;
      } catch {
        return false; // If either file doesn't exist, no conflict
      }
    }

    // Helper to copy directory
    async function copyDir(src: string, dest: string, conflicts: string[] = []) {
      await fs.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          await copyDir(srcPath, destPath, conflicts);
        } else {
          // Check for local modifications
          if (await contentDiffers(srcPath, destPath)) {
            conflicts.push(entry.name);
          }
          await fs.copyFile(srcPath, destPath);
        }
      }
      return conflicts;
    }

    let hasConflicts = false;

    // Helper to backup file with timestamp (keeps only 2 most recent)
    async function backupBeforeSync(filePath: string): Promise<string | null> {
      const ext = path.extname(filePath);
      const base = filePath.slice(0, -ext.length);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const backupPath = `${base}-${timestamp}${ext}`;
      try {
        await fs.copyFile(filePath, backupPath);

        // Clean up old backups - keep only 2 most recent
        const dir = path.dirname(filePath);
        const baseName = path.basename(base);
        const files = await fs.readdir(dir);
        const backups = files
          .filter(f => f.startsWith(baseName + '-') && f.endsWith(ext) && /\d{4}-\d{2}-\d{2}T\d{2}-\d{2}/.test(f))
          .sort()
          .reverse();

        // Delete all but the 2 most recent
        for (const oldBackup of backups.slice(2)) {
          try {
            await fs.unlink(path.join(dir, oldBackup));
          } catch { /* ignore */ }
        }

        return path.basename(backupPath);
      } catch {
        return null;
      }
    }

    // Process each asset
    for (const asset of manifest.assets) {
      const srcPath = path.join(chkdRoot, asset.source);
      const destPath = path.join(cwd, asset.destination);

      try {
        // Check if source exists
        await fs.access(srcPath);
      } catch {
        console.log(`  ⚠ Source not found: ${asset.source}`);
        continue;
      }

      // Handle different modes
      if (asset.mode === 'init-only') {
        try {
          await fs.access(destPath);
          console.log(`  · Skipped ${asset.name} (init-only, exists)`);
          continue;
        } catch {
          // Doesn't exist, can copy
        }
      }

      if (asset.mode === 'merge') {
        // Check if local differs from source
        try {
          await fs.access(destPath);
          if (await contentDiffers(srcPath, destPath)) {
            // Try LLM merge if available
            const { isAvailable, mergeClaudeMd } = await import('./llm.js');
            if (isAvailable()) {
              try {
                const existingContent = await fs.readFile(destPath, 'utf-8');
                const templateContent = await fs.readFile(srcPath, 'utf-8');
                const repoName = path.basename(cwd);

                // Backup before merge
                const backupName = await backupBeforeSync(destPath);
                if (backupName) {
                  console.log(`  📦 Backed up to ${backupName}`);
                }

                console.log(`  🔄 Merging ${asset.name} with LLM...`);
                const merged = await mergeClaudeMd(existingContent, templateContent, repoName);
                await fs.writeFile(destPath, merged, 'utf-8');
                console.log(`  ✓ Merged ${asset.name} (LLM-assisted)`);
              } catch (err) {
                console.log(`  ⚠ LLM merge failed for ${asset.name}: ${err}`);
                hasConflicts = true;
              }
            } else {
              console.log(`  ⚠ Skipped ${asset.name} (merge mode - no API key for LLM merge)`);
              hasConflicts = true;
            }
          } else {
            console.log(`  · Skipped ${asset.name} (merge mode - no changes)`);
          }
        } catch {
          // Destination doesn't exist, copy it
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(srcPath, destPath);
          console.log(`  ✓ Created ${asset.name}`);
        }
        continue;
      }

      // Copy mode - check if it's a directory
      const stat = await fs.stat(srcPath);
      if (stat.isDirectory()) {
        const conflicts: string[] = [];
        await copyDir(srcPath, destPath, conflicts);
        if (conflicts.length > 0) {
          console.log(`  ✓ Synced ${asset.name}/ (overwrote ${conflicts.length} local changes)`);
          hasConflicts = true;
        } else {
          console.log(`  ✓ Synced ${asset.name}/`);
        }
      } else {
        // Check for local modifications before overwriting
        const hadLocalChanges = await contentDiffers(srcPath, destPath);
        await fs.mkdir(path.dirname(destPath), { recursive: true });

        // Backup if there are local changes
        if (hadLocalChanges) {
          const backupName = await backupBeforeSync(destPath);
          if (backupName) {
            console.log(`  📦 Backed up to ${backupName}`);
          }
        }

        await fs.copyFile(srcPath, destPath);
        if (hadLocalChanges) {
          console.log(`  ✓ Synced ${asset.name} (overwrote local changes)`);
          hasConflicts = true;
        } else {
          console.log(`  ✓ Synced ${asset.name}`);
        }
      }
    }

    if (hasConflicts) {
      console.log(`\n  ⚠ Some local changes were overwritten or skipped.`);
      console.log(`    Project customizations in 'copy' mode files are overwritten.`);
      console.log(`    Files in 'merge' mode keep local changes (sync manually).`);
    }

    // Write version file
    const versionFile = path.join(cwd, '.chkd-version');
    await fs.writeFile(versionFile, manifest.version, 'utf-8');
    console.log(`\n  ✅ Synced to version ${manifest.version}`);
    console.log(`  Version written to .chkd-version\n`);
    return;
  }

  // If action is "all", sync to all registered repos
  if (action === 'all') {
    const repos = await api('/api/repos');
    if (!repos.success || !repos.data) {
      console.log(`\n  ❌ Could not get repos list\n`);
      return;
    }

    console.log(`\n  🔄 Syncing to all repos...`);
    console.log(`  ─────────────────────────────────`);

    for (const repo of repos.data) {
      if (repo.path === cwd) {
        console.log(`  · Skipping ${repo.name} (current)`);
        continue;
      }
      console.log(`\n  → ${repo.name}`);
      // Run sync in that directory
      const origCwd = process.cwd();
      try {
        process.chdir(repo.path);
        await sync('skills');
      } catch (err) {
        console.log(`    ❌ Failed: ${err}`);
      } finally {
        process.chdir(origCwd);
      }
    }
    console.log(`\n  ✅ Done syncing all repos\n`);
    return;
  }

  // Default: just report status
  const res = await api(`/api/status?repoPath=${encodeURIComponent(cwd)}`);

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  const data = res.data;

  console.log(`\n  🔄 Sync Status`);
  console.log(`  ─────────────────────────────────`);

  if (!data.registered) {
    console.log(`  Not registered with chkd`);
    console.log(`\n  Run 'chkd upgrade' to register.\n`);
    return;
  }

  if (data.session.currentTask) {
    console.log(`  Active task: ${data.session.currentTask.title}`);
    console.log(`  Iteration: ${data.session.iteration}`);
    console.log(`  Duration: ${formatTime(data.session.elapsedMs)}`);
    console.log(`\n  Commands:`);
    console.log(`    chkd sync idle     - Reset session to idle`);
    console.log(`    chkd sync skills   - Sync skills from chkd source`);
    console.log(`    chkd sync all      - Sync to all registered repos\n`);
  } else {
    console.log(`  Session is idle (no active task)`);
    console.log(`\n  Commands:`);
    console.log(`    chkd sync skills   - Sync skills from chkd source`);
    console.log(`    chkd sync all      - Sync to all registered repos\n`);
  }
}

async function pause(note?: string) {
  const cwd = process.cwd();

  const res = await api('/api/session/pause', {
    method: 'POST',
    body: JSON.stringify({
      repoPath: cwd,
      note: note || undefined,
      pausedBy: 'cli',
    }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  console.log(`\n  ⏸️  Paused: ${res.data.pausedTask}`);

  if (res.data.handoverNote) {
    console.log(`\n  📝 Handover note saved:`);
    console.log(`     "${res.data.handoverNote.note}"`);
  }

  console.log(`\n  Task returned to queue. Session is idle.\n`);
}

async function idle() {
  const cwd = process.cwd();

  // Check if there's an active session first
  const statusRes = await api(`/api/session?repoPath=${encodeURIComponent(cwd)}`);
  if (statusRes.success && statusRes.data) {
    const session = statusRes.data;
    const status = session.status;
    const mode = session.mode;

    // Block if in any non-idle state
    if (status !== 'idle' || session.currentTask) {
      const stateLabel = mode === 'debugging' ? 'debugging' :
                         mode === 'impromptu' ? 'in impromptu mode' :
                         status === 'ready_for_testing' ? 'ready for testing' :
                         status === 'rework' ? 'in rework' :
                         status === 'complete' ? 'complete (pending confirmation)' :
                         'building';
      const task = session.currentTask?.title || 'Unknown task';
      console.log(`\n  ❌ Cannot go idle while ${stateLabel}`);
      console.log(`     Active: ${task}`);
      console.log(`\n  Options:`);
      console.log(`    • chkd done        - Complete the current work`);
      console.log(`    • chkd pause       - Put task back in queue with handover note`);
      console.log(`    • chkd sync idle   - Force idle (loses progress tracking)\n`);
      return;
    }
  }

  const res = await api('/api/session/idle', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  console.log(`\n  ✅ Session returned to idle.\n`);
}

async function done(force: boolean = false) {
  const cwd = process.cwd();

  const res = await api('/api/session/complete', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd, force }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}`);

    // Show incomplete items if that's the issue
    if (res.incompleteItems && res.incompleteItems.length > 0) {
      console.log(`\n  Incomplete sub-items:`);
      for (const item of res.incompleteItems) {
        console.log(`    ○ ${item}`);
      }
      console.log(`\n  Options:`);
      console.log(`    • chkd pause "note"   - Pause task, come back later (recommended)`);
      console.log(`    • chkd done --force   - Mark complete anyway (skips open items)\n`);
    } else if (res.hint) {
      console.log(`  💡 ${res.hint}\n`);
    } else {
      console.log('');
    }
    return;
  }

  console.log(`\n  ✅ Completed: ${res.data.completedTask}`);

  // Get context for smarter suggestions
  const bugsRes = await api(`/api/bugs?repoPath=${encodeURIComponent(cwd)}`);
  const openBugs = (bugsRes.data || []).filter((b: any) => b.status !== 'fixed' && b.status !== 'wont_fix');
  
  console.log(`\n  ─────────────────────────────────`);
  console.log(`  WHAT'S NEXT?`);

  if (res.data.nextTask) {
    console.log(`  • 📋 Next in spec: ${res.data.nextTask}`);
  }
  
  if (openBugs.length > 0) {
    console.log(`  • 🐛 ${openBugs.length} open bug(s) - chkd bugfix to work on one`);
  }
  
  console.log(`  • 💬 Discuss with user what to work on next`);
  console.log(`  • 📊 chkd status to see full project state`);
  
  console.log(`\n  Session is now idle.\n`);
}

async function start(taskQuery: string) {
  if (!taskQuery) {
    console.log(`\n  Usage: chkd start "SD.1" or chkd start "task title"\n`);
    return;
  }

  const cwd = process.cwd();

  const res = await api('/api/session/start', {
    method: 'POST',
    body: JSON.stringify({
      repoPath: cwd,
      taskQuery: taskQuery,
    }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}`);
    if (res.hint) {
      console.log(`  💡 ${res.hint}`);
    }
    console.log('');
    return;
  }

  console.log(`\n  🚀 Started: ${res.data.taskTitle}`);

  // Warn if task was reopened
  if (res.data.reopened) {
    console.log(`  ⚠️  Reopened (was marked done)`);
  }

  // Show handover note if there was one
  if (res.data.handoverNote) {
    console.log(`  📝 "${res.data.handoverNote.note}"`);
  }

  // Show task context
  const ctx = res.data.context;
  if (ctx) {
    if (ctx.story) {
      console.log(`\n  📖 Story: ${ctx.story}`);
    }
    if (ctx.keyRequirements?.length) {
      console.log(`\n  📋 Key Requirements:`);
      ctx.keyRequirements.forEach((r: string) => console.log(`     • ${r}`));
    }
    if (ctx.filesToChange?.length) {
      console.log(`\n  📁 Files to Change:`);
      ctx.filesToChange.forEach((f: string) => console.log(`     • ${f}`));
    }
    if (ctx.testing?.length) {
      console.log(`\n  🧪 Testing:`);
      ctx.testing.forEach((t: string) => console.log(`     • ${t}`));
    }
  }

  console.log(`\n  💡 Run 'chkd progress' to see sub-items.`);

  await showQueueReminder();
  console.log('');
}

async function working(itemQuery: string) {
  if (!itemQuery) {
    console.log(`\n  Usage: chkd working "item title or ID"\n`);
    return;
  }

  const cwd = process.cwd();

  // First, find the item by query
  const statusRes = await api(`/api/status?repoPath=${encodeURIComponent(cwd)}`);
  if (!statusRes.success || !statusRes.data.registered) {
    console.log(`\n  ❌ ${statusRes.error || 'Project not registered'}\n`);
    return;
  }

  // Call working-on endpoint
  const res = await api('/api/session/working-on', {
    method: 'POST',
    body: JSON.stringify({
      repoPath: cwd,
      itemId: itemQuery, // Could be ID or title
      itemTitle: itemQuery,
    }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}`);
    if (res.hint) console.log(`  💡 ${res.hint}`);
    console.log('');
    return;
  }

  console.log(`\n  🔨 ${res.data.message}`);

  // Show API warning if any
  if (res.data.warning) {
    console.log(`  ⚠️  ${res.data.warning}`);
  }

  // Fetch parent task context if we're working on a sub-item
  const specRes = await api(`/api/spec/full?repoPath=${encodeURIComponent(cwd)}`);
  if (specRes.success && statusRes.data.session?.currentTask) {
    const spec = specRes.data;
    const taskId = statusRes.data.session.currentTask.id;

    // Find the parent task
    for (const area of spec.areas || spec.phases || []) {
      for (const item of area.items || []) {
        if (item.id === taskId || item.title === statusRes.data.session.currentTask.title) {
          // Show condensed context
          if (item.keyRequirements?.length || item.filesToChange?.length) {
            console.log(`\n  📋 Context:`);
            if (item.keyRequirements?.length) {
              console.log(`     Reqs: ${item.keyRequirements.slice(0, 2).join(', ')}${item.keyRequirements.length > 2 ? '...' : ''}`);
            }
            if (item.filesToChange?.length) {
              console.log(`     Files: ${item.filesToChange.slice(0, 3).join(', ')}${item.filesToChange.length > 3 ? '...' : ''}`);
            }
          }
          break;
        }
      }
    }
  }

  // Phase-specific nudges for chkd workflow keywords
  const itemLower = itemQuery.toLowerCase();
  if (itemLower.startsWith('explore')) {
    console.log(`\n  💡 Research first:`);
    console.log(`     - Review the code you'll touch`);
    console.log(`     - Flag complexity or refactor opportunities to user`);
    console.log(`     - If messy: suggest refactoring first, let user decide`);
  } else if (itemLower.startsWith('design')) {
    console.log(`  💡 Define the approach. Diagram if complex.`);
  } else if (itemLower.startsWith('prototype')) {
    console.log(`  💡 Use mock/fake data. Real backend comes later.`);
  } else if (itemLower.startsWith('feedback')) {
    console.log(`  🛑 STOP! This phase requires USER APPROVAL.`);
    console.log(`     - Show your work to the user`);
    console.log(`     - Wait for explicit "yes" or approval`);
    console.log(`     - Only tick AFTER user confirms`);
    console.log(`  📋 Use 'chkd iterate' after each piece of work to stay anchored.`);
  } else if (itemLower.startsWith('implement')) {
    console.log(`  💡 Now build the real logic. Feedback was approved.`);
  } else if (itemLower.startsWith('polish')) {
    console.log(`  💡 Error states, edge cases, loading states.`);
  } else if (itemLower.startsWith('document')) {
    console.log(`  💡 Update docs, guides, CLAUDE.md if needed.`);
  } else if (itemLower.startsWith('commit')) {
    console.log(`  💡 Stage files, write clear message with assumptions.`);
  } else {
    console.log(`  💡 Run 'chkd tick' when done.`);
  }

  // Tick reminder - don't batch!
  console.log(`\n  ─────────────────────────────────────────────────────`);
  console.log(`  ⚠️  DO THE WORK FIRST, then tick.`);
  console.log(`     NEVER chain: chkd working && chkd tick`);
  console.log(`     There's a 2-second minimum before tick is allowed.`);
  console.log(`  ─────────────────────────────────────────────────────`);

  await showQueueReminder();
  console.log('');
}

async function iterate() {
  const cwd = process.cwd();

  const res = await api('/api/session/iterate', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}`);
    if (res.hint) console.log(`  💡 ${res.hint}`);
    console.log('');
    return;
  }

  const { iteration, task, currentItem, phase, phaseNudge, reminder } = res.data;

  console.log(`\n  🔄 Iteration #${iteration}`);
  console.log(`     ${task.title}`);
  if (currentItem) {
    console.log(`     └─ ${currentItem.title}`);
  }
  console.log(`  ─────────────────────────────────`);

  if (phaseNudge) {
    console.log(`  💡 ${phaseNudge}`);
  }
  console.log(`  📋 ${reminder}`);

  await showQueueReminder();
  console.log('');
}

async function adhoc(type: 'impromptu' | 'debug', description: string) {
  if (!description) {
    const cmd = type === 'debug' ? 'chkd debug' : 'chkd impromptu';
    const examples = type === 'debug'
      ? ['chkd debug "Fixing login crash"', 'chkd debug "Investigation: slow API"']
      : ['chkd impromptu "Quick script for data export"', 'chkd impromptu "Experimenting with new lib"'];
    console.log(`\n  Usage: ${cmd} "description"\n`);
    console.log(`  Examples:`);
    examples.forEach(ex => console.log(`    ${ex}`));
    console.log('');
    return;
  }

  const cwd = process.cwd();
  const res = await api('/api/session/adhoc', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd, type, description }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}`);
    if (res.hint) console.log(`  💡 ${res.hint}`);
    console.log('');
    return;
  }

  console.log(`\n  ${res.data.message}`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  💡 Use 'chkd done' when finished.`);
  console.log('');
}

async function progress() {
  const cwd = process.cwd();
  const res = await api(`/api/status?repoPath=${encodeURIComponent(cwd)}`);

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  if (!res.data.registered) {
    console.log(`\n  ${res.data.message}\n`);
    return;
  }

  const data = res.data;

  if (!data.session.currentTask) {
    console.log(`\n  No current task. Use /chkd <task_id> to start one.\n`);
    return;
  }

  console.log(`\n  🔨 Current Task: ${data.session.currentTask.title}`);
  console.log(`  ─────────────────────────────────────`);

  // Get the spec to find sub-items
  const specRes = await api(`/api/spec/full?repoPath=${encodeURIComponent(cwd)}`);
  if (!specRes.success) {
    console.log(`  (Could not load spec details)\n`);
    return;
  }

  const spec = specRes.data;

  // Find the current task in the spec
  let currentItem = null;
  for (const phase of spec.phases || []) {
    for (const item of phase.items || []) {
      if (item.id === data.session.currentTask.id ||
          item.title === data.session.currentTask.title) {
        currentItem = item;
        break;
      }
    }
    if (currentItem) break;
  }

  if (!currentItem) {
    console.log(`  Task not found in spec\n`);
    return;
  }

  // Show task context
  if (currentItem.story) {
    console.log(`\n  📖 ${currentItem.story}`);
  }
  if (currentItem.keyRequirements?.length) {
    console.log(`\n  📋 Requirements: ${currentItem.keyRequirements.join(', ')}`);
  }
  if (currentItem.filesToChange?.length) {
    console.log(`  📁 Files: ${currentItem.filesToChange.join(', ')}`);
  }
  if (currentItem.testing?.length) {
    console.log(`  🧪 Testing: ${currentItem.testing.join(', ')}`);
  }

  // Show sub-items if any
  if (currentItem.children && currentItem.children.length > 0) {
    const completed = currentItem.children.filter((c: any) => c.completed).length;
    console.log(`\n  Progress: ${completed}/${currentItem.children.length} sub-items\n`);

    for (const child of currentItem.children) {
      const mark = child.completed ? '✓' : (child.inProgress ? '~' : ' ');
      const status = child.completed ? '✅' : (child.inProgress ? '🔨' : '⬚');
      console.log(`  ${status} ${child.title}`);
    }
    console.log(`\n  💡 Work through sub-items in order. Tick each as you complete it.`);
  } else {
    console.log(`  No sub-items for this task`);
  }

  await showQueueReminder();
  console.log('');
}

async function fix(bugQuery: string) {
  if (!bugQuery) {
    console.log(`\n  Usage: chkd fix "bug title or ID"`);
    console.log(`\n  Signal that a fix is ready for verification.`);
    console.log(`  Does NOT close the bug - run 'chkd resolve' after user verifies.\n`);
    return;
  }

  const cwd = process.cwd();

  // Find the bug to show its title
  const listRes = await api(`/api/bugs?repoPath=${encodeURIComponent(cwd)}`);
  if (!listRes.success) {
    console.log(`\n  ❌ ${listRes.error}\n`);
    return;
  }

  const bugs = listRes.data || [];
  const queryLower = bugQuery.toLowerCase();
  const bug = bugs.find((b: any) =>
    b.id === bugQuery ||
    (typeof b.id === 'string' && b.id.startsWith(bugQuery)) ||
    b.title.toLowerCase().includes(queryLower)
  );

  if (!bug) {
    console.log(`\n  ❌ Bug not found: "${bugQuery}"`);
    return;
  }

  console.log(`\n  🔧 Fix ready: ${bug.title}`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  ⚠️  VERIFY WITH USER:`);
  console.log(`     Ask user to confirm the fix solves the problem.`);
  console.log(`     Do not close until user has verified.`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  💡 Run 'chkd resolve "${bugQuery}"' after user confirms\n`);
}

async function resolveBug(bugQuery: string) {
  if (!bugQuery) {
    console.log(`\n  Usage: chkd resolve "bug title or ID"`);
    console.log(`\n  Close a bug after user has verified the fix works.\n`);
    return;
  }

  const cwd = process.cwd();
  const res = await api('/api/bugs', {
    method: 'PATCH',
    body: JSON.stringify({ repoPath: cwd, bugQuery, status: 'fixed' }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  // End the debug session
  await api('/api/session', {
    method: 'PATCH',
    body: JSON.stringify({ repoPath: cwd, status: 'idle' }),
  });

  console.log(`\n  ✅ ${res.data.message}`);
  console.log(`  📴 Debug session ended`);
  console.log(`\n  💡 Don't forget to commit and push your changes!\n`);
}

async function startBugfix(query: string, options: { convert?: boolean } = {}) {
  if (!query) {
    console.log(`\n  Usage: chkd bugfix "bug title or ID"`);
    console.log(`\n  Start working on a bug. Non-interactive - use flags for options.`);
    console.log(`\n  Options:`);
    console.log(`    --convert    Convert to a proper story/task instead`);
    console.log(`\n  Examples:`);
    console.log(`    chkd bugfix "save button"       # Start bugfix by title`);
    console.log(`    chkd bugfix "a1b2c3"            # Start bugfix by ID`);
    console.log(`    chkd bugfix "big issue" --convert  # Convert to story\n`);
    return;
  }

  const cwd = process.cwd();

  // First, find the bug
  const listRes = await api(`/api/bugs?repoPath=${encodeURIComponent(cwd)}`);
  if (!listRes.success) {
    console.log(`\n  ❌ ${listRes.error}\n`);
    return;
  }

  const bugs = listRes.data || [];
  const queryLower = query.toLowerCase();

  // Find by ID or title
  let bug = bugs.find((b: any) =>
    b.id === query ||
    (typeof b.id === 'string' && b.id.startsWith(query)) ||
    b.title.toLowerCase().includes(queryLower)
  );

  // Auto-create bug if not found (common flow: debug → bugfix with same description)
  let createdBug = false;
  if (!bug) {
    const createRes = await api('/api/bugs', {
      method: 'POST',
      body: JSON.stringify({ repoPath: cwd, title: query, severity: 'medium' }),
    });
    
    if (!createRes.success) {
      console.log(`\n  ❌ Bug not found and could not create: "${query}"`);
      console.log(`  ${createRes.error}\n`);
      return;
    }
    
    bug = createRes.data;
    createdBug = true;
  }

  if (bug.status === 'fixed') {
    console.log(`\n  ⚠ This bug is already fixed: ${bug.title}\n`);
    return;
  }

  // Convert to story if requested
  if (options.convert) {
    console.log(`\n  Converting to story...\n`);

    const addRes = await api('/api/spec/add', {
      method: 'POST',
      body: JSON.stringify({
        repoPath: cwd,
        title: `Fix: ${bug.title}`,
        description: bug.description || undefined,
        withWorkflow: true,
      }),
    });

    if (addRes.success) {
      await api('/api/bugs', {
        method: 'PATCH',
        body: JSON.stringify({ repoPath: cwd, bugQuery: bug.id, status: 'wont_fix' }),
      });

      console.log(`  ✓ Created story: ${addRes.data.itemId}`);
      console.log(`  ✓ Bug marked as converted`);
      console.log(`\n  Run '/chkd ${addRes.data.itemId}' to start building it.\n`);
    } else {
      console.log(`  ❌ ${addRes.error}\n`);
    }
    return;
  }

  // Show the bug details
  const sevIcon = bug.severity === 'critical' ? '🔴' :
                  bug.severity === 'high' ? '🟠' :
                  bug.severity === 'low' ? '🟢' : '🟡';

  if (createdBug) {
    console.log(`\n  ✓ Bug logged: ${bug.id?.slice(0, 6) || 'new'}`);
  }
  console.log(`\n  🐛 Bug: ${bug.title}`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Severity: ${sevIcon} ${bug.severity.toUpperCase()}`);
  if (bug.description) {
    console.log(`  Description: ${bug.description}`);
  }

  // Start debug session
  const sessionRes = await api('/api/session/adhoc', {
    method: 'POST',
    body: JSON.stringify({
      repoPath: cwd,
      type: 'debug',
      description: bug.title,
    }),
  });

  if (!sessionRes.success) {
    console.log(`\n  ❌ ${sessionRes.error}\n`);
    return;
  }

  // Mark bug as in_progress
  await api('/api/bugs', {
    method: 'PATCH',
    body: JSON.stringify({ repoPath: cwd, bugQuery: bug.id, status: 'in_progress' }),
  });

  console.log(`\n  🔧 Debug session started`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  ⚠️  ALIGN WITH USER FIRST:`);
  console.log(`     Explain your understanding of this bug.`);
  console.log(`     Get agreement on what the problem is before proceeding.`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Workflow:`);
  console.log(`  1. Align   → Agree with user on what bug means`);
  console.log(`  2. Research → Find root cause`);
  console.log(`  3. Propose → Suggest fix, get approval`);
  console.log(`  4. Fix     → Make minimal change`);
  console.log(`  5. Verify  → User confirms it's solved`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  💡 Use 'chkd pulse "status"' to stay connected`);
  console.log(`  💡 Run 'chkd fix' when ready → then 'chkd resolve' after user verifies`);

  await showQueueReminder();
  console.log('');
}

async function bug(description: string, flags: Record<string, string | boolean>) {
  if (!description) {
    console.log(`\n  Usage: chkd bug "description" [options]\n`);
    console.log(`  Options:`);
    console.log(`    --severity high|medium|low|big   Set severity (big = needs /bugfix)`);
    console.log(`    --ai                             Use AI to clean up description`);
    console.log(`\n  Examples:`);
    console.log(`    chkd bug "Save button not working"`);
    console.log(`    chkd bug "App randomly crashes" --severity big`);
    console.log(`    chkd bug "the thing is broken somewhere" --ai\n`);
    return;
  }

  const cwd = process.cwd();
  const severity = typeof flags.severity === 'string' ? flags.severity : undefined;
  const useAi = Boolean(flags.ai);

  let title = description;
  let bugDescription = '';
  let actualSeverity = severity || 'medium';
  let isSmall = true;

  // AI processing if requested
  if (useAi) {
    try {
      const { isAvailable, processBugReport } = await import('./llm.js');
      if (isAvailable()) {
        const spinner = createSpinner('Processing bug report...');
        const processed = await processBugReport(description, { severityHint: severity });
        spinner.stop('✓ Processed');

        title = processed.title;
        bugDescription = processed.description;
        actualSeverity = processed.severity;
        isSmall = processed.isSmall;

        console.log(`\n  📋 Cleaned up:`);
        console.log(`  Title: ${title}`);
        console.log(`  Severity: ${actualSeverity}`);
        if (bugDescription) console.log(`  Description: ${bugDescription}`);
      }
    } catch {
      console.log(`\n  ⚠ AI unavailable, using raw input`);
    }
  }

  // "big" severity triggers /bugfix workflow
  const isBig = actualSeverity === 'big';
  if (isBig) actualSeverity = 'high';

  const res = await api('/api/bugs', {
    method: 'POST',
    body: JSON.stringify({
      repoPath: cwd,
      title,
      description: bugDescription,
      severity: actualSeverity,
    }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  console.log(`\n  ✓ Bug logged: ${title}`);

  if (isBig || !isSmall) {
    console.log(`  🔍 Complex bug → run /bugfix for guided debugging`);
  } else {
    console.log(`  💡 Quick fix. Check solution with user before 'chkd fix'.`);
  }

  // Remind of current context (don't get distracted by the bug!)
  await showContext();
  console.log('');
}

async function also(description: string) {
  const cwd = process.cwd();

  // If no description, list current "also did" items
  if (!description) {
    const res = await api(`/api/session?repoPath=${encodeURIComponent(cwd)}`);
    if (!res.success) {
      console.log(`\n  ❌ ${res.error}\n`);
      return;
    }

    const data = res.data;
    const alsoDid = data?.alsoDid || [];

    if (!data?.currentTask) {
      console.log(`\n  No active session.`);
      console.log(`\n  Usage: chkd also "description"`);
      console.log(`  Logs off-plan work during a task.\n`);
      return;
    }

    console.log(`\n  📝 Also Did (${alsoDid.length} items)`);
    console.log(`  ${'─'.repeat(35)}`);
    if (alsoDid.length === 0) {
      console.log(`  (none yet)`);
    } else {
      for (const item of alsoDid) {
        console.log(`  • ${item}`);
      }
    }
    console.log(`\n  Add more: chkd also "description"\n`);
    return;
  }

  const res = await api('/api/session/also-did', {
    method: 'POST',
    body: JSON.stringify({
      repoPath: cwd,
      description,
    }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}`);
    if (res.error === 'No active task') {
      console.log(`  💡 Start a task first with: chkd start "task"\n`);
    } else {
      console.log('');
    }
    return;
  }

  console.log(`\n  ✓ Logged: "${description}"`);
  await showContext();
  console.log('');
}

async function setupHosts(domain?: string) {
  const hostname = domain || 'chkd.local';
  const port = 3848;
  const hostsEntry = `127.0.0.1   ${hostname}`;

  console.log(`\n  🌐 Setting up local domain: ${hostname}`);
  console.log(`  ─────────────────────────────────────────────────────────────`);

  // Check if already exists
  const { execSync } = await import('child_process');

  try {
    const hosts = execSync('cat /etc/hosts', { encoding: 'utf-8' });
    if (hosts.includes(hostname)) {
      console.log(`\n  ✓ ${hostname} already in /etc/hosts`);
      console.log(`\n  Access stable version at: http://${hostname}:${port}`);
      console.log(`\n  Make sure stable is running: npm run stable\n`);
      return;
    }
  } catch (e) {
    // Can't read hosts file
  }

  console.log(`\n  Adding to /etc/hosts: ${hostsEntry}`);
  console.log(`\n  This requires sudo access.\n`);

  try {
    execSync(`echo '${hostsEntry}' | sudo tee -a /etc/hosts`, { stdio: 'inherit' });
    console.log(`\n  ✓ Added ${hostname} to /etc/hosts`);
    console.log(`\n  Access stable version at: http://${hostname}:${port}`);
    console.log(`\n  Make sure stable is running: npm run stable\n`);
  } catch (e) {
    console.log(`\n  ❌ Failed to update /etc/hosts`);
    console.log(`\n  You can add it manually:`);
    console.log(`    sudo nano /etc/hosts`);
    console.log(`    Add: ${hostsEntry}\n`);
  }
}

async function add(title: string, flags: Record<string, string | boolean>) {
  if (!title) {
    console.log(`\n  Usage: chkd add "feature title" [options]`);
    console.log(`\n  Options:`);
    console.log(`    --story "text"     User story (As a... I want... so that...)`);
    console.log(`    --area SD|FE|BE    Target area (Site Design/Frontend/Backend)`);
    console.log(`    --type TYPE        Workflow type: remove|backend|refactor|audit|debug`);
    console.log(`    --tasks "a,b,c"    Explicit task list (comma-separated)`);
    console.log(`    --no-workflow      No sub-tasks at all`);
    console.log(`    --dry-run          Preview without creating`);
    console.log(`\n  Workflow Types:`);
    console.log(`    remove     Explore → Implement → Commit (for deletions)`);
    console.log(`    backend    Explore → Design → Implement → Polish → Commit (no UI)`);
    console.log(`    refactor   Explore → Implement → Polish → Commit`);
    console.log(`    audit      Explore → Feedback → Document → Commit (research only)`);
    console.log(`    debug      Explore → Verify → Implement → Commit (investigate + confirm fix)`);
    console.log(`\n  Examples:`);
    console.log(`    chkd add "Dark Mode Theme" --story "As a user, I want dark mode"`);
    console.log(`    chkd add "Delete terminal" --type remove --area FE`);
    console.log(`    chkd add "API endpoint" --type backend --area BE`);
    console.log(`    chkd add "Fix Bug" --no-workflow     # Single item, no tasks\n`);
    return;
  }

  const cwd = process.cwd();

  // Parse flags - direct pass-through, no AI processing
  const areaCode = typeof flags.area === 'string' ? flags.area.toUpperCase() : undefined;
  const story = typeof flags.story === 'string' ? flags.story :
                typeof flags.desc === 'string' ? flags.desc : undefined;
  const workflowType = typeof flags.type === 'string' ? flags.type.toLowerCase() : undefined;
  const dryRun = Boolean(flags['dry-run'] || flags.dryRun);
  const confirmLarge = Boolean(flags['confirm-large'] || flags.confirmLarge);

  // --no-workflow flag removed - workflow is ALWAYS used
  if (flags['no-workflow'] || flags.noWorkflow) {
    console.log(`\n  ⚠️  --no-workflow is no longer supported.`);
    console.log(`     chkd always uses the standard workflow with checkpoints.\n`);
  }

  // Validate workflow type
  const validTypes = ['remove', 'backend', 'refactor', 'audit', 'debug', 'frontend'];
  if (workflowType && !validTypes.includes(workflowType)) {
    console.log(`\n  ❌ Invalid workflow type: ${workflowType}`);
    console.log(`  💡 Valid types: ${validTypes.join(', ')}\n`);
    return;
  }

  // Build request body - workflow is ALWAYS used (no bypass allowed)
  const body: Record<string, unknown> = {
    repoPath: cwd,
    title,
    withWorkflow: true,  // Always - this is the core of chkd
    dryRun,
    confirmLarge,
  };

  if (areaCode) body.areaCode = areaCode;
  if (story) body.description = story;
  if (workflowType) body.workflowType = workflowType;
  // Note: custom tasks parameter removed - chkd always uses standard workflow

  // Warn if --story alone - will create TBC fields that block start
  if (story && !tasks) {
    console.log(`\n  ⚠️  Warning: --story alone creates TBC placeholders.`);
    console.log(`     This will block 'chkd start' until filled in.`);
    console.log(`     Use 'chkd edit' after creation to update TBC fields - discuss with user first.\n`);
  }

  const res = await api('/api/spec/add', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  // Handle dry-run response
  if (res.success && res.dryRun) {
    console.log(`\n  📋 DRY RUN - Would create:`);
    console.log(`  ─────────────────────────────────`);
    console.log(`  Title: ${res.data.wouldCreate.title}`);
    if (res.data.wouldCreate.areaCode) {
      console.log(`  Area: ${res.data.wouldCreate.areaName} (${res.data.wouldCreate.areaCode})`);
    } else if (res.data.wouldCreate.phase) {
      console.log(`  Phase: ${res.data.wouldCreate.phase}`);
    }
    console.log(`  Tasks: ${res.data.wouldCreate.taskCount}`);
    if (res.data.wouldCreate.tasks && res.data.wouldCreate.tasks.length > 0) {
      for (const task of res.data.wouldCreate.tasks) {
        console.log(`    - ${task}`);
      }
    }
    console.log(`\n  Run without --dry-run to create.\n`);
    return;
  }

  // Handle errors
  if (!res.success) {
    console.log(`\n  ❌ ${res.error}`);

    // Show existing item if duplicate
    if (res.existingItem) {
      console.log(`  ─────────────────────────────────`);
      console.log(`  Existing: ${res.existingItem.title}`);
      console.log(`  Status: ${res.existingItem.status}`);
      console.log(`  ID: ${res.existingItem.id}`);
    }

    // Show preview if confirmation needed
    if (res.preview) {
      console.log(`  ─────────────────────────────────`);
      console.log(`  Would add ${res.preview.taskCount} tasks:`);
      for (const task of res.preview.tasks.slice(0, 5)) {
        console.log(`    - ${task}`);
      }
      if (res.preview.tasks.length > 5) {
        console.log(`    ... and ${res.preview.tasks.length - 5} more`);
      }
      console.log(`\n  Use --confirm-large to proceed.\n`);
      return;
    }

    if (res.hint) {
      console.log(`  💡 ${res.hint}`);
    }
    console.log('');
    return;
  }

  // Success
  console.log(`\n  ✓ Added: ${res.data.title}`);
  if (res.data.areaCode) {
    console.log(`  Area: ${res.data.areaName} (${res.data.areaCode})`);
  } else if (res.data.phase) {
    console.log(`  Phase: ${res.data.phase}`);
  }
  console.log(`  ID: ${res.data.itemId}`);
  console.log(`  Tasks: ${res.data.taskCount}`);

  // Show warnings
  if (res.warnings && res.warnings.length > 0) {
    console.log(`\n  ⚠ Warnings:`);
    for (const warning of res.warnings) {
      console.log(`    ${warning}`);
    }
  }

  console.log(`\n  💡 If this is user-facing, consider updating docs/GUIDE.md`);
  console.log(`\n  Use 'chkd list' to see all items.\n`);
}

async function edit(itemId: string, flags: Record<string, string | boolean>) {
  if (!itemId) {
    console.log(`\n  Usage: chkd edit "SD.1" [options]`);
    console.log(`\n  Options:`);
    console.log(`    --story "text"         Update the story/description`);
    console.log(`    --title "text"         Update the title`);
    console.log(`    --requirements "a,b"   Set key requirements (comma-separated)`);
    console.log(`    --files "a,b"          Set files to change (comma-separated)`);
    console.log(`    --testing "a,b"        Set testing items (comma-separated)`);
    console.log(`\n  Examples:`);
    console.log(`    chkd edit "SD.1" --story "New description for this feature"`);
    console.log(`    chkd edit "FE.2" --title "Updated title"`);
    console.log(`    chkd edit "BE.1" --requirements "Must handle errors,Must validate input"`);
    console.log(`    chkd edit "BE.1" --files "src/api.ts,src/types.ts" --testing "API returns 200,Errors return 4xx"\n`);
    return;
  }

  const cwd = process.cwd();

  const newTitle = typeof flags.title === 'string' ? flags.title : undefined;
  const newStory = typeof flags.story === 'string' ? flags.story :
                   typeof flags.desc === 'string' ? flags.desc : undefined;

  // Parse comma-separated arrays
  const parseArray = (flag: string | boolean | undefined): string[] | undefined => {
    if (typeof flag !== 'string') return undefined;
    return flag.split(',').map(s => s.trim()).filter(s => s.length > 0);
  };

  const keyRequirements = parseArray(flags.requirements || flags.reqs);
  const filesToChange = parseArray(flags.files);
  const testing = parseArray(flags.testing || flags.tests);

  if (!newTitle && !newStory && !keyRequirements && !filesToChange && !testing) {
    console.log(`\n  ❌ Provide at least one option to update`);
    console.log(`\n  Examples:`);
    console.log(`    chkd edit "${itemId}" --story "New description"`);
    console.log(`    chkd edit "${itemId}" --title "New title"`);
    console.log(`    chkd edit "${itemId}" --requirements "Must do X,Must handle Y"\n`);
    return;
  }

  const res = await api('/api/spec/edit', {
    method: 'POST',
    body: JSON.stringify({
      repoPath: cwd,
      itemId,
      title: newTitle,
      description: newStory,
      keyRequirements,
      filesToChange,
      testing,
    }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  console.log(`\n  ✓ Updated: ${itemId}`);
  if (newTitle) console.log(`    Title: ${newTitle}`);
  if (newStory) console.log(`    Story: ${newStory}`);
  if (keyRequirements) console.log(`    Requirements: ${keyRequirements.length} items`);
  if (filesToChange) console.log(`    Files: ${filesToChange.length} files`);
  if (testing) console.log(`    Testing: ${testing.length} items`);
  console.log('');
}

async function create(rawInput: string, flags: Record<string, string | boolean>) {
  if (!rawInput) {
    console.log(`\n  Usage: chkd create "describe what you want"`);
    console.log(`\n  AI-powered story creation. Transforms raw input into clean spec items.`);
    console.log(`\n  Options:`);
    console.log(`    --area SD|FE|BE    Hint for target area`);
    console.log(`    --dry-run          Preview without creating`);
    console.log(`\n  Examples:`);
    console.log(`    chkd create "can we add dark mode toggle somewhere"`);
    console.log(`    chkd create "the login is broken on mobile" --area FE`);
    console.log(`    chkd create "I want cards across the top for switching repos"\n`);
    return;
  }

  const cwd = process.cwd();
  const areaHint = typeof flags.area === 'string' ? flags.area.toUpperCase() : undefined;
  const dryRun = Boolean(flags['dry-run'] || flags.dryRun);

  // Process with AI
  let processed: {
    title: string;
    story: string;
    area: string;
    tasks: string[];
  };

  try {
    const { isAvailable, processFeatureRequest } = await import('./llm.js');
    if (!isAvailable()) {
      console.log(`\n  ❌ No API key configured`);
      console.log(`  Set CHKD_API_KEY or ANTHROPIC_API_KEY environment variable.\n`);
      return;
    }

    const spinner = createSpinner('Processing request...');
    processed = await processFeatureRequest(rawInput, { areaCode: areaHint });
    spinner.stop('✓ Processed');
  } catch (err) {
    console.log(`\n  ❌ AI processing failed: ${err}\n`);
    return;
  }

  // Show what was generated
  console.log(`\n  📋 Generated Story:`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Title: ${processed.title}`);
  console.log(`  Area: ${processed.area}`);
  if (processed.story) {
    console.log(`  Story: ${processed.story}`);
  }
  if (processed.tasks.length > 0) {
    console.log(`  Tasks:`);
    for (const task of processed.tasks) {
      console.log(`    - ${task}`);
    }
  }

  if (dryRun) {
    console.log(`\n  (dry-run mode - not created)\n`);
    return;
  }

  // Confirm before creating
  const rl = await import('readline');
  const readline = rl.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    readline.question('\n  Create this story? (y/n): ', resolve);
  });
  readline.close();

  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log(`\n  Cancelled.\n`);
    return;
  }

  // Create via API
  const body: Record<string, unknown> = {
    repoPath: cwd,
    title: processed.title,
    description: processed.story,
    areaCode: processed.area,
    withWorkflow: true,
  };
  if (processed.tasks.length > 0) {
    body.tasks = processed.tasks;
  }

  const res = await api('/api/spec/add', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}`);
    if (res.hint) console.log(`  💡 ${res.hint}`);
    console.log('');
    return;
  }

  console.log(`\n  ✓ Created: ${res.data.itemId}`);
  console.log(`  Title: ${res.data.title}`);
  console.log(`  Tasks: ${res.data.taskCount}\n`);
}

async function bugs(filter?: string) {
  const cwd = process.cwd();
  const res = await api(`/api/bugs?repoPath=${encodeURIComponent(cwd)}`);

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  let bugList = res.data || [];

  // Filter by status
  if (filter !== 'all') {
    bugList = bugList.filter((b: any) => b.status === 'open' || b.status === 'in_progress');
  }

  // Filter by severity
  if (filter === 'high') {
    bugList = bugList.filter((b: any) => b.severity === 'high' || b.severity === 'critical');
  }

  if (bugList.length === 0) {
    console.log(`\n  ✓ No ${filter === 'all' ? '' : 'open '}bugs\n`);
    console.log(`  Use: chkd bug "description" to add one\n`);
    return;
  }

  const header = filter === 'all' ? 'All Bugs' : 'Open Bugs';
  console.log(`\n  🐛 ${header} (${bugList.length})`);
  console.log(`  ─────────────────`);

  for (const b of bugList) {
    const sev = b.severity === 'critical' ? 'CRIT' :
                b.severity === 'high' ? 'HIGH' :
                b.severity === 'low' ? 'LOW' : 'MED';
    const statusIcon = b.status === 'in_progress' ? ' 🔨' :
                       b.status === 'fixed' ? ' ✅' :
                       b.status === 'wont_fix' ? ' ⏭️' : '';
    const shortId = typeof b.id === 'string' ? b.id.slice(0, 6) : b.id;
    console.log(`  ${shortId} [${sev}] ${b.title}${statusIcon}`);
  }

  console.log(`\n  Use: chkd bug "description" to add more\n`);
}

// ============================================
// Quick Wins
// ============================================

async function win(title: string) {
  if (!title) {
    console.log(`\n  Usage: chkd win "quick improvement title"`);
    console.log(`\n  Examples:`);
    console.log(`    chkd win "Add loading spinner to save button"`);
    console.log(`    chkd win "Fix typo in footer"`);
    console.log(`\n  Creates a task with quickwin workflow (5 steps).\n`);
    return;
  }

  const cwd = process.cwd();
  
  // Create task with quickwin workflow
  const res = await api('/api/spec/add', {
    method: 'POST',
    body: JSON.stringify({
      repoPath: cwd,
      title,
      areaCode: 'FUT',
      workflowType: 'quickwin',
      keyRequirements: ['Quick fix - should take <30 min'],
      filesToChange: ['TBD during scope'],
      testing: ['Manual verification']
    }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  console.log(`\n  ⚡ Quick win created: ${res.data.sectionId} ${title}`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  📋 5-step workflow: Scope → Align → Fix → Verify → Commit`);
  console.log(`  💡 Start it with: chkd start ${res.data.sectionId}\n`);
}

async function wins() {
  const cwd = process.cwd();
  
  // Get all items and filter by FUT area (where quickwins live)
  const res = await api(`/api/spec/items?repoPath=${encodeURIComponent(cwd)}`);

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  // Filter to FUT items (quickwins) - only top-level items, not workflow children
  const allItems = res.data || [];
  const winList = allItems.filter((w: any) => w.areaCode === 'FUT' && !w.parentId);
  const openWins = winList.filter((w: any) => w.status === 'open' || w.status === 'in-progress');
  const doneWins = winList.filter((w: any) => w.status === 'done');

  if (winList.length === 0) {
    console.log(`\n  ✓ No quick wins yet\n`);
    console.log(`  Use: chkd win "small improvement" to add one\n`);
    return;
  }

  console.log(`\n  ⚡ Quick Wins (${openWins.length} open, ${doneWins.length} done)`);
  console.log(`  ─────────────────`);

  for (const w of openWins) {
    const status = w.status === 'in-progress' ? '◐' : '○';
    console.log(`  ${status} ${w.displayId} ${w.title.replace(/^FUT\.\d+\s*/, '')}`);
  }
  for (const w of doneWins) {
    console.log(`  ✓ ${w.displayId} ${w.title.replace(/^FUT\.\d+\s*/, '')}`);
  }

  console.log(`\n  Use: chkd win "title" to add, chkd start FUT.X to work on one\n`);
}

async function won(query: string) {
  if (!query) {
    console.log(`\n  Usage: chkd won "query"`);
    console.log(`\n  Mark a quick win as complete by ID (e.g., FUT.1).`);
    console.log(`\n  Examples:`);
    console.log(`    chkd won FUT.1`);
    console.log(`    chkd won "loading spinner"     # By partial title\n`);
    return;
  }

  const cwd = process.cwd();
  
  // Find the item
  const findRes = await api(`/api/spec/item?repoPath=${encodeURIComponent(cwd)}&query=${encodeURIComponent(query)}`);
  
  if (!findRes.success || !findRes.data) {
    console.log(`\n  ❌ Quick win not found: "${query}"`);
    console.log(`\n  Run 'chkd wins' to see available quick wins.\n`);
    return;
  }

  const item = findRes.data;
  
  // Mark as done
  const res = await api('/api/spec/update', {
    method: 'POST',
    body: JSON.stringify({
      repoPath: cwd,
      itemId: item.id,
      status: 'done'
    }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  console.log(`\n  ✓ Done: ${item.displayId} ${item.title.replace(/^FUT\.\d+\s*/, '')}\n`);
}

// Helper for confirmation prompts
async function confirm(question: string): Promise<string> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

async function quickwin(query: string) {
  // quickwin is now just an alias for start - quickwins are regular tasks
  if (!query) {
    console.log(`\n  Usage: chkd quickwin FUT.1`);
    console.log(`\n  Start working on a quick win (alias for 'chkd start').`);
    console.log(`\n  Quick wins are now regular tasks with a 5-step workflow.`);
    console.log(`  Use 'chkd wins' to see them, 'chkd start FUT.X' to begin.\n`);
    return;
  }

  // Delegate to start
  await start(query);
}

async function status() {
  const cwd = process.cwd();
  const [res, queueRes] = await Promise.all([
    api(`/api/status?repoPath=${encodeURIComponent(cwd)}`),
    api(`/api/session/queue?repoPath=${encodeURIComponent(cwd)}`)
  ]);

  if (!res.success) {
    console.log(`❌ ${res.error}`);
    return;
  }

  const data = res.data;

  if (!data.registered) {
    console.log(`\n  ${data.message}\n`);
    return;
  }

  // Show repo name with state indicator
  const stateLabel = data.session.mode === 'debugging' ? ' [DEBUG]' :
                     data.session.mode === 'impromptu' ? ' [IMPROMPTU]' :
                     data.session.mode === 'quickwin' ? ' [QUICKWIN]' :
                     data.session.status === 'building' ? ' [BUILDING]' : '';
  console.log(`\n  📁 ${data.repo.name}${stateLabel}`);
  console.log(`  ─────────────────────────`);

  if (data.spec) {
    const bar = '█'.repeat(Math.floor(data.spec.progress / 5)) + '░'.repeat(20 - Math.floor(data.spec.progress / 5));
    console.log(`  Progress: [${bar}] ${data.spec.progress}% (${data.spec.completedItems}/${data.spec.totalItems})`);
  }

  if (data.session.currentTask) {
    const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max - 3) + '...' : s;
    console.log(`\n  🔨 ${truncate(data.session.currentTask.title, 50)}`);
    console.log(`     Iteration ${data.session.iteration} • ${formatTime(data.session.elapsedMs)}`);
  }

  // Show queue items if any
  if (queueRes.success && queueRes.data?.items?.length > 0) {
    console.log(`\n  📬 Queue (${queueRes.data.items.length}):`);
    for (const item of queueRes.data.items) {
      const title = item.title.length > 50 ? item.title.slice(0, 47) + '...' : item.title;
      console.log(`     • ${title}`);
    }
  }

  console.log(`\n  ${data.summary}\n`);
}

async function list() {
  const cwd = process.cwd();
  const [specRes, bugsRes] = await Promise.all([
    api(`/api/spec/full?repoPath=${encodeURIComponent(cwd)}`),
    api(`/api/bugs?repoPath=${encodeURIComponent(cwd)}`)
  ]);

  if (!specRes.success) {
    console.log(`\n  ❌ ${specRes.error}\n`);
    return;
  }

  const spec = specRes.data;
  if (!spec || !spec.areas) {
    console.log(`\n  No tasks found. Add tasks with 'chkd add' or run 'chkd migrate' if you have a SPEC.md.\n`);
    return;
  }

  console.log(`\n  📋 ${spec.title || 'Spec'}`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  Progress: ${spec.completedItems}/${spec.totalItems} (${spec.progress}%)\n`);

  for (const area of spec.areas) {
    // Count items in this area
    const areaItems = area.items.length;
    const areaDone = area.items.filter((i: any) => i.status === 'done').length;

    if (areaItems === 0) continue; // Skip empty areas

    console.log(`  ${area.name} (${areaDone}/${areaItems})`);

    for (const item of area.items) {
      const icon = item.status === 'done' ? '✓' : item.status === 'in-progress' ? '◐' : item.status === 'skipped' ? '–' : '○';
      // Extract the short ID like "SD.1" from title
      const match = item.title.match(/^([A-Z]+\.\d+)\s+(.+)$/);
      const shortId = match ? match[1] : area.code + '.' + (area.items.indexOf(item) + 1);
      // Get clean title (after the ID)
      let title = match ? match[2] : item.title;
      if (title.length > 50) title = title.slice(0, 47) + '...';
      console.log(`    ${icon} ${shortId.padEnd(6)} ${title}`);
    }
    console.log('');
  }

  // Show bugs if any
  if (bugsRes.success && bugsRes.data && bugsRes.data.length > 0) {
    const bugs = bugsRes.data;
    const openBugs = bugs.filter((b: any) => b.status === 'open' || b.status === 'in_progress');
    const fixedBugs = bugs.filter((b: any) => b.status === 'fixed' || b.status === 'wont_fix');

    console.log(`  🐛 Bugs (${openBugs.length} open, ${fixedBugs.length} fixed)`);

    for (const bug of bugs) {
      const severity = bug.severity === 'critical' ? '🔴' : bug.severity === 'high' ? '🟠' : bug.severity === 'medium' ? '🟡' : '🟢';
      const status = bug.status === 'fixed' ? '✓' : bug.status === 'in_progress' ? '◐' : bug.status === 'wont_fix' ? '–' : '○';
      let title = bug.title;
      if (title.length > 45) title = title.slice(0, 42) + '...';
      const id = bug.id.slice(0, 6);
      console.log(`    ${status} ${severity} ${id}  ${title}`);
    }
    console.log('');
  }
}

function version() {
  // Read version from package.json
  const packagePath = resolve(__dirname, '..', '..', 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
    console.log(`\n  chkd v${pkg.version}`);
    console.log(`  Development quality control - spec-driven workflow\n`);
  } catch {
    console.log(`\n  chkd (version unknown)`);
    console.log(`  Could not read package.json\n`);
  }
}

function workflow() {
  console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │                    chkd Development Workflow                │
  └─────────────────────────────────────────────────────────────┘

  Every feature follows this flow:

  1. EXPLORE
     └─ Understand the problem
     └─ Search existing functions (avoid duplicates)
     └─ Validate checklist items before starting

  2. DESIGN
     └─ Create flow diagrams when helpful
     └─ Before/after state diagrams
     └─ Not every feature needs one

  3. PROTOTYPE
     └─ Build backend endpoints with test data first
     └─ Frontend calls real endpoints (not mock data)
     └─ Forces you to see existing patterns

  4. FEEDBACK
     └─ Review the working prototype
     └─ Catch design issues early
     └─ Refactor before scope grows

  5. IMPLEMENT
     └─ Replace test data with real logic
     └─ Frontend doesn't need to change

  6. POLISH
     └─ Iterate based on actual usage
     └─ Add loading states, error handling
     └─ Professional finishing touches

  ─────────────────────────────────────────────────────────────

  Daily flow:

    $ chkd status           # Where did I leave off?
    > /chkd 3.2             # In Claude Code - build task 3.2
    > /commit               # When done, commit safely

  Off-plan work?
    └─ Claude logs it as "Also did"
    └─ Not blocked, just tracked
    └─ Shows up in the UI

  See also: chkd help
`);
}

function help(command?: string) {
  if (command) {
    showCommandHelp(command);
    return;
  }

  console.log(`
  chkd - Development quality control

  SETUP

    init [name]         Initialize chkd in a new project
    upgrade [name]      Add chkd to existing project (backs up files)
    hosts [domain]      Set up local domain (default: chkd.local)

  STATUS

    status              Show current progress and task
    list                List all spec items by area
    workflow            Show the development workflow
    version             Show chkd version
    help [command]      Show detailed help for a command

  BUGS

    bug "desc"          Quick-create a bug
    bugs                List open bugs
    bugfix "bug"        Start working on a bug (aligns with user first)
    fix "bug"           Signal fix ready (prompts for user verification)
    resolve "bug"       Close bug after user verified

  WORKFLOW

    start "task"        Start working on a task (e.g., "SD.1")
    working "item"      Signal you're working on a sub-item
    tick "item"         Mark an item complete
    iterate             Increment iteration, get context reminder
    done                Complete current task, return to idle
    pause "note"        Pause task, return to queue with handover note
    sync [idle]         Check/fix app state (use 'idle' to reset)
    progress            Show current task's sub-items

  ADHOC WORK (keeps UI engaged)

    impromptu "desc"    Start ad-hoc work not in spec
    debug "desc"        Start debug/investigation session

  TASKS

    add "title"         Add feature (explicit control - pass title/tasks/story)
    create "request"    Create feature (AI processes raw input)
    migrate             Import SPEC.md to database (one-time migration)

  BUILDING (use in Claude Code)

    /chkd SD.1          Build task SD.1 from the spec
    /story              Refine specs, plan features
    /bugfix             Fix bugs with minimal changes
    /commit             Safe commit workflow

  EXAMPLES

    chkd status         # See what's happening
    chkd bug "Broken"   # Quick-add a bug
    chkd also "Fixed X" # Log off-plan work
    chkd bugs           # See open bugs
    chkd init           # Set up new project
    chkd migrate        # Import SPEC.md to DB

  GETTING STARTED

    1. cd into your project
    2. Run: chkd status
    3. If not registered, run the setup steps shown
    4. Use /chkd <task_id> in Claude Code to build

  Learn more: chkd workflow
`);
}

function showCommandHelp(command: string) {
  const helps: Record<string, string> = {
    status: `
  chkd status
  ─────────────────────────────────────────────────────────────

  Show what's happening in your project.

  OUTPUT:
    - Project name
    - Overall progress (X/Y items, percentage bar)
    - Current task being worked on
    - Session iteration and duration
    - Debug mode indicator (if active)

  WHEN TO USE:
    - Start of day: "Where did I leave off?"
    - After a break: "What was I working on?"
    - Before committing: "What's the current state?"

  EXAMPLES:
    chkd status              # Show current state

  OUTPUT EXAMPLE:
    📁 my-project
    ─────────────────────────
    Progress: [████████░░░░] 65%
    Items: 13/20 complete

    🔨 Current task:
       SD.3 User Authentication
       Iteration 2 • 45m

  TIP: Run this often. It's your "where am I?" command.
`,
    list: `
  chkd list
  ─────────────────────────────────────────────────────────────

  List all spec items organized by area.

  OUTPUT:
    - Project title and overall progress
    - All areas with item counts
    - Each item with status icon and ID

  STATUS ICONS:
    ○  Not started
    ◐  In progress
    ✓  Complete
    –  Skipped

  WHEN TO USE:
    - See all tasks at a glance
    - Find a task ID to work on
    - Review what's left to do

  EXAMPLES:
    chkd list              # Show all items by area

  OUTPUT EXAMPLE:
    📋 My Project
    ─────────────────────────────────────────
    Progress: 13/20 (65%)

    Site Design (3/5)
      ✓ SD.1 Landing page
      ✓ SD.2 Navigation
      ◐ SD.3 Dashboard
      ○ SD.4 Settings
      – SD.5 Admin panel

    Backend (10/15)
      ...

  TIP: Use task IDs shown here with /chkd command.
`,
    version: `
  chkd version
  ─────────────────────────────────────────────────────────────

  Show the installed version of chkd.

  ALIASES:
    chkd version
    chkd --version
    chkd -v

  OUTPUT:
    - Version number from package.json
    - Brief description

  EXAMPLES:
    chkd version           # Show version
    chkd -v                # Short form

  TIP: Useful for troubleshooting or checking for updates.
`,
    bug: `
  chkd bug "description" [--severity high|medium|low|critical]
  ─────────────────────────────────────────────────────────────

  Quick-create a bug with minimal friction.

  OPTIONS:
    --severity <level>   Set severity (default: medium)
                         Levels: critical, high, medium, low

  WHEN TO USE:
    - You notice something broken while working
    - User reports an issue
    - Test fails unexpectedly
    - You want to track something for later

  EXAMPLES:
    chkd bug "Save button broken"
    chkd bug "Login fails on mobile" --severity high
    chkd bug "Typo in footer" --severity low
    chkd bug "App crashes on startup" --severity critical

  NEXT STEPS:
    - Run 'chkd bugs' to see all bugs
    - Use '/bugfix' in Claude Code to fix a bug systematically

  TIP: Keep descriptions short but specific.
`,
    bugs: `
  chkd bugs [--high|--all]
  ─────────────────────────────────────────────────────────────

  List bugs at a glance.

  OPTIONS:
    (none)     Show open bugs only (default)
    --high     Show only high/critical severity
    --all      Include fixed bugs too

  WHEN TO USE:
    - Planning what to fix next
    - Checking if a bug was already logged
    - Reviewing bug backlog

  EXAMPLES:
    chkd bugs              # Open bugs
    chkd bugs --high       # High priority only
    chkd bugs --all        # All bugs including fixed

  OUTPUT EXAMPLE:
    🐛 Open Bugs (3)
    ─────────────────
    a1b2c3 [HIGH] Login fails on mobile
    d4e5f6 [MED]  Save button broken
    g7h8i9 [LOW]  Typo in footer

  NEXT STEPS:
    - Use '/bugfix' in Claude Code to fix a bug
    - Run 'chkd bug "desc"' to add more bugs
`,
    bugfix: `
  chkd bugfix "bug" [--convert]
  ─────────────────────────────────────────────────────────────

  Start working on a bug with alignment step.

  ARGUMENTS:
    "bug"       Bug title or ID (first 6 chars of UUID)

  OPTIONS:
    --convert   Convert to a proper story/task instead of fixing directly

  WHAT IT DOES:
    1. Shows bug details
    2. Starts a debug session
    3. Prompts to ALIGN with user on what the bug means
    4. Gives workflow steps

  THE WORKFLOW:
    1. Align   → Explain your understanding, get user agreement
    2. Research → Find root cause
    3. Propose → Suggest fix, get approval
    4. Fix     → Make minimal change
    5. Verify  → User confirms it's solved

  EXAMPLES:
    chkd bugfix "Save button"         # Start bugfix
    chkd bugfix "a1b2c3"              # By ID
    chkd bugfix "big issue" --convert # Convert to story instead

  NEXT STEPS:
    - Use 'chkd pulse "status"' to stay connected while working
    - Run 'chkd fix' when fix is ready
    - Run 'chkd resolve' after user verifies
`,
    fix: `
  chkd fix "bug"
  ─────────────────────────────────────────────────────────────

  Signal that a fix is ready for user verification.

  IMPORTANT: This does NOT close the bug. It prompts you to
  verify with the user that the fix works, then use 'resolve'.

  ARGUMENTS:
    "bug"    Bug title or ID (first 6 chars of UUID)

  WHAT IT DOES:
    - Shows the bug being fixed
    - Prompts: "Verify with user that fix solves the problem"
    - Tells you to run 'chkd resolve' after verification

  WHEN TO USE:
    - After implementing the fix
    - Before marking the bug as closed
    - When ready for user to test/verify

  EXAMPLES:
    chkd fix "Save button"      # Signal fix ready
    chkd fix "a1b2c3"           # By ID prefix

  NEXT STEP:
    After user confirms the fix works:
    → chkd resolve "bug"
`,
    resolve: `
  chkd resolve "bug"
  ─────────────────────────────────────────────────────────────

  Close a bug after user has verified the fix works.

  ARGUMENTS:
    "bug"    Bug title or ID (first 6 chars of UUID)

  WHAT IT DOES:
    - Marks bug as 'fixed' in the database
    - Ends the debug session
    - Sets resolved_at timestamp

  WHEN TO USE:
    - ONLY after user has verified the fix works
    - After running 'chkd fix' and getting user confirmation

  EXAMPLES:
    chkd resolve "Save button"      # Close after verified
    chkd resolve "a1b2c3"           # By ID prefix

  THE FULL FLOW:
    1. chkd bugfix "bug"    → Start (align with user)
    2. ... work on fix ...
    3. chkd fix "bug"       → Signal ready (get verification)
    4. ... user verifies ...
    5. chkd resolve "bug"   → Close (confirmed fixed)
`,
    also: `
  chkd also [description]
  ─────────────────────────────────────────────────────────────

  Log off-plan work during a task, or list current items.

  USAGE:
    chkd also                  List current "also did" items
    chkd also "description"    Add a new item

  WHAT IT DOES:
    - Adds to the "Also did" list for the current task
    - Shows in the UI alongside the main task
    - Keeps a record of unplanned but valuable work

  WHEN TO USE:
    - Fixed a bug while working on something else
    - Updated related code that wasn't in the spec
    - Made an improvement you noticed was needed

  EXAMPLES:
    chkd also                             # List items
    chkd also "Fixed typo in README"      # Add item
    chkd also "Updated error handling"    # Add item

  NOTE: Requires an active task session.
`,
    init: `
  chkd init [name]
  ─────────────────────────────────────────────────────────────

  Initialize chkd in a NEW project.

  ARGUMENTS:
    [name]    Project name (default: folder name)

  REQUIRES:
    - Must be a git repository (run 'git init' first)

  CREATES:
    docs/GUIDE.md         How to use chkd
    CLAUDE.md             Instructions for Claude
    .claude/skills/       Build skills (/chkd, /bugfix, etc.)

  WHEN TO USE:
    - Starting a brand new project
    - Project has no existing chkd files

  EXAMPLES:
    chkd init                # Use folder name
    chkd init "My App"       # Custom project name

  NEXT STEPS:
    1. Add tasks with 'chkd add "Feature name"'
    2. Start the chkd server: npm run dev (in chkd folder)
    3. Use /chkd <task_id> in Claude Code to build
`,
    upgrade: `
  chkd upgrade [name]
  ─────────────────────────────────────────────────────────────

  Add chkd to an EXISTING project (or update to latest).

  ARGUMENTS:
    [name]    Project name (default: folder name)

  WHAT IT DOES:
    1. Backs up existing files to *-old (first run only)
    2. Creates fresh chkd templates
    3. Merges CLAUDE.md intelligently (if substantial)
    4. Updates skills to latest versions
    5. Preserves custom skills you created

  WHEN TO USE:
    - Adding chkd to existing project
    - Updating skills to latest version
    - Refreshing templates after chkd update

  EXAMPLES:
    chkd upgrade             # Use folder name
    chkd upgrade "My App"    # Custom project name

  SAFE TO RE-RUN:
    - Only backs up on first run
    - Won't overwrite your *-old backups
    - Custom skills are preserved

  NEXT STEPS:
    1. Review any *-old backup files
    2. Run 'chkd migrate' if you have a docs/SPEC.md
    3. Run 'chkd status' to verify
`,
    workflow: `
  chkd workflow
  ─────────────────────────────────────────────────────────────

  Shows the complete development workflow.

  THE 6-PHASE WORKFLOW:
    1. EXPLORE   - Understand the problem, search existing code
    2. DESIGN    - Flow diagrams, before/after states
    3. PROTOTYPE - Build with test data first
    4. FEEDBACK  - Review working prototype
    5. IMPLEMENT - Replace test data with real logic
    6. POLISH    - Loading states, error handling, finishing

  WHY THIS WORKFLOW:
    - Catches issues early (cheaper to fix)
    - Forces understanding before coding
    - Prevents over-engineering
    - Gives natural review points

  DAILY FLOW:
    $ chkd status           # Where did I leave off?
    > /chkd SD.1            # Build task SD.1
    > /commit               # When done, commit safely

  OFF-PLAN WORK:
    - Claude logs it as "Also did"
    - Not blocked, just tracked
    - Shows up in the UI

  TIP: Not every task needs all 6 phases. Small tasks
       can skip DESIGN and go straight to PROTOTYPE.
`,
    tick: `
  chkd tick ["item"]
  ─────────────────────────────────────────────────────────────

  Mark an item as complete.

  ARGUMENTS:
    [item]    Item title, ID, or task number (e.g., "SD.1", "Login page")
              If omitted, ticks the current task

  WHEN TO USE:
    - After completing a sub-item
    - After completing a whole task
    - To mark something done from terminal

  EXAMPLES:
    chkd tick                    # Tick current task
    chkd tick "SD.1"             # Tick by task number
    chkd tick "Login page"       # Tick by title

  THE WORKFLOW:
    1. chkd working "item"   ← Signal start
    2. Build it
    3. chkd tick "item"      ← Mark done

  TIP: Tick as you go! Don't batch them at the end.
`,
    sync: `
  chkd sync [idle]
  ─────────────────────────────────────────────────────────────

  Check or fix the app's session state.

  ARGUMENTS:
    (none)    Just report current state
    idle      Reset session to idle (clears active task)

  WHAT IT DOES:
    - Reports what the app thinks is happening
    - Shows active task, iteration, duration
    - Can reset to idle if state is wrong

  WHEN TO USE:
    - App shows "building" but Claude isn't running
    - Session got stuck after a crash
    - Want to verify app and terminal are in sync
    - Need to manually reset state

  EXAMPLES:
    chkd sync              # Check current state
    chkd sync idle         # Reset to idle

  OUTPUT EXAMPLE:
    🔄 Sync Status
    ─────────────────────────────────
    Active task: SD.11 Repo Cards
    Iteration: 2
    Duration: 45m

    If this is wrong, run: chkd sync idle

  TIP: If the app shows a task but Claude isn't working on it,
       run 'chkd sync idle' to reset.
`,
    pause: `
  chkd pause ["handover note"]
  ─────────────────────────────────────────────────────────────

  Pause the current task and return it to the queue.

  ARGUMENTS:
    "note"    Optional handover note for the next person

  WHAT IT DOES:
    - Returns current task to queue (NOT marked complete)
    - Saves handover note (shown when task is started again)
    - Clears active session - UI shows idle
    - Task stays incomplete in database

  WHEN TO USE:
    - Need to switch to something else mid-task
    - Handing off to another person/session
    - End of day, want to leave notes for tomorrow
    - Blocked on something, parking the task

  EXAMPLES:
    chkd pause
    chkd pause "Stuck on auth, need API key"
    chkd pause "Tests passing, needs code review"

  HANDOVER FLOW:
    Session 1:
      chkd start "SD.1"
      # ... work on it ...
      chkd pause "Fixed login, still need signup"

    Session 2:
      chkd start "SD.1"
      # Shows: 📝 Handover note: "Fixed login, still need signup"

  TIP: The handover note is shown once when the task is restarted, then cleared.
`,
    done: `
  chkd done [--force]
  ─────────────────────────────────────────────────────────────

  Complete the current task and return to idle.

  OPTIONS:
    --force    Complete even if sub-items are incomplete

  WHAT IT DOES:
    - Checks all sub-items are complete (blocks if not)
    - Marks current task as complete
    - Clears the active session
    - Shows the next available task (if any)
    - UI updates to show idle state

  WHEN TO USE:
    - Finished building a task
    - Ready to move on to the next thing
    - Want to signal "I'm done" to the UI

  EXAMPLES:
    chkd done              # Complete (fails if sub-items open)
    chkd done --force      # Complete anyway

  THE WORKFLOW:
    1. chkd start "SD.1"     ← Start task
    2. Build it
    3. chkd tick "sub-item"  ← Mark sub-items done
    4. chkd done             ← Complete task, go idle (YOU ARE HERE)

  TIP: The UI will update to show you're idle and suggest the next task.
`,
    start: `
  chkd start "task"
  ─────────────────────────────────────────────────────────────

  Start working on a task.

  ARGUMENTS:
    "task"    Task ID (e.g., "SD.1") or task title

  WHAT IT DOES:
    - Switches session to work on this task
    - Starts a new iteration
    - Shows the task in 'chkd status'

  WHEN TO USE:
    - Starting work on a new task
    - Switching between tasks
    - Resuming a specific task

  EXAMPLES:
    chkd start "SD.1"
    chkd start "Login page"
    chkd start "User Authentication"

  THE WORKFLOW:
    1. chkd start "SD.1"     ← Switch to task (YOU ARE HERE)
    2. chkd progress         ← See sub-items
    3. chkd working "item"   ← Start a sub-item
    4. Build it
    5. chkd tick "item"      ← Mark done
`,
    working: `
  chkd working "item"
  ─────────────────────────────────────────────────────────────

  Signal that you're working on a sub-item.

  ARGUMENTS:
    "item"    Item title or ID (required)

  WHAT IT DOES:
    - Updates session to show current item
    - Marks item as in-progress
    - Shows in chkd status output

  WHEN TO USE:
    - Starting work on a sub-item
    - Switching between sub-items
    - Resuming work after a break

  EXAMPLES:
    chkd working "Login form validation"
    chkd working "SD.1.2"

  THE WORKFLOW:
    1. chkd start "SD.1"     ← Switch to task first
    2. chkd working "item"   ← Signal sub-item start (YOU ARE HERE)
    3. Build it
    4. chkd tick "item"      ← Mark done
`,
    progress: `
  chkd progress
  ─────────────────────────────────────────────────────────────

  Show current task's sub-items and their status.

  OUTPUT:
    - Current task name
    - List of sub-items with status
    - Completion count (X/Y)

  STATUS ICONS:
    ⬚  Not started ([ ])
    🔨 In progress ([~])
    ✅ Complete ([x])

  WHEN TO USE:
    - Check what's left on current task
    - See which sub-items are done
    - Plan next sub-item to work on

  EXAMPLE OUTPUT:
    🔨 Current Task: SD.3 User Authentication
    ─────────────────────────────────────
    Progress: 2/4 sub-items

    ✅ Login form validation
    ✅ Password reset flow
    🔨 Remember me functionality
    ⬚  Session timeout handling
`,
    iterate: `
  chkd iterate
  ─────────────────────────────────────────────────────────────

  Increment iteration counter and get a context reminder.

  ALIASES:
    chkd cycle           Same thing

  WHAT IT DOES:
    - Increments iteration count for current session
    - Shows current phase and working item
    - Provides phase-specific guidance
    - Reminds you to stay focused

  WHEN TO USE:
    - After completing a piece of work
    - During extended back-and-forth (especially Feedback phase)
    - Whenever you want a context anchor

  WHY IT MATTERS:
    During long feedback discussions, it's easy to lose focus.
    Running 'chkd iterate' keeps you anchored to the process.

  EXAMPLE OUTPUT:
    🔄 Iteration #3 on SD.1
       Phase: Feedback
       Working on: User reviews login UX
    ─────────────────────────────────
    💡 Get explicit approval. One approval ≠ blanket approval.
    📋 Still in Feedback? Easy to get sidetracked here.
`,
    help: `
  chkd help [command]
  ─────────────────────────────────────────────────────────────

  Show help for chkd commands.

  USAGE:
    chkd help              # List all commands
    chkd help <command>    # Detailed help for a command

  AVAILABLE COMMANDS:
    status      Show progress and current task
    list        List all spec items by area
    bug         Quick-create a bug
    bugs        List open bugs
    fix         Mark a bug as fixed
    win         Add a quick win
    wins        List quick wins
    won         Complete a quick win
    start       Start working on a task
    tick        Mark an item complete
    working     Signal you're working on a sub-item
    progress    Show current task's sub-items
    add         Add a feature to spec
    edit        Update an item's title/story
    migrate     Import SPEC.md to database
    init        Initialize chkd in new project
    upgrade     Add/update chkd in existing project
    workflow    Show development workflow

  EXAMPLES:
    chkd help status       # How to use status
    chkd help list         # How to list items
    chkd help tick         # How to tick items
    chkd help migrate      # How to migrate from SPEC.md
`,
    add: `
  chkd add "title" [--story "desc"] [--area SD|FE|BE] [--dry-run]
  ─────────────────────────────────────────────────────────────

  Add a new feature/item to the chkd database.

  ARGUMENTS:
    "title"    The feature title (required)

  OPTIONS:
    --story "text"    Story/description for the feature
    --area <code>     Target area: SD, FE, BE, FUT (default: auto)
    --dry-run         Preview what would be created without adding
    --tasks "a,b,c"   Custom tasks (comma-separated)
    --no-workflow     Don't add workflow sub-tasks
    --confirm-large   Confirm adding >10 tasks

  WHAT IT DOES:
    1. Validates the title isn't a duplicate
    2. Adds the item exactly as specified (no AI processing)
    3. Uses default workflow if no --tasks provided
    4. Returns the item ID and line number

  WHEN TO USE:
    - Claude Code adding features (full control)
    - Explicit, structured additions
    - Programmatic spec updates

  For AI-assisted creation from raw input, use 'chkd create' instead.

  EXAMPLES:
    chkd add "User authentication"
    chkd add "Dark mode" --story "Toggle between light and dark themes"
    chkd add "Dark mode" --area FE
    chkd add "API caching" --area BE --dry-run
    chkd add "Login form" --tasks "validation,tests,docs"

  OUTPUT EXAMPLE:
    ✓ Added: User authentication
    Area: Frontend (FE)
    ID: fe-user-authentication
    Tasks: 6

  SAFETY FEATURES:
    - Duplicate detection (blocks similar titles)
    - Dry-run mode (preview before adding)
    - Large addition confirmation (>10 tasks)
    - Unknown parameter warnings

  TIP: Use --dry-run first to see what will be created.
`,
    create: `
  chkd create "describe what you want"
  ─────────────────────────────────────────────────────────────

  AI-powered story creation. Takes raw input and produces clean spec items.

  ARGUMENTS:
    "request"    Natural language description of what you want (required)

  OPTIONS:
    --area <code>     Hint for target area: SD, FE, BE, FUT
    --dry-run         Preview AI output without creating

  WHAT IT DOES:
    1. Sends your raw request to Claude AI
    2. AI generates: clean title, user story, area, and tasks
    3. Shows you what will be created
    4. Asks for confirmation before adding to spec

  EXAMPLES:
    chkd create "can we add dark mode toggle somewhere"
    chkd create "the login is broken on mobile" --area FE
    chkd create "I want cards across the top for switching repos"

  WHEN TO USE:
    - You have a rough idea but want AI to structure it
    - Human-driven feature requests (not Claude Code)
    - Converting verbal requirements into spec items

  COMPARISON WITH 'add':
    add:    Pass explicit title, story, tasks - for programmatic use
    create: Pass raw input, AI processes - for human use

  REQUIRES: CHKD_API_KEY or ANTHROPIC_API_KEY environment variable
`,
    impromptu: `
  chkd impromptu "description"
  ─────────────────────────────────────────────────────────────

  Start an ad-hoc work session not tied to a spec task.

  ARGUMENTS:
    "description"    What you're working on (required)

  WHAT IT DOES:
    - Starts a session without a spec task
    - Shows IMPROMPTU state in UI (yellow indicator)
    - Keeps the UI engaged during ad-hoc work
    - Tracks time spent

  WHEN TO USE:
    - Quick scripts not worth adding to spec
    - Experiments or prototyping
    - Helping with something outside the project
    - Any work that should show in the UI

  EXAMPLES:
    chkd impromptu "Quick data export script"
    chkd impromptu "Experimenting with new library"
    chkd impromptu "Helping teammate with their code"

  END THE SESSION:
    chkd done        # When finished

  SEE ALSO:
    chkd debug       # For debugging/investigation work
`,
    debug: `
  chkd debug "description"
  ─────────────────────────────────────────────────────────────

  Start a debug/investigation session.

  ARGUMENTS:
    "description"    What you're debugging (required)

  WHAT IT DOES:
    - Starts a debug session without a spec task
    - Shows DEBUG state in UI (red indicator)
    - Keeps the UI engaged during investigation
    - Tracks time spent

  WHEN TO USE:
    - Investigating a bug not yet logged
    - Debugging production issues
    - Performance investigation
    - Any diagnostic work

  EXAMPLES:
    chkd debug "Login crash on Safari"
    chkd debug "Slow API response investigation"
    chkd debug "Memory leak in dashboard"

  END THE SESSION:
    chkd done        # When finished

  DIFFERENCE FROM /bugfix:
    - /bugfix works with bugs logged via 'chkd bug'
    - chkd debug is for ad-hoc investigation
    - Both show DEBUG state in UI

  SEE ALSO:
    chkd bug         # Log a bug for later
    /bugfix          # Fix a logged bug
    chkd impromptu   # For non-debug ad-hoc work
`,
    win: `
  chkd win "title"
  ─────────────────────────────────────────────────────────────

  Add a quick win - a small improvement to do when you have time.

  ARGUMENTS:
    "title"    The quick win description (required)

  WHAT IT DOES:
    - Adds a checkbox to docs/QUICKWINS.md
    - Quick wins are visible in the UI
    - Great for small improvements that don't need a spec item

  WHEN TO USE:
    - Small UI tweaks
    - Code cleanup ideas
    - Performance micro-optimizations
    - Anything that takes < 30 minutes

  EXAMPLES:
    chkd win "Add loading spinner to save button"
    chkd win "Fix typo in footer"
    chkd win "Remove unused import in utils.ts"

  SEE ALSO:
    chkd wins        # List quick wins
    chkd won         # Complete a quick win
`,
    wins: `
  chkd wins
  ─────────────────────────────────────────────────────────────

  List all quick wins for the current project.

  WHAT IT SHOWS:
    - Open quick wins (not yet done)
    - Completed quick wins

  OUTPUT EXAMPLE:
    ⚡ Quick Wins (3 open, 2 done)
    ─────────────────
    ○ Add loading spinner
    ○ Fix typo in footer
    ○ Clean up unused imports
    ✓ Add hover states
    ✓ Update button colors

  SEE ALSO:
    chkd win         # Add a quick win
    chkd won         # Complete a quick win
`,
    won: `
  chkd won "query"
  ─────────────────────────────────────────────────────────────

  Mark a quick win as complete (or toggle it back to open).

  ARGUMENTS:
    "query"    ID or partial title to match (required)

  MATCHING:
    - Matches by ID (first 6+ chars)
    - Matches by title substring (case-insensitive)

  EXAMPLES:
    chkd won "loading"          # Match "Add loading spinner"
    chkd won "a1b2c3"           # Match by ID
    chkd won "typo"             # Match "Fix typo in footer"

  SEE ALSO:
    chkd win         # Add a quick win
    chkd wins        # List quick wins
`,
    migrate: `
  chkd migrate
  ─────────────────────────────────────────────────────────────

  Import tasks from docs/SPEC.md to the chkd database.

  WHAT IT DOES:
    1. Reads your docs/SPEC.md file
    2. Parses all items and sub-items
    3. Imports them to the chkd database
    4. Deletes SPEC.md on success

  WHEN TO USE:
    - One-time migration from SPEC.md to database
    - When switching from file-based to DB-based task management

  NOTES:
    - This is a one-time operation
    - After migration, use 'chkd add' to create new tasks
    - Completed items under done parents are not imported

  EXAMPLES:
    chkd migrate             # Import SPEC.md to database
`,
    hosts: `
  chkd hosts [domain]
  ─────────────────────────────────────────────────────────────

  Set up a local domain to access chkd's stable version.

  Adds an entry to /etc/hosts so you can use a custom URL
  instead of localhost:3848.

  ARGUMENTS:
    domain    Custom domain (default: chkd.local)

  REQUIRES:
    - sudo access (to modify /etc/hosts)
    - npm run stable running on port 3848

  EXAMPLES:
    chkd hosts                  # Use chkd.local:3848
    chkd hosts chkd.com         # Use chkd.com:3848
    chkd hosts myproject.dev    # Use myproject.dev:3848

  SUGGESTED DOMAINS:
    chkd.local      Safe, won't conflict with real sites
    chkd.test       Another safe option
    chkd.dev        Good for development
    chkd.com        Works but blocks the real chkd.com site

  AFTER SETUP:
    1. Run: npm run stable
    2. Visit: http://[domain]:3848

  NOTE: Uses port 3848 (stable port). For port 80 access,
  you'd need a reverse proxy like Caddy or nginx.
`,
  };

  if (helps[command]) {
    console.log(helps[command]);
  } else {
    console.log(`\n  Unknown command: ${command}\n`);
    console.log(`  Run 'chkd help' to see all commands.\n`);
  }
}

// ============================================
// Init & Upgrade & Migrate
// ============================================

async function migrate() {
  const cwd = process.cwd();
  const path = await import('path');
  const fs = await import('fs/promises');

  const specPath = path.join(cwd, 'docs', 'SPEC.md');

  // Check if SPEC.md exists
  try {
    await fs.access(specPath);
  } catch {
    console.log(`\n  ❌ No docs/SPEC.md found`);
    console.log(`  Nothing to migrate. Use 'chkd add' to create tasks.\n`);
    return;
  }

  console.log(`\n  ⏳ Migrating SPEC.md to database...`);

  const res = await api('/api/migrate', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  const { itemsImported, itemsSkipped, itemsUpdated, specDeleted } = res.data;

  console.log(`\n  ✅ Migration complete!`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Items imported: ${itemsImported}`);
  if (itemsSkipped > 0) console.log(`  Items skipped (already exist): ${itemsSkipped}`);
  if (itemsUpdated > 0) console.log(`  Items updated: ${itemsUpdated}`);
  if (specDeleted) {
    console.log(`\n  📁 docs/SPEC.md has been deleted.`);
    console.log(`  Tasks now live in the chkd database.`);
  }
  console.log(`\n  Run 'chkd status' to see your tasks.\n`);
}

async function init(projectName?: string) {
  const cwd = process.cwd();
  const path = await import('path');
  const fs = await import('fs/promises');

  // Check if it's a git repo
  try {
    await fs.access(path.join(cwd, '.git'));
  } catch {
    console.log(`\n  ⚠️  Not a git repository.`);
    console.log(`  Run 'git init' first, then try again.\n`);
    return;
  }

  // Check if already initialized (check for CLAUDE.md)
  try {
    await fs.access(path.join(cwd, 'CLAUDE.md'));
    console.log(`\n  ⚠️  Already initialized: CLAUDE.md exists`);
    console.log(`  Use 'chkd upgrade' to replace with fresh templates.\n`);
    return;
  } catch {
    // Good - not initialized yet
  }

  const name = projectName || path.basename(cwd);
  console.log(`\n  Initializing chkd: ${name}`);
  console.log(`  ─────────────────────────────────`);

  // Create directories
  await fs.mkdir(path.join(cwd, 'docs'), { recursive: true });
  await fs.mkdir(path.join(cwd, '.claude', 'skills'), { recursive: true });

  // Find templates directory
  const { fileURLToPath } = await import('url');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const templatesDir = path.resolve(__dirname, '..', '..', 'templates');

  // Helper to copy with replacements
  async function copyTemplate(src: string, dest: string, replacements: Record<string, string> = {}) {
    let content = await fs.readFile(src, 'utf-8');
    for (const [key, value] of Object.entries(replacements)) {
      content = content.replace(new RegExp(key, 'g'), value);
    }
    await fs.writeFile(dest, content, 'utf-8');
  }

  // Helper to copy directory
  async function copyDir(src: string, dest: string) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  const replacements = { '\\{\\{PROJECT_NAME\\}\\}': name };

  // Copy templates
  try {
    await fs.copyFile(
      path.join(templatesDir, 'docs', 'GUIDE.md'),
      path.join(cwd, 'docs', 'GUIDE.md')
    );
    console.log(`  ✓ Created docs/GUIDE.md`);

    await fs.copyFile(
      path.join(templatesDir, 'docs', 'CLI.md'),
      path.join(cwd, 'docs', 'CLI.md')
    );
    console.log(`  ✓ Created docs/CLI.md`);

    await copyTemplate(
      path.join(templatesDir, 'CLAUDE.md.template'),
      path.join(cwd, 'CLAUDE.md'),
      replacements
    );
    console.log(`  ✓ Created CLAUDE.md`);

    await copyDir(
      path.join(templatesDir, 'skills'),
      path.join(cwd, '.claude', 'skills')
    );
    console.log(`  ✓ Created .claude/skills/`);
  } catch (err) {
    console.log(`  ❌ Error copying templates: ${err}`);
    return;
  }

  // Register with chkd
  const res = await api('/api/repos', {
    method: 'POST',
    body: JSON.stringify({ path: cwd, name }),
  });

  if (res.success) {
    console.log(`  ✓ Registered with chkd`);
  } else if (res.error?.includes('already')) {
    console.log(`  · Already registered`);
  } else {
    console.log(`  ⚠ Could not register: ${res.error}`);
    console.log(`    (Is chkd running? Start with: npm run dev)`);
  }

  console.log(`
  ─────────────────────────────────
  ✅ Project initialized!

  Next steps:
    1. Edit CLAUDE.md to describe your project
    2. Use 'chkd add' to create tasks
    3. Run 'chkd status' to see progress

  Migrating from SPEC.md? Run 'chkd migrate'
`);
}

async function upgrade(projectName?: string) {
  const cwd = process.cwd();
  const path = await import('path');
  const fs = await import('fs/promises');

  // Check if it's a git repo
  try {
    await fs.access(path.join(cwd, '.git'));
  } catch {
    console.log(`\n  ⚠️  Not a git repository.`);
    console.log(`  Run 'git init' first, then try again.\n`);
    return;
  }

  const name = projectName || path.basename(cwd);
  console.log(`\n  Upgrading to chkd: ${name}`);
  console.log(`  ─────────────────────────────────`);
  console.log(`\n  This will back up existing files and create fresh templates.\n`);

  // Find templates directory
  const { fileURLToPath } = await import('url');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const templatesDir = path.resolve(__dirname, '..', '..', 'templates');

  // Helper to backup a file (skips if -old already exists to preserve original)
  async function backupFile(filePath: string): Promise<'backed_up' | 'already_backed_up' | 'no_file'> {
    const fullPath = path.join(cwd, filePath);
    const ext = path.extname(filePath);
    const base = filePath.slice(0, -ext.length);
    const backupPath = path.join(cwd, `${base}-old${ext}`);

    try {
      await fs.access(fullPath);
    } catch {
      return 'no_file'; // Source doesn't exist
    }

    try {
      await fs.access(backupPath);
      return 'already_backed_up'; // Backup already exists, don't overwrite
    } catch {
      await fs.copyFile(fullPath, backupPath);
      return 'backed_up';
    }
  }

  // Check if file already has chkd content
  async function isAlreadyChkd(filePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(path.join(cwd, filePath), 'utf-8');
      // Check for chkd-specific content in CLAUDE.md
      return content.includes('chkd') && (content.includes('/chkd') || content.includes('chkd_'));
    } catch {
      return false;
    }
  }

  // Helper to copy with replacements
  async function copyTemplate(src: string, dest: string, replacements: Record<string, string> = {}) {
    let content = await fs.readFile(src, 'utf-8');
    for (const [key, value] of Object.entries(replacements)) {
      content = content.replace(new RegExp(key, 'g'), value);
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, content, 'utf-8');
  }

  // Helper to copy directory
  async function copyDir(src: string, dest: string) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  const replacements = { '\\{\\{PROJECT_NAME\\}\\}': name };

  // Helper to check if CLAUDE.md has substantial content
  async function getExistingContent(filePath: string): Promise<{ content: string; isSubstantial: boolean } | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').length;
      // If > 80 lines or doesn't have template placeholders, it's substantial
      const hasPlaceholders = content.includes('[describe your project here]') ||
                              content.includes('[Your coding conventions here]');
      return { content, isSubstantial: lines > 80 || !hasPlaceholders };
    } catch {
      return null;
    }
  }

  // Files to backup and replace (excluding CLAUDE.md - handled separately)
  // Note: SPEC.md is no longer created - tasks live in the database
  const files = [
    { path: 'docs/GUIDE.md', template: 'docs/GUIDE.md', hasReplacements: false },
    { path: 'docs/CLI.md', template: 'docs/CLI.md', hasReplacements: false },
  ];

  for (const file of files) {
    const backupStatus = await backupFile(file.path);
    if (backupStatus === 'backed_up') {
      console.log(`  ✓ Backed up ${file.path}`);
    } else if (backupStatus === 'already_backed_up') {
      console.log(`  · Original backup exists for ${file.path}`);
    }

    try {
      const src = path.join(templatesDir, file.template);
      const dest = path.join(cwd, file.path);
      if (file.hasReplacements) {
        await copyTemplate(src, dest, replacements);
      } else {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(src, dest);
      }
      console.log(`  ✓ ${backupStatus === 'no_file' ? 'Created' : 'Updated'} ${file.path}`);
    } catch (err) {
      console.log(`  ⚠ Could not create ${file.path}: ${err}`);
    }
  }

  // Handle CLAUDE.md specially - use LLM for intelligent merging if substantial
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  const existing = await getExistingContent(claudeMdPath);
  const templatePath = path.join(templatesDir, 'CLAUDE.md.template');
  let templateContent = await fs.readFile(templatePath, 'utf-8');
  templateContent = templateContent.replace(/\{\{PROJECT_NAME\}\}/g, name);

  if (existing?.isSubstantial) {
    // Use LLM to intelligently merge
    const { isAvailable, mergeClaudeMd } = await import('./llm.js');

    if (isAvailable()) {
      const spinner = createSpinner('Merging CLAUDE.md intelligently...');
      try {
        const merged = await mergeClaudeMd(existing.content, templateContent, name);
        spinner.stop('✓ Merged CLAUDE.md');
        const backupStatus = await backupFile('CLAUDE.md');
        if (backupStatus === 'backed_up') {
          console.log(`  ✓ Backed up CLAUDE.md`);
        }
        await fs.writeFile(claudeMdPath, merged, 'utf-8');
        console.log(`  ✓ Merged CLAUDE.md (kept project content, added chkd sections)`);
      } catch (err) {
        spinner.stop('⚠ LLM merge failed');
        console.log(`    ${err}`);
        console.log(`  · CLAUDE.md unchanged (backup your content and retry)`);
      }
    } else {
      console.log(`  ⚠ CLAUDE.md has custom content but no API key for intelligent merge.`);
      console.log(`    Set CHKD_API_KEY to enable. CLAUDE.md left unchanged.`);
    }
  } else {
    const backupStatus = await backupFile('CLAUDE.md');
    if (backupStatus === 'backed_up') {
      console.log(`  ✓ Backed up CLAUDE.md`);
    }
    try {
      await fs.writeFile(claudeMdPath, templateContent, 'utf-8');
      console.log(`  ✓ ${backupStatus === 'no_file' ? 'Created' : 'Updated'} CLAUDE.md`);
    } catch (err) {
      console.log(`  ⚠ Could not create CLAUDE.md: ${err}`);
    }
  }

  // Update skills (only replace chkd standard skills, preserve custom ones)
  const skillsDir = path.join(cwd, '.claude', 'skills');
  const templateSkillsDir = path.join(templatesDir, 'skills');

  try {
    await fs.mkdir(skillsDir, { recursive: true });

    // Get list of standard chkd skills from template
    const templateSkills = await fs.readdir(templateSkillsDir, { withFileTypes: true });
    const standardSkillNames = templateSkills
      .filter(d => d.isDirectory())
      .map(d => d.name);

    // Check what skills exist in project
    let existingSkills: string[] = [];
    try {
      const existing = await fs.readdir(skillsDir, { withFileTypes: true });
      existingSkills = existing.filter(d => d.isDirectory()).map(d => d.name);
    } catch {
      // No existing skills
    }

    // Find custom skills (in project but not in template)
    const customSkills = existingSkills.filter(s => !standardSkillNames.includes(s));

    // Backup custom skills on first run if skills-old doesn't exist
    const skillsBackup = path.join(cwd, '.claude', 'skills-old');
    let skillsBackupExisted = false;
    try {
      await fs.access(skillsBackup);
      skillsBackupExisted = true;
    } catch {
      // No backup yet
    }

    if (!skillsBackupExisted && existingSkills.length > 0) {
      await copyDir(skillsDir, skillsBackup);
      console.log(`  ✓ Backed up .claude/skills/`);
    }

    // Replace standard skills from template
    for (const skillName of standardSkillNames) {
      const srcSkill = path.join(templateSkillsDir, skillName);
      const destSkill = path.join(skillsDir, skillName);

      // Remove existing standard skill
      try {
        await fs.rm(destSkill, { recursive: true });
      } catch {
        // Didn't exist
      }

      // Copy from template
      await copyDir(srcSkill, destSkill);
    }

    console.log(`  ✓ Updated .claude/skills/ (${standardSkillNames.length} standard skills)`);

    if (customSkills.length > 0) {
      console.log(`  · Preserved ${customSkills.length} custom skill(s): ${customSkills.join(', ')}`);
    }
  } catch (err) {
    console.log(`  ⚠ Could not update skills: ${err}`);
  }

  // Register with chkd
  const res = await api('/api/repos', {
    method: 'POST',
    body: JSON.stringify({ path: cwd, name }),
  });

  if (res.success) {
    console.log(`  ✓ Registered with chkd`);
  } else if (res.error?.includes('already')) {
    console.log(`  · Already registered`);
  } else {
    console.log(`  ⚠ Could not register: ${res.error}`);
    console.log(`    (Is chkd running? Start with: npm run dev)`);
  }

  console.log(`
  ─────────────────────────────────
  ✅ Upgraded to chkd!

  Next steps:
    1. Run 'chkd migrate' if you have a docs/SPEC.md
    2. Add tasks with 'chkd add "Feature name"'
    3. Run 'chkd status' to see progress

  Original backups preserved in *-old files.
`);
}

// ============================================
// Main
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  // Parse flags and args
  const flags: Record<string, string | boolean> = {};
  const cleanArgs: string[] = [];
  const restArgs = args.slice(1);

  // Flags that expect a value
  const valueFlagSet = new Set(['severity', 'area', 'tasks', 'story', 'desc', 'title', 'type']);

  for (let i = 0; i < restArgs.length; i++) {
    const a = restArgs[i];
    if (a.startsWith('--')) {
      const flagName = a.slice(2);
      // Check if this flag expects a value and next arg exists and isn't a flag
      if (valueFlagSet.has(flagName) && restArgs[i + 1] && !restArgs[i + 1].startsWith('--')) {
        flags[flagName] = restArgs[i + 1];
        i++; // Skip next arg
      } else {
        flags[flagName] = true;
      }
    } else {
      cleanArgs.push(a);
    }
  }
  const arg = cleanArgs.join(' ');

  switch (command) {
    case 'init':
      await init(arg || undefined);
      break;
    case 'upgrade':
      await upgrade(arg || undefined);
      break;
    case 'status':
      await status();
      break;
    case 'list':
      await list();
      break;
    case 'workflow':
      workflow();
      break;
    case 'bug':
      // Support shorthand severity flags
      if (flags.high) flags.severity = 'high';
      if (flags.low) flags.severity = 'low';
      if (flags.critical) flags.severity = 'critical';
      if (flags.big) flags.severity = 'big';
      await bug(arg, flags);
      break;
    case 'also':
      await also(arg);
      break;
    case 'bugs':
      await bugs(flags.high ? 'high' : (flags.all ? 'all' : undefined));
      break;
    case 'fix':
      await fix(arg);
      break;
    case 'resolve':
      await resolveBug(arg);
      break;
    case 'bugfix':
      await startBugfix(arg, { convert: flags.convert });
      break;
    case 'win':
      await win(arg);
      break;
    case 'wins':
      await wins();
      break;
    case 'won':
      await won(arg);
      break;
    case 'quickwin':
      await quickwin(arg);
      break;
    case 'tick':
      await tick(arg);
      break;
    case 'start':
      await start(arg);
      break;
    case 'working':
      await working(arg);
      break;
    case 'progress':
      await progress();
      break;
    case 'iterate':
    case 'cycle':
      await iterate();
      break;
    case 'done':
      await done(Boolean(flags.force));
      break;
    case 'pause':
      await pause(arg || undefined);
      break;
    case 'idle':
      await idle();
      break;
    case 'impromptu':
      await adhoc('impromptu', arg);
      break;
    case 'debug':
      await adhoc('debug', arg);
      break;
    case 'sync':
      await sync(arg || undefined);
      break;
    case 'add':
      await add(arg, flags);
      break;
    case 'create':
      await create(arg, flags);
      break;
    case 'edit':
      await edit(arg, flags);
      break;
    case 'hosts':
      await setupHosts(arg);
      break;
    case 'migrate':
      await migrate();
      break;
    case 'version':
    case '--version':
    case '-v':
      version();
      break;
    case 'help':
    case '--help':
    case '-h':
      help(arg || undefined);
      break;
    default:
      console.log(`\n  Unknown command: ${command}`);
      console.log(`  Run 'chkd help' to see available commands.\n`);
  }
}

main().catch(console.error);
