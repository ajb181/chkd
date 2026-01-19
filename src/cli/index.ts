#!/usr/bin/env npx tsx

/**
 * chkd CLI - Human-friendly commands for spec-driven development
 *
 * Usage:
 *   chkd status          - What's going on?
 *   chkd start <item>    - Begin working on an item
 *   chkd tick [item]     - Mark item complete
 *   chkd done            - Finish current task
 *   chkd check "idea"    - Is this on-plan?
 *   chkd add "feature"   - Add to current phase
 *   chkd bug "problem"   - Log a bug for later
 *   chkd workflow        - Show the development workflow
 *   chkd help            - Show all commands
 */

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

async function start(item: string) {
  if (!item) {
    console.log(`\n  Usage: chkd start <item>`);
    console.log(`\n  Examples:`);
    console.log(`    chkd start 4.9           # By section number`);
    console.log(`    chkd start "daemon"      # By fuzzy match`);
    console.log(`\n  This locks in what you're building so Claude stays on-plan.\n`);
    return;
  }

  const cwd = process.cwd();
  const res = await api('/api/session/start', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd, taskQuery: item }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  console.log(`\n  ✅ Started: ${res.data.taskTitle}`);
  console.log(`\n  Next steps:`);
  console.log(`    1. Open Claude Code`);
  console.log(`    2. Run /chkd to load context`);
  console.log(`    3. Build the feature`);
  console.log(`    4. Run 'chkd done' when finished\n`);
}

async function tick(item?: string) {
  const cwd = process.cwd();
  const res = await api('/api/spec/tick', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd, itemQuery: item }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  console.log(`\n  ✅ Marked complete: ${res.data.title}\n`);
}

async function done() {
  const cwd = process.cwd();
  const res = await api('/api/session/complete', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  console.log(`\n  ✅ Completed: ${res.data.completedTask}`);
  if (res.data.nextTask) {
    console.log(`\n  Next up: ${res.data.nextTask}`);
  }
  console.log('');
}

async function check(idea: string) {
  if (!idea) {
    console.log(`\n  Usage: chkd check "your idea"`);
    console.log(`\n  Checks if an idea is on-plan or a deviation.\n`);
    return;
  }

  const cwd = process.cwd();
  const res = await api('/api/session/check', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd, request: idea }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  if (res.data.onPlan) {
    console.log(`\n  ✅ On plan: ${res.data.matchedItem || idea}`);
  } else {
    console.log(`\n  ⚠️  Off plan: "${idea}"`);
    console.log(`\n  Options:`);
    console.log(`    1. chkd add "${idea}"  - Add to spec`);
    console.log(`    2. Skip it for now`);
  }
  console.log('');
}

async function add(feature: string) {
  if (!feature) {
    console.log(`\n  Usage: chkd add "feature description"`);
    console.log(`\n  Adds a new item to the current phase.\n`);
    return;
  }

  const cwd = process.cwd();
  const res = await api('/api/spec/add', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd, title: feature }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  console.log(`\n  ✅ Added: ${feature}`);
  console.log(`     Phase ${res.data.phase}, line ${res.data.line}\n`);
}

async function bug(description: string) {
  if (!description) {
    console.log(`\n  Usage: chkd bug "description of the bug"`);
    console.log(`\n  Logs a bug to fix later without derailing current work.\n`);
    return;
  }

  const cwd = process.cwd();
  const res = await api('/api/bugs', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd, title: description }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}\n`);
    return;
  }

  console.log(`\n  🐛 Bug logged: ${description}`);
  console.log(`     ID: ${res.data.id}\n`);
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
    $ chkd start 4.9        # Lock in the task
    > /chkd                 # In Claude - load context
    $ chkd tick 4.9.1       # Check off sub-items
    $ chkd done             # Finish task

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

  COMMANDS

    status              Show current progress and task
    start <item>        Start working on a spec item
    tick [item]         Mark an item complete
    done                Complete current task
    check "idea"        Check if something is on-plan
    add "feature"       Add item to current phase
    bug "problem"       Log a bug for later
    workflow            Show the development workflow
    help [command]      Show help (or help for a command)

  EXAMPLES

    chkd status
    chkd start 4.9
    chkd start "remove daemon"
    chkd tick
    chkd check "add dark mode"
    chkd bug "login page crashes on mobile"

  GETTING STARTED

    1. cd into your project
    2. Run: chkd status
    3. If not registered, run the setup steps shown

  Learn more: chkd workflow
`);
}

function showCommandHelp(command: string) {
  const helps: Record<string, string> = {
    status: `
  chkd status

  Show what's happening in your project:
  - Overall progress
  - Current task
  - What to work on next

  This is your "where am I?" command. Run it often.
`,
    start: `
  chkd start <item>

  Start working on a spec item. This tells chkd what you're
  building so it can track progress and keep Claude on-plan.

  Examples:
    chkd start 4.9              # By section number
    chkd start "daemon"         # Fuzzy match by name

  What happens:
    1. Creates a session for this task
    2. Claude Code sees this via /chkd skill
    3. Progress tracked until you run 'chkd done'

  See also: chkd done, chkd tick
`,
    tick: `
  chkd tick [item]

  Mark a checklist item as complete.

  Examples:
    chkd tick           # Mark current task complete
    chkd tick 4.9.1     # Mark specific sub-item complete

  The spec file (docs/SPEC.md) is updated automatically.
`,
    done: `
  chkd done

  Complete the current task and get the next one.

  What happens:
    1. Current task marked complete in spec
    2. Session cleared
    3. Shows next suggested task

  Run this when you've finished building a feature.
`,
    check: `
  chkd check "idea"

  Check if an idea is on-plan before building it.

  Examples:
    chkd check "add dark mode"
    chkd check "refactor auth"

  If it's off-plan, you can either:
    - chkd add "idea" to add it to the spec
    - Skip it and stay focused
`,
    add: `
  chkd add "feature"

  Add a new item to the current phase.

  Examples:
    chkd add "Dark mode toggle"
    chkd add "Fix mobile layout"

  The feature gets added with the standard workflow steps:
    - [ ] Explore
    - [ ] Design
    - [ ] Prototype
    - [ ] Feedback
    - [ ] Implement
    - [ ] Polish
`,
    bug: `
  chkd bug "problem"

  Log a bug to fix later without derailing your current work.

  Examples:
    chkd bug "Login crashes on Safari"
    chkd bug "Typo in settings page"

  Bugs are stored and can be viewed in the UI or fixed later.
  This keeps you focused on the current task.
`,
    workflow: `
  chkd workflow

  Shows the complete development workflow.

  Every feature follows: Explore → Design → Prototype →
  Feedback → Implement → Polish

  This workflow catches issues early and prevents rework.
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
// Main
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const arg = args.slice(1).join(' ');

  switch (command) {
    case 'status':
      await status();
      break;
    case 'start':
      await start(arg);
      break;
    case 'tick':
      await tick(arg || undefined);
      break;
    case 'done':
      await done();
      break;
    case 'check':
      await check(arg);
      break;
    case 'add':
      await add(arg);
      break;
    case 'bug':
      await bug(arg);
      break;
    case 'workflow':
      workflow();
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
