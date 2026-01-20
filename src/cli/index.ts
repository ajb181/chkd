#!/usr/bin/env npx tsx

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

    console.log(`\n  ✓ ${res.data.message}\n`);
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

  console.log(`\n  ✓ ${res.data.message}`);

  if (res.data.queuedItems && res.data.queuedItems.length > 0) {
    console.log(`\n  📋 Queued items (${res.data.queuedCount}):`);
    for (const item of res.data.queuedItems) {
      console.log(`     + ${item}`);
    }
  }
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
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  console.log(`\n  🔨 ${res.data.message}\n`);
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

  // Show sub-items if any
  if (currentItem.children && currentItem.children.length > 0) {
    const completed = currentItem.children.filter((c: any) => c.completed).length;
    console.log(`  Progress: ${completed}/${currentItem.children.length} sub-items\n`);

    for (const child of currentItem.children) {
      const mark = child.completed ? '✓' : (child.inProgress ? '~' : ' ');
      const status = child.completed ? '✅' : (child.inProgress ? '🔨' : '⬚');
      console.log(`  ${status} ${child.title}`);
    }
  } else {
    console.log(`  No sub-items for this task`);
  }

  console.log('');
}

async function fix(bugQuery: string) {
  if (!bugQuery) {
    console.log(`\n  Usage: chkd fix "bug title or ID"\n`);
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

  console.log(`\n  ✅ ${res.data.message}`);
  console.log(`
  ─────────────────────────────────────────────────────────────
  📝 LEARNINGS PROMPT

  Consider documenting what you learned:

  1. ROOT CAUSE - What caused this bug?
     → Could this happen elsewhere? Add to CLAUDE.md patterns?

  2. PREVENTION - How to prevent similar bugs?
     → Add linting rule? Update code review checklist?

  3. DETECTION - How was it found?
     → Add test case? Improve error messages?

  Files to consider updating:
    • CLAUDE.md - Coding patterns, gotchas
    • .debug-notes.md - Investigation details
    • docs/ARCHITECTURE.md - System behavior

  Use /retro in Claude Code for a guided retrospective.
  ─────────────────────────────────────────────────────────────
`);
}

async function repair() {
  const cwd = process.cwd();
  const path = await import('path');
  const fs = await import('fs/promises');

  const specPath = path.join(cwd, 'docs', 'SPEC.md');

  // Check if SPEC.md exists
  let specContent: string;
  try {
    specContent = await fs.readFile(specPath, 'utf-8');
  } catch {
    console.log(`\n  ❌ No docs/SPEC.md found`);
    console.log(`  Run 'chkd init' or 'chkd upgrade' first.\n`);
    return;
  }

  // Check if LLM is available
  const { isAvailable, repairSpec } = await import('./llm.js');

  if (!isAvailable()) {
    console.log(`\n  ❌ No API key configured`);
    console.log(`  Set CHKD_API_KEY or ANTHROPIC_API_KEY environment variable.\n`);
    return;
  }

  console.log(`\n  ⏳ Analyzing and reformatting SPEC.md...`);

  try {
    const repairedContent = await repairSpec(specContent);

    // Create backup
    const backupPath = path.join(cwd, 'docs', 'SPEC-backup.md');
    await fs.writeFile(backupPath, specContent, 'utf-8');
    console.log(`  ✓ Backed up to docs/SPEC-backup.md`);

    // Write repaired content
    await fs.writeFile(specPath, repairedContent, 'utf-8');
    console.log(`  ✓ SPEC.md reformatted`);

    // Validate by calling the API
    const res = await api(`/api/spec?repoPath=${encodeURIComponent(cwd)}`);
    if (res.success && res.data) {
      console.log(`\n  📊 Result: ${res.data.totalItems} items across ${res.data.phases?.length || 0} areas`);
      console.log(`  Progress: ${res.data.progress}% complete\n`);
    } else {
      console.log(`\n  ⚠ Warning: Could not validate. Check docs/SPEC.md manually.`);
      console.log(`  Original saved to docs/SPEC-backup.md\n`);
    }
  } catch (err) {
    console.log(`\n  ❌ Repair failed: ${err}`);
    console.log(`  SPEC.md unchanged.\n`);
  }
}

async function bug(description: string, severity?: string) {
  if (!description) {
    console.log(`\n  Usage: chkd bug "description" [--severity high|medium|low]\n`);
    return;
  }

  const cwd = process.cwd();
  const res = await api('/api/bugs', {
    method: 'POST',
    body: JSON.stringify({
      repoPath: cwd,
      title: description,
      severity: severity || 'medium',
    }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  const severityLabel = severity ? ` [${severity.toUpperCase()}]` : '';
  console.log(`\n  ✓ Bug created${severityLabel}: ${description}\n`);
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

async function status() {
  const cwd = process.cwd();
  const res = await api(`/api/status?repoPath=${encodeURIComponent(cwd)}`);

  if (!res.success) {
    console.log(`❌ ${res.error}`);
    return;
  }

  const data = res.data;

  if (!data.registered) {
    console.log(`\n  ${data.message}\n`);
    return;
  }

  console.log(`\n  📁 ${data.repo.name}`);
  console.log(`  ─────────────────────────`);

  if (data.spec) {
    const bar = '█'.repeat(Math.floor(data.spec.progress / 5)) + '░'.repeat(20 - Math.floor(data.spec.progress / 5));
    console.log(`  Progress: [${bar}] ${data.spec.progress}%`);
    console.log(`  Items: ${data.spec.completedItems}/${data.spec.totalItems} complete`);
  }

  if (data.session.currentTask) {
    console.log(`\n  🔨 Current task:`);
    console.log(`     ${data.session.currentTask.title}`);
    console.log(`     Iteration ${data.session.iteration} • ${formatTime(data.session.elapsedMs)}`);
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
    console.log(`\n  No spec found. Create docs/SPEC.md first.\n`);
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

  STATUS

    status              Show current progress and task
    list                List all spec items by area
    workflow            Show the development workflow
    help [command]      Show detailed help for a command

  BUGS

    bug "desc"          Quick-create a bug
    bugs                List open bugs
    fix "bug"           Mark a bug as fixed

  WORKFLOW

    working "item"      Signal you're working on an item
    tick "item"         Mark an item complete
    progress            Show current task's sub-items

  SPEC

    repair              Reformat SPEC.md using AI (fixes formatting)

  BUILDING (use in Claude Code)

    /chkd SD.1          Build task SD.1 from the spec
    /story              Refine specs, plan features
    /bugfix             Fix bugs with minimal changes
    /commit             Safe commit workflow

  EXAMPLES

    chkd status         # See what's happening
    chkd bug "Broken"   # Quick-add a bug
    chkd bugs           # See open bugs
    chkd repair         # Fix SPEC.md formatting
    chkd init           # Set up new project

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
    fix: `
  chkd fix "bug"
  ─────────────────────────────────────────────────────────────

  Mark a bug as fixed.

  ARGUMENTS:
    "bug"    Bug title or ID (first 6 chars of UUID)

  WHAT IT DOES:
    - Marks bug as 'fixed' in the database
    - Sets resolved_at timestamp
    - Prompts you to document learnings

  WHEN TO USE:
    - After successfully fixing a bug
    - When closing bugs during cleanup

  EXAMPLES:
    chkd fix "Save button"      # By title
    chkd fix "a1b2c3"           # By ID prefix

  LEARNINGS PROMPT:
    After fixing, consider:
    - What caused this bug? (root cause)
    - How to prevent similar bugs? (patterns)
    - Should CLAUDE.md be updated?

  TIP: Use /retro in Claude Code for a full retrospective.
`,
    init: `
  chkd init [name]
  ─────────────────────────────────────────────────────────────

  Initialize chkd in a NEW project.

  ARGUMENTS:
    [name]    Project name (default: folder name)

  REQUIRES:
    - Must be a git repository (run 'git init' first)
    - No existing docs/SPEC.md (use 'upgrade' instead)

  CREATES:
    docs/SPEC.md          Your feature checklist
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
    1. Edit docs/SPEC.md to add your features
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
    2. Edit docs/SPEC.md if needed
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

  Mark an item as complete in SPEC.md.

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
    working: `
  chkd working "item"
  ─────────────────────────────────────────────────────────────

  Signal that you're working on an item.

  ARGUMENTS:
    "item"    Item title or ID (required)

  WHAT IT DOES:
    - Updates session to show current item
    - Marks item as [~] in-progress in SPEC.md
    - Shows in chkd status output

  WHEN TO USE:
    - Starting work on a sub-item
    - Switching between items
    - Resuming work after a break

  EXAMPLES:
    chkd working "Login form validation"
    chkd working "SD.1.2"

  THE WORKFLOW:
    1. chkd working "item"   ← Signal start (YOU ARE HERE)
    2. Build it
    3. chkd tick "item"      ← Mark done
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
    tick        Mark an item complete
    working     Signal you're working on an item
    progress    Show current task's sub-items
    repair      Reformat SPEC.md using AI
    init        Initialize chkd in new project
    upgrade     Add/update chkd in existing project
    workflow    Show development workflow

  EXAMPLES:
    chkd help status       # How to use status
    chkd help list         # How to list items
    chkd help tick         # How to tick items
    chkd help repair       # How to repair spec
`,
    repair: `
  chkd repair
  ─────────────────────────────────────────────────────────────

  Reformat SPEC.md using AI to fix formatting issues.

  WHAT IT DOES:
    1. Reads your docs/SPEC.md
    2. Uses AI to reformat to correct chkd format
    3. Creates backup at docs/SPEC-backup.md
    4. Writes reformatted content
    5. Validates the result

  REQUIRES:
    - API key: CHKD_API_KEY or ANTHROPIC_API_KEY env var
    - Existing docs/SPEC.md file

  WHEN TO USE:
    - After manually editing SPEC.md
    - When items are formatted incorrectly
    - When area headers don't match expected format
    - After dumping quick notes into the spec

  WHAT IT FIXES:
    - Item format: - [ ] **SD.1 Title** - Description
    - Area headers: ## Area: SD (Site Design)
    - Sequential numbering within areas
    - Sub-item indentation
    - Missing separators between areas

  WHAT IT PRESERVES:
    - All existing items (never removes content)
    - Completion status: [ ], [x], [~]
    - Item descriptions and meaning
    - Custom area codes if used

  EXAMPLES:
    chkd repair              # Reformat SPEC.md

  SEE ALSO:
    /reorder-spec - Claude Code skill for interactive reorganization
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
// Init & Upgrade
// ============================================

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

  // Check if already initialized
  try {
    await fs.access(path.join(cwd, 'docs', 'SPEC.md'));
    console.log(`\n  ⚠️  Already initialized: docs/SPEC.md exists`);
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
    await copyTemplate(
      path.join(templatesDir, 'docs', 'SPEC.md.template'),
      path.join(cwd, 'docs', 'SPEC.md'),
      replacements
    );
    console.log(`  ✓ Created docs/SPEC.md`);

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
    1. Edit docs/SPEC.md to add your features
    2. Edit CLAUDE.md to describe your project
    3. Run 'chkd status' to see progress
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
      return content.includes('docs/SPEC.md') && content.includes('chkd');
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
  const files = [
    { path: 'docs/SPEC.md', template: 'docs/SPEC.md.template', hasReplacements: true },
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
      console.log(`  ⏳ Merging CLAUDE.md intelligently...`);
      try {
        const merged = await mergeClaudeMd(existing.content, templateContent, name);
        const backupStatus = await backupFile('CLAUDE.md');
        if (backupStatus === 'backed_up') {
          console.log(`  ✓ Backed up CLAUDE.md`);
        }
        await fs.writeFile(claudeMdPath, merged, 'utf-8');
        console.log(`  ✓ Merged CLAUDE.md (kept project content, added chkd sections)`);
      } catch (err) {
        console.log(`  ⚠ LLM merge failed: ${err}`);
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
    1. Edit docs/SPEC.md to add your features
    2. Run 'chkd status' to see progress

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
  for (let i = 0; i < restArgs.length; i++) {
    const a = restArgs[i];
    if (a === '--severity' && restArgs[i + 1]) {
      flags.severity = restArgs[i + 1];
      i++; // Skip next arg
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = true;
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
      const severity = typeof flags.severity === 'string' ? flags.severity :
                       flags.high ? 'high' : flags.low ? 'low' : flags.critical ? 'critical' : undefined;
      await bug(arg, severity);
      break;
    case 'bugs':
      await bugs(flags.high ? 'high' : (flags.all ? 'all' : undefined));
      break;
    case 'fix':
      await fix(arg);
      break;
    case 'tick':
      await tick(arg);
      break;
    case 'working':
      await working(arg);
      break;
    case 'progress':
      await progress();
      break;
    case 'repair':
      await repair();
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
