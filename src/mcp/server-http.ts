#!/usr/bin/env node
/**
 * chkd MCP Server (HTTP-based)
 *
 * This version uses HTTP to communicate with the SvelteKit API instead of
 * direct database access. This fixes UI sync issues and ensures single source of truth.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

// HTTP client for API calls
import * as api from './http-client.js';
import { BASE_URL as HTTP_BASE } from './http-client.js';

// Note: Parser removed - DB is source of truth via HTTP API

// Cache the resolved repo path and worker context
let cachedRepoPath: string | null = null;
let cachedWorktreePath: string | null = null;
let cachedIsWorker: boolean | null = null;
let cachedWorkerInfo: any = undefined;  // undefined = not checked, null = checked but not a worker

// Get the actual working directory (may be worktree)
function getWorktreePath(): string {
  if (cachedWorktreePath) return cachedWorktreePath;
  cachedWorktreePath = process.cwd();
  return cachedWorktreePath;
}

// Check if we're running in a worker worktree
function isWorkerContext(): boolean {
  if (cachedIsWorker !== null) return cachedIsWorker;

  const cwd = process.cwd();
  try {
    const gitCommonDir = execSync('git rev-parse --git-common-dir', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    cachedIsWorker = gitCommonDir !== '.git';
    return cachedIsWorker;
  } catch {
    cachedIsWorker = false;
    return false;
  }
}

// Get worker info if in worker context (cached)
async function getWorkerContext(): Promise<any> {
  if (!isWorkerContext()) return null;
  if (cachedWorkerInfo !== undefined) return cachedWorkerInfo;

  try {
    const result = await api.getWorkerByWorktreePath(getWorktreePath());
    cachedWorkerInfo = result?.data?.worker || null;
    return cachedWorkerInfo;
  } catch {
    cachedWorkerInfo = null;
    return null;
  }
}

// Get repo path from current working directory
// If in a git worktree, resolves to the main repo path
function getRepoPath(): string {
  if (cachedRepoPath) return cachedRepoPath;

  const cwd = process.cwd();

  try {
    // Get the git common dir (same for main repo and all worktrees)
    const gitCommonDir = execSync('git rev-parse --git-common-dir', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    // If it's just ".git", we're in the main repo
    if (gitCommonDir === '.git') {
      cachedRepoPath = cwd;
      return cwd;
    }

    // Otherwise, gitCommonDir is the path to the main repo's .git folder
    // e.g., /Users/alex/chkd/.git -> main repo is /Users/alex/chkd
    const mainRepoPath = path.dirname(path.resolve(cwd, gitCommonDir));
    cachedRepoPath = mainRepoPath;
    return mainRepoPath;
  } catch {
    // Not a git repo, fall back to cwd
    cachedRepoPath = cwd;
    return cwd;
  }
}

// Helper to get repo or throw
async function requireRepo(repoPath: string) {
  const response = await api.getRepoByPath(repoPath);
  if (!response.success) {
    // Server connection error
    const hint = response.hint ? ` ${response.hint}` : '';
    throw new Error(`${response.error}${hint}`);
  }
  if (!response.repo) {
    throw new Error(`Project not registered with chkd. Run 'chkd upgrade' first.`);
  }
  return response.repo;
}

// Format duration
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// ============================================
// CONTEXTUAL NUDGES - Based on session state
// ============================================

// Track last check-in time per repo (in memory - resets on server restart)
const lastCheckIn: Map<string, number> = new Map();
const CHECK_IN_INTERVAL = 5 * 60 * 1000; // 5 minutes

const lastPulse: Map<string, number> = new Map();

function getTimeSinceCheckIn(repoPath: string): number {
  const last = lastCheckIn.get(repoPath);
  if (!last) return Infinity;
  return Date.now() - last;
}

function getTimeSincePulse(repoPath: string): number | null {
  const last = lastPulse.get(repoPath);
  if (!last) return null;
  return Date.now() - last;
}

function recordCheckIn(repoPath: string): void {
  lastCheckIn.set(repoPath, Date.now());
  lastPulse.set(repoPath, Date.now());
}

function recordPulse(repoPath: string): void {
  lastPulse.set(repoPath, Date.now());
}

async function getContextualNudges(
  session: any,
  queue: any[],
  bugs: any[],
  repoPath: string
): Promise<string[]> {
  const nudges: string[] = [];

  // Get anchor status
  const anchorResponse = await api.getAnchor(repoPath);
  const trackStatus = anchorResponse.data || { anchor: null, onTrack: true };

  // IDLE nudge - HIGHEST priority
  if (session.status === 'idle') {
    if (trackStatus.anchor) {
      nudges.push(`🎯 PENDING TASK: "${trackStatus.anchor.title}"`);
      nudges.push(`   User set this anchor - START IT NOW!`);
      nudges.push(`   → impromptu("${trackStatus.anchor.id || trackStatus.anchor.title}")`);
    } else {
      nudges.push(`🚨 IDLE: You're not in a session! Start one NOW:`);
      nudges.push(`   → impromptu("what you're doing") for ad-hoc work`);
      nudges.push(`   → debug("what you're investigating") for research`);
      nudges.push(`   → bugfix("bug title") to fix a bug`);
    }
    return nudges;
  }

  // Check-in nudge - make it prominent when overdue
  const timeSinceCheckIn = getTimeSinceCheckIn(repoPath);
  if (timeSinceCheckIn > CHECK_IN_INTERVAL) {
    const mins = Math.floor(timeSinceCheckIn / 60000);
    if (mins >= 30) {
      // Very overdue - urgent warning
      nudges.unshift(`🚨 ${mins}+ min without check-in!`);
      nudges.unshift(`   STOP and run checkin() NOW before continuing.`);
      nudges.unshift(`   Philosophy: "Tick. Verify. Tick. Verify."`);
    } else if (mins >= 15) {
      // Moderately overdue
      nudges.unshift(`⏰ ${mins}+ min without check-in - run checkin()`);
    } else {
      // Just overdue
      nudges.push(`⏰ ${mins}+ min without check-in. Run checkin()`);
    }
  }

  // Off-track nudge
  if (!trackStatus.onTrack && trackStatus.anchor) {
    nudges.push(`⚠️ OFF TRACK: Anchor is "${trackStatus.anchor.title}" - return or pivot`);
  }

  // Queue nudges
  if (queue.length > 0) {
    nudges.push(`📬 ${queue.length} message(s) from user - check with pulse()`);
  }

  // Mode-specific nudges
  if (session.mode === 'debugging') {
    nudges.push(`🔧 Debug mode: Focus on root cause, minimal changes`);
  } else if (session.mode === 'impromptu') {
    nudges.push(`⚡ Impromptu: Log what you did when done`);
  }

  // Bug count nudge
  if (bugs.length >= 5) {
    nudges.push(`🐛 ${bugs.length} open bugs - consider fixing some soon`);
  }

  return nudges;
}

function formatNudges(nudges: string[]): string {
  if (nudges.length === 0) return '';
  return `\n───────────────────\n` + nudges.join('\n');
}

// Server version identifier
const SERVER_TYPE = "http-based";
const SERVER_VERSION = "2.1.0";  // Bump when adding new tools!

// Track when this server instance started (for stale detection)
const SERVER_START_TIME = Date.now();
const SERVER_FILE_PATH = import.meta.url.replace('file://', '');

// Check if the source file has been modified since server started
function isServerStale(): boolean {
  try {
    const fs = require('fs');
    const stat = fs.statSync(SERVER_FILE_PATH);
    return stat.mtimeMs > SERVER_START_TIME;
  } catch {
    return false;
  }
}

function getStaleWarning(): string {
  if (isServerStale()) {
    return `\n⚠️ MCP SERVER OUTDATED - Restart session for new tools!`;
  }
  return '';
}

// Create MCP Server
const server = new McpServer({
  name: "chkd",
  version: SERVER_VERSION,
});

// ============================================
// TOOLS
// ============================================

// status - Get current project status
server.tool(
  "status",
  "Get current chkd project status, progress, and active task. Run this first to understand where you are.",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    // Check if we're a worker
    const workerInfo = await getWorkerContext();

    // Get session from API
    const sessionResponse = await api.getSession(repoPath);
    const session = sessionResponse.data || { status: 'idle', elapsedMs: 0 };

    // Get progress from DB (no fallback - DB is source of truth)
    let progress = { completed: 0, total: 0, percentage: 0 };
    const progressResponse = await api.getSpecProgress(repoPath);
    if (progressResponse.success && progressResponse.data?.progress) {
      const p = progressResponse.data.progress;
      progress.total = p.total;
      progress.completed = p.done;
      progress.percentage = p.percent;
    }
    // If DB has no data, progress stays at 0 - project needs migration

    // Get queue and bugs
    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];

    const bugsResponse = await api.getBugs(repoPath);
    const bugs = (bugsResponse.data || []).filter((b: any) => b.status !== 'fixed' && b.status !== 'wont_fix');

    let statusText = '';

    // Worker header if in worker context
    if (workerInfo) {
      statusText += `👷 WORKER MODE\n`;
      statusText += `═══════════════════════════════════════\n`;
      statusText += `Task: ${workerInfo.taskId} - ${workerInfo.taskTitle}\n`;
      statusText += `Branch: ${workerInfo.branchName}\n`;
      statusText += `Status: ${workerInfo.status.toUpperCase()}\n`;
      if (workerInfo.nextTaskId) {
        statusText += `Next: ${workerInfo.nextTaskId} - ${workerInfo.nextTaskTitle}\n`;
      }
      statusText += `───────────────────────────────────────\n\n`;
      statusText += `📋 YOUR TASK:\n`;
      statusText += `Build: ${workerInfo.taskTitle}\n\n`;
      statusText += `When done: worker_complete() to signal ready for merge\n`;
      statusText += `Need help: Check spec with suggest()\n`;
    } else {
      statusText += `📁 ${path.basename(repoPath)}\n`;
      statusText += `Progress: ${progress.percentage}% (${progress.completed}/${progress.total})\n`;
      statusText += `MCP: ${SERVER_TYPE} v${SERVER_VERSION}${isServerStale() ? ' ⚠️ STALE' : ' ✓'}\n\n`;
    }

    // Main session info (not shown for workers)
    if (!workerInfo) {
      // Queue first
      if (queue.length > 0) {
        statusText += `📬 QUEUE (${queue.length} message${queue.length > 1 ? 's' : ''} from user):\n`;
        queue.forEach((q: any) => {
          statusText += `  • ${q.title}\n`;
        });
        statusText += `\n`;
      }

      // Status
      if (session.status === 'idle') {
        const anchorResponse = await api.getAnchor(repoPath);
        const trackStatus = anchorResponse.data;
        if (trackStatus?.anchor) {
          statusText += `Status: 🎯 PENDING - Task waiting\n`;
          statusText += `Task: ${trackStatus.anchor.title}\n`;
          statusText += `💡 START THIS NOW → impromptu("${trackStatus.anchor.id || trackStatus.anchor.title}")\n`;
        } else {
          statusText += `Status: IDLE - No active task\n`;
          statusText += `💡 Start with impromptu(), debug(), or bugfix()\n`;
        }
      } else {
        statusText += `Status: ${session.status.toUpperCase()}\n`;
        if (session.currentTask) {
          statusText += `Task: ${session.currentTask.title}\n`;
        }
        if (session.currentItem) {
          statusText += `Working on: ${session.currentItem.title}\n`;
        }
        statusText += `Duration: ${formatDuration(session.elapsedMs)}\n`;
      }

      // Summary
      if (bugs.length > 0) {
        statusText += `\n💭 Summary: ${bugs.length} bug${bugs.length > 1 ? 's' : ''}\n`;
      }

      // Get nudges
      const nudges = await getContextualNudges(session, queue, bugs, repoPath);
      statusText += formatNudges(nudges) + getStaleWarning();
    }

    return {
      content: [{
        type: "text",
        text: statusText
      }]
    };
  }
);

// impromptu - Start an impromptu session
server.tool(
  "impromptu",
  "Start an impromptu work session for unplanned work not in the spec. Keeps you visible in UI even for ad-hoc tasks.",
  {
    description: z.string().describe("What you're working on (e.g., 'Quick script for data export')")
  },
  async ({ description }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.startAdhocSession(repoPath, 'impromptu', description);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `⚠️ ${response.error}\n\n${response.hint || ''}`
        }]
      };
    }

    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];

    let text = `⚡ Impromptu session started\n`;
    text += `Working on: ${description}\n`;
    text += `───────────────────\n`;
    text += `This tracks ad-hoc work so nothing is forgotten.\n`;
    text += `When done: done() to end session`;

    if (queue.length > 0) {
      text += `\n\n📬 Queue (${queue.length}):\n`;
      queue.forEach((q: any) => {
        text += `  • ${q.title}\n`;
      });
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// debug - Start a debug session
server.tool(
  "debug",
  "Start a debug/investigation session. Use when researching an issue or exploring code.",
  {
    description: z.string().describe("What you're investigating (e.g., 'Why login is slow')")
  },
  async ({ description }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.startAdhocSession(repoPath, 'debug', description);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `⚠️ ${response.error}\n\n${response.hint || ''}`
        }]
      };
    }

    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];

    let text = `🔍 INVESTIGATION MODE
═══════════════════════════════════════
Investigating: ${description}

MINDSET: You're a detective, not a fixer.
Your goal is UNDERSTANDING, not solutions.
───────────────────────────────────────

📓 START DEBUG NOTES:
   echo "## Investigation: $(date '+%H:%M')" >> .debug-notes.md
   echo "**Question:** ${description}" >> .debug-notes.md

INVESTIGATION PROCESS:
1. OBSERVE  → What exactly is happening? Gather facts.
2. QUESTION → Ask the user for context, reproduction steps.
3. HYPOTHESIZE → List 2-3 possible causes.
4. TEST    → Check each hypothesis systematically.
5. CONCLUDE → What did you learn? Document it.

⚠️  DISCIPLINE:
• Don't jump to fixes - understand first
• Don't assume - ask the user
• Don't rush - investigation takes time
• Update .debug-notes.md as you work

CHECKPOINTS (get user alignment):
□ "Here's what I'm seeing... does that match your experience?"
□ "I have 3 hypotheses: X, Y, Z. Which should I check first?"
□ "I think I found the cause: [X]. Does that make sense?"

WHEN YOU FIND SOMETHING:
• Bug to fix? → bug("description") to log it, then bugfix("description")
• Just learning? → Document in .debug-notes.md
• Scope creep idea? → bug("idea") or win("idea")

When done: done()`;

    if (queue.length > 0) {
      text += `\n\n📬 Queue (${queue.length}):\n`;
      queue.forEach((q: any) => {
        text += `  • ${q.title}\n`;
      });
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// done - End the current session
server.tool(
  "done",
  "End the current session (impromptu, debug, or feature work). Clears the active state.",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const sessionResponse = await api.getSession(repoPath);
    const session = sessionResponse.data;

    if (!session || session.status === 'idle') {
      return {
        content: [{
          type: "text",
          text: `Already idle - no active session to end.`
        }]
      };
    }

    const taskTitle = session.currentTask?.title || session.mode || 'session';
    const duration = formatDuration(session.elapsedMs || 0);

    await api.clearSession(repoPath);
    
    // Get context for smarter next-step suggestions
    const bugsResponse = await api.getBugs(repoPath);
    const openBugs = (bugsResponse.data || []).filter((b: any) => b.status !== 'fixed' && b.status !== 'wont_fix');
    
    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];
    
    let text = `✅ Session ended: ${taskTitle}\n📊 Duration: ${duration}\n`;
    
    // Context-aware next step suggestions
    text += `\n───────────────────────────────────────`;
    text += `\nWHAT'S NEXT?`;
    
    if (queue.length > 0) {
      text += `\n• 📬 Queue has ${queue.length} message(s) from user - check these first`;
    }
    
    if (session.mode === 'debugging') {
      text += `\n• Was this a bug? → bug("description") to log it`;
      text += `\n• Ready to fix? → bugfix("description") to start`;
    }
    
    if (openBugs.length > 0) {
      text += `\n• 🐛 ${openBugs.length} open bug(s) - bugfix() to work on one`;
    }
    
    text += `\n• 💬 Discuss with user what to work on next`;
    text += `\n• 📊 status() to see full project state`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// bug - Log a bug
server.tool(
  "bug",
  "Log a bug you noticed. Use this immediately when you see something wrong - don't wait!",
  {
    description: z.string().describe("What's broken or wrong"),
    severity: z.enum(["low", "medium", "high", "critical"]).optional().describe("Bug severity (default: medium)")
  },
  async ({ description, severity }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    await api.createBug(repoPath, description, undefined, severity || 'medium');

    const sessionResponse = await api.getSession(repoPath);
    const session = sessionResponse.data;

    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];

    const bugsResponse = await api.getBugs(repoPath);
    const bugs = (bugsResponse.data || []).filter((b: any) => b.status !== 'fixed');

    let text = `✓ Bug logged: ${description}\n`;

    if (session && session.status !== 'idle' && session.currentTask) {
      text += `\n🎯 Continue with: ${session.currentTask.title}`;
      text += `\n   Don't derail - fix bugs later!`;
    } else {
      text += `\n💭 Fix it later with bugfix()`;
    }

    const nudges = await getContextualNudges(session || { status: 'idle', elapsedMs: 0 }, queue, bugs, repoPath);
    if (nudges.length > 0) {
      text += formatNudges(nudges);
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// bugfix - Start working on a bug
server.tool(
  "bugfix",
  "Start working on a bug. This begins a debug session and prompts you to align with the user on what the bug means.",
  {
    query: z.string().describe("Bug title or ID to work on")
  },
  async ({ query }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    let bug = await api.getBugByQuery(repoPath, query);
    
    // Auto-create bug if not found (common flow: debug → bugfix with same description)
    if (!bug) {
      const createResponse = await api.createBug(repoPath, query, undefined, 'medium');
      if (!createResponse.success) {
        return {
          content: [{
            type: "text",
            text: `❌ Failed to create bug: ${createResponse.error}`
          }]
        };
      }
      bug = createResponse.data;
    }

    if (bug.status === 'fixed') {
      return {
        content: [{
          type: "text",
          text: `⚠️ Bug already fixed: ${bug.title}`
        }]
      };
    }

    // Mark as in progress
    await api.updateBug(repoPath, query, 'in_progress');

    // Start debug session
    await api.startAdhocSession(repoPath, 'debug', `Fixing: ${bug.title}`);

    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];

    const sevIcon = bug.severity === 'critical' ? '🔴' :
                    bug.severity === 'high' ? '🟠' :
                    bug.severity === 'low' ? '🟢' : '🟡';

    let text = `🔧 BUGFIX MODE
═══════════════════════════════════════
Bug: ${bug.title}
Severity: ${sevIcon} ${bug.severity.toUpperCase()}${bug.description ? `\nDescription: ${bug.description}` : ''}

MINDSET: Surgical precision. Fix the bug, nothing more.
───────────────────────────────────────

📓 START DEBUG NOTES:
   echo "## Bugfix: $(date '+%H:%M')" >> .debug-notes.md
   echo "**Bug:** ${bug.title}" >> .debug-notes.md

FIRST: SIZE THE BUG
┌─────────────────────────────────────┐
│ SMALL BUG (Quick Fix Track)         │
│ • Clear error with stack trace      │
│ • Points to specific line           │
│ • Fix will be < 10 lines            │
│                                     │
│ BIG BUG (Deep Investigation)        │
│ • Vague symptoms, no clear error    │
│ • Multiple possible causes          │
│ • Can't reliably reproduce          │
│ → Use debug() instead          │
└─────────────────────────────────────┘

THE PROCESS:
1. ALIGN    → Explain your understanding to user. Get agreement.
2. RESEARCH → Search first! Someone probably hit this before.
3. REPRODUCE → Confirm you can trigger the bug.
4. ISOLATE  → Find root cause. Think out loud.
5. PROPOSE  → Describe fix to user. Get approval.
6. FIX      → Minimal change only. Don't refactor.
7. VERIFY   → User confirms it's fixed. Not you.

⚠️  DISCIPLINE - You are in BUGFIX mode:
• Research before brute force (web search is faster)
• Minimal changes only - smallest fix that works
• DON'T refactor "while you're in there"
• DON'T add features or improvements
• DON'T fix things that aren't broken
• Capture ideas with bug() or win(), don't act

CHECKPOINTS (get user alignment):
□ "Here's my understanding of the bug... correct?"
□ "I found this might be the cause: [X]. Should I dig deeper?"
□ "I want to make this change: [X]. Sound right?"
□ "Can you test now? Try the steps that caused the bug."

RED FLAGS - You're going off track if thinking:
• "While I'm here, I should also..."  → NO
• "This code is messy, let me clean..." → NO
• "I could add a feature that prevents..." → NO

IF USER GOES OFF TRACK (you can push back!):
• User asks unrelated question → "Park that for later?"
• User wants to add features → "Let's log that as a quick win"
• User derails into tangent → "Should I note that and stay on the bug?"

When fix is ready: fix("${bug.title}")
After user verifies: resolve("${bug.title}")`;

    if (queue.length > 0) {
      text += `\n\n📬 Queue (${queue.length}):\n`;
      queue.forEach((q: any) => {
        text += `  • ${q.title}\n`;
      });
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// fix - Signal fix is ready
server.tool(
  "fix",
  "Signal that your fix is ready. This prompts you to verify with the user before closing.",
  {
    query: z.string().describe("Bug title or ID")
  },
  async ({ query }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const bug = await api.getBugByQuery(repoPath, query);
    if (!bug) {
      return {
        content: [{
          type: "text",
          text: `❌ Bug not found: "${query}"`
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: `🔧 Fix ready: ${bug.title}\n─────────────────────────────────\n⚠️  VERIFY WITH USER:\n   Ask user to confirm the fix solves the problem.\n   Do not close until user has verified.\n─────────────────────────────────\n📦 BEFORE RESOLVING:\n   1. Review docs - update if behavior changed:\n      - CLAUDE.md, README.md, GUIDE.md\n      - CLI help text, API docs\n   2. Commit with descriptive message:\n      - Summary: what was fixed\n      - Body: root cause + how fixed\n   3. Push to remote\n   4. Then resolve\n─────────────────────────────────\n💡 Run resolve("${query}") after docs+commit+push and user confirms`
      }]
    };
  }
);

// resolve - Close a verified bug
server.tool(
  "resolve",
  "Close a bug after user has verified the fix works. Only use this after getting user confirmation!",
  {
    query: z.string().describe("Bug title or ID")
  },
  async ({ query }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const bug = await api.getBugByQuery(repoPath, query);
    if (!bug) {
      return {
        content: [{
          type: "text",
          text: `❌ Bug not found: "${query}"`
        }]
      };
    }

    await api.updateBug(repoPath, query, 'fixed');

    return {
      content: [{
        type: "text",
        text: `✅ Bug resolved: ${bug.title}\n📴 Debug session ended\n\n📦 Commit your fix:\n   git add -A && git commit -m "fix: ${bug.title.slice(0, 50)}"\n   git push\n\n💭 Nice work. What's next?`
      }]
    };
  }
);

// checkin - Structured check-in
server.tool(
  "checkin",
  "Do a structured check-in with the user. Use this when prompted about 15-min check-in. Asks how things are going.",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const sessionResponse = await api.getSession(repoPath);
    const session = sessionResponse.data || { status: 'idle', elapsedMs: 0 };

    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];

    const bugsResponse = await api.getBugs(repoPath);
    const bugs = (bugsResponse.data || []).filter((b: any) => b.status !== 'fixed' && b.status !== 'wont_fix');

    const anchorResponse = await api.getAnchor(repoPath);
    const trackStatus = anchorResponse.data;

    recordCheckIn(repoPath);

    let text = `╔══════════════════════════════════════╗\n`;
    text += `║      15-MINUTE CHECK-IN              ║\n`;
    text += `╚══════════════════════════════════════╝\n\n`;

    text += `How are we doing? Let's review:\n\n`;

    // Current state
    if (session.status === 'idle') {
      text += `⚠️ Status: IDLE (not in a session)\n`;
    } else {
      text += `✓ Status: ${session.mode?.toUpperCase() || 'WORKING'}\n`;
      if (session.currentTask) {
        text += `  Task: ${session.currentTask.title}\n`;
      }
      text += `  Time: ${formatDuration(session.elapsedMs)}\n`;
    }

    // Anchor check
    if (trackStatus?.anchor) {
      if (trackStatus.onTrack) {
        text += `\n🎯 Anchor: ON TRACK\n`;
        text += `  Working on: ${trackStatus.anchor.title}\n`;
      } else {
        text += `\n⚠️ Anchor: OFF TRACK\n`;
        text += `  Should be: ${trackStatus.anchor.title}\n`;
        if (trackStatus.current) {
          text += `  Actually on: ${trackStatus.current.title}\n`;
        }
        text += `  → Return to anchor or call pivot()\n`;
      }
    }

    // Queue
    if (queue.length > 0) {
      text += `\n📬 User messages (${queue.length}):\n`;
      queue.forEach((q: any) => {
        text += `  • ${q.title}\n`;
      });
    }

    // Bugs
    if (bugs.length > 0) {
      text += `\n🐛 Open bugs: ${bugs.length}\n`;
    }

    text += `\n───────────────────────────────────────\n`;
    text += `Questions to discuss with user:\n`;
    text += `• Are we making good progress?\n`;
    text += `• Any blockers or concerns?\n`;
    text += `• Should we adjust our approach?\n`;
    text += `• Anything to add to the queue?\n`;
    text += `───────────────────────────────────────\n`;
    text += `💡 Timer reset. Next check-in in ~15 min.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// pulse - Quick status update
server.tool(
  "pulse",
  "Check in with a status update. Use this every 15 min or when you make progress. Resets the check-in timer.",
  {
    status: z.string().describe("Brief status update - what are you working on?")
  },
  async ({ status }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const sessionResponse = await api.getSession(repoPath);
    const session = sessionResponse.data;

    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];

    recordPulse(repoPath);
    recordCheckIn(repoPath);

    // Get progress info
    const progressResponse = await api.getSpecProgress(repoPath);
    const progress = progressResponse.data?.progress;
    
    let text = `💓 Pulse: ${status}\n`;
    text += `───────────────────────────────────────\n`;
    text += `✓ Check-in recorded (timer reset)\n\n`;

    // Current task info
    if (session?.currentTask) {
      text += `📋 Current Task:\n`;
      text += `   ${session.currentTask.title}\n`;
      text += `   Iteration ${session.iteration || 1} • ${formatDuration(session.elapsedMs || 0)}\n\n`;
    }
    
    // Overall progress
    if (progress) {
      const pct = progress.percent || 0;
      text += `📊 Project: ${pct}% complete (${progress.done}/${progress.total})\n\n`;
    }

    // Show anchor status
    const anchorResponse = await api.getAnchor(repoPath);
    const trackStatus = anchorResponse.data;
    if (trackStatus?.anchor) {
      if (trackStatus.onTrack) {
        text += `🎯 On Track: ${trackStatus.anchor.title}\n`;
      } else {
        text += `⚠️ OFF TRACK from anchor: ${trackStatus.anchor.title}\n`;
        text += `   → Return to anchor or call pivot()\n`;
      }
    }

    // Queue
    if (queue.length > 0) {
      text += `\n📬 Queue (${queue.length} from user):\n`;
      queue.forEach((q: any) => {
        text += `  • ${q.title}\n`;
      });
    }

    text += `\n───────────────────────────────────────`;
    text += `\n💭 Keep going. Pulse again in ~15 min.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// also - Log off-task work
server.tool(
  "also",
  "Log something you did that wasn't part of the current task. Tracks off-plan work so nothing is forgotten.",
  {
    description: z.string().describe("What you did that was off-task")
  },
  async ({ description }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    await api.addAlsoDid(repoPath, description);

    return {
      content: [{
        type: "text",
        text: `✓ Logged: ${description}\n\n💭 Tracked as "also did". Now back to the main task.`
      }]
    };
  }
);

// tick - Mark item complete
server.tool(
  "tick",
  "Mark a spec item as complete. Use the item title or ID.",
  {
    item: z.string().describe("Item title or ID to mark complete")
  },
  async ({ item }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    // Get full title from DB (no fallback - DB is source of truth)
    let fullTitle = item;
    const findResponse = await api.findSpecItem(repoPath, item);
    if (findResponse.success && findResponse.data?.items?.length > 0) {
      fullTitle = findResponse.data.items[0].title;
    }
    // If not found, use the input as-is - the tick API will error if invalid

    const response = await api.tickItem(repoPath, item);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];

    let text = `✅ Completed: ${fullTitle}`;
    
    // Check if this was a Confirm step - remind about user approval
    const lowerTitle = fullTitle.toLowerCase();
    if (lowerTitle.includes('confirm') || lowerTitle.includes('approval') || lowerTitle.includes('verify')) {
      text += `\n\n⚠️  CHECKPOINT: Did you get explicit user approval?`;
      text += `\n   If not, discuss with user before proceeding.`;
    }

    if (queue.length > 0) {
      text += `\n\n📬 Queue (${queue.length}):\n`;
      queue.forEach((q: any) => {
        text += `  • ${q.title}\n`;
      });
    }

    text += `\n\n💭 Tick as you go - don't batch at the end.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// working - Signal starting work on an item
server.tool(
  "working",
  "Signal you're starting work on a specific item. Updates the UI to show current focus.",
  {
    item: z.string().describe("Item title or ID you're starting")
  },
  async ({ item }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    // Check for TBC fields first - block work if not properly defined
    try {
      const tbcResponse = await api.checkItemTbc(repoPath, item);
      if (tbcResponse.success && tbcResponse.data?.hasTbc) {
        return {
          content: [{
            type: "text",
            text: `⚠️ Cannot start work on "${tbcResponse.data.itemTitle}"\n\n` +
              `📋 These fields still have TBC (to be confirmed):\n` +
              tbcResponse.data.tbcFields.map((f: string) => `  • ${f}`).join('\n') + '\n\n' +
              `💡 Fill in these fields first during Explore phase or ask user for details.`
          }]
        };
      }
    } catch (e) {
      // If TBC check fails, continue anyway (might be a sub-item without metadata)
    }

    const response = await api.markInProgress(repoPath, item);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    // Get full title from DB (no fallback - DB is source of truth)
    let fullTitle = item;
    const findResponse = await api.findSpecItem(repoPath, item);
    if (findResponse.success && findResponse.data?.items?.length > 0) {
      fullTitle = findResponse.data.items[0].title;
    }
    // If not found, use the input as-is

    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];

    let text = `🔨 Working on: ${fullTitle}`;
    
    // Check if this is a Confirm/Verify step - warn about user approval requirement
    const lowerTitle = fullTitle.toLowerCase();
    if (lowerTitle.includes('confirm') || lowerTitle.includes('approval') || lowerTitle.includes('verify')) {
      text += `\n\n🛑 USER APPROVAL REQUIRED`;
      text += `\n   This step needs explicit user approval before ticking.`;
      text += `\n   Show your findings → wait for user "yes" → then tick.`;
    }

    if (queue.length > 0) {
      text += `\n\n📬 Queue (${queue.length}):\n`;
      queue.forEach((q: any) => {
        text += `  • ${q.title}\n`;
      });
    }

    text += `\n\n⚠️ IMPORTANT: Tick each sub-item as you complete it.`;
    text += `\n   Do NOT batch ticks at the end - tick as you go!`;
    text += `\n\n💭 When done, run tick() immediately.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// suggest - Suggest what to work on
server.tool(
  "suggest",
  "Analyze the spec and suggest what to work on next. Use this to help the user decide their next task.",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const bugsResponse = await api.getBugs(repoPath);
    const bugs = (bugsResponse.data || []).filter((b: any) => b.status !== 'fixed' && b.status !== 'wont_fix');
    const criticalBugs = bugs.filter((b: any) => b.severity === 'critical');
    const highBugs = bugs.filter((b: any) => b.severity === 'high');

    // Get items from DB (no fallback - DB is source of truth)
    const itemsResponse = await api.getSpecItems(repoPath, { topLevel: true, withProgress: true });
    if (!itemsResponse.success || !itemsResponse.data?.items) {
      return {
        content: [{
          type: "text",
          text: `❌ Repository not in database. Run migration first:\n\nnpm run migrate -- "${repoPath}"`
        }]
      };
    }

    const allItems = itemsResponse.data.items;
    const incomplete = allItems.filter((i: any) => i.status !== 'done' && i.status !== 'skipped');
    const inProgress = incomplete.filter((i: any) => i.status === 'in-progress');
    const notStarted = incomplete.filter((i: any) => i.status === 'open');

    let text = `📊 Suggestion Analysis\n`;
    text += `═══════════════════════════════════════\n\n`;

    if (criticalBugs.length > 0) {
      text += `🔴 CRITICAL BUGS (fix first!):\n`;
      criticalBugs.forEach((b: any) => {
        text += `   • ${b.title}\n`;
      });
      text += `\n→ Suggestion: Fix critical bugs before new features.\n`;
      text += `  Use bugfix("${criticalBugs[0].title}")\n\n`;
    }

    if (inProgress.length > 0) {
      text += `🔨 IN PROGRESS (finish these):\n`;
      inProgress.forEach((item: any) => {
        const itemId = item.displayId || item.id;
        text += `   • ${itemId} ${item.title}\n`;
      });
      text += `\n→ Suggestion: Finish in-progress work before starting new.\n\n`;
    }

    if (criticalBugs.length === 0 && highBugs.length > 0) {
      text += `🟠 HIGH PRIORITY BUGS:\n`;
      highBugs.slice(0, 3).forEach((b: any) => {
        text += `   • ${b.title}\n`;
      });
      if (highBugs.length > 3) text += `   ... and ${highBugs.length - 3} more\n`;
      text += `\n`;
    }

    if (notStarted.length > 0 && inProgress.length === 0) {
      text += `⬜ READY TO START:\n`;
      notStarted.slice(0, 5).forEach((item: any) => {
        const itemId = item.displayId || item.id;
        const itemArea = item.areaCode || item.area;
        text += `   • ${itemId} ${item.title} (${itemArea})\n`;
      });
      if (notStarted.length > 5) text += `   ... and ${notStarted.length - 5} more\n`;
      const firstId = notStarted[0].displayId || notStarted[0].id;
      text += `\n→ Suggestion: Start with ${firstId} ${notStarted[0].title}\n`;
    }

    // Use DB progress if available, otherwise calculate
    let pct: number;
    let remaining: number;
    if (itemsResponse.success && itemsResponse.data?.progress) {
      const progress = itemsResponse.data.progress;
      pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
      remaining = progress.total - progress.done;
    } else {
      const completed = allItems.length - incomplete.length;
      pct = allItems.length > 0 ? Math.round((completed / allItems.length) * 100) : 0;
      remaining = incomplete.length;
    }

    text += `\n───────────────────────────────────────\n`;
    text += `Progress: ${pct}% | Bugs: ${bugs.length} | Remaining: ${remaining}\n`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// pivot - Change anchor/focus
server.tool(
  "pivot",
  "Explicitly change focus to a new task. Use when you need to work on something different from the anchor. This acknowledges the pivot rather than silently drifting.",
  {
    taskId: z.string().describe("ID of the new task (e.g., 'SD.3')"),
    taskTitle: z.string().describe("Title of the new task"),
    reason: z.string().optional().describe("Why are you pivoting? (optional)")
  },
  async ({ taskId, taskTitle, reason }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const sessionResponse = await api.getSession(repoPath);
    const session = sessionResponse.data;
    const previousAnchor = session?.anchor?.title || 'none';

    await api.setAnchor(repoPath, taskId, taskTitle, 'cli');

    let text = `🔄 Pivot acknowledged\n`;
    text += `───────────────────────────────────────\n`;
    text += `Previous: ${previousAnchor}\n`;
    text += `New anchor: ${taskTitle}\n`;
    if (reason) {
      text += `Reason: ${reason}\n`;
    }
    text += `───────────────────────────────────────\n`;
    text += `💡 You're now on track for ${taskTitle}`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// bugs - List open bugs
server.tool(
  "bugs",
  "List all open bugs in the project.",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const bugsResponse = await api.getBugs(repoPath);
    const bugs = (bugsResponse.data || []).filter((b: any) => b.status !== 'fixed' && b.status !== 'wont_fix');

    if (bugs.length === 0) {
      return {
        content: [{
          type: "text",
          text: `🐛 No open bugs\n\n💭 Notice something wrong? Log it with bug()`
        }]
      };
    }

    let text = `🐛 Open Bugs (${bugs.length})\n─────────────────\n`;

    bugs.forEach((bug: any) => {
      const sevIcon = bug.severity === 'critical' ? '🔴' :
                      bug.severity === 'high' ? '🟠' :
                      bug.severity === 'low' ? '🟢' : '🟡';
      text += `${bug.id.slice(0,6)} ${sevIcon} ${bug.title}\n`;
    });

    text += `\n💭 Fix bugs with bugfix("title or id")`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// add - Add a feature to spec
server.tool(
  "add",
  "Add a new feature or task to the spec. Creates item with workflow sub-tasks. Use 'epic' param to link to an epic.",
  {
    title: z.string().describe("Feature title (e.g., 'User authentication')"),
    areaCode: z.string().describe("Area code: SD, FE, BE, or FUT"),
    description: z.string().optional().describe("Optional description or user story"),
    keyRequirements: z.array(z.string()).optional().describe("Key requirements for this feature - REQUIRED, don't leave empty"),
    filesToChange: z.array(z.string()).optional().describe("Files that will be modified - REQUIRED, don't leave empty"),
    testing: z.array(z.string()).optional().describe("How to test this feature - REQUIRED, don't leave empty"),
    // tasks parameter removed - chkd always uses standard workflow with checkpoints
    epic: z.string().optional().describe("Epic tag to link this item to (e.g., 'auth-overhaul')")
  },
  async ({ title, areaCode, description, keyRequirements, filesToChange, testing, epic }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.addFeatureWithMetadata(repoPath, {
      title,
      areaCode,
      description,
      keyRequirements,
      filesToChange,
      testing,
      withWorkflow: true  // Always uses standard workflow with checkpoints
    });

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    const specCode = response.data.sectionId || response.data.itemId;
    let text = `✅ Added: ${specCode} ${title}\n`;
    text += `Area: ${areaCode}\n`;
    text += `Workflow: ${response.data.stepCount || 0} steps, ${response.data.checkpointCount || 0} checkpoints\n`;

    // If epic specified, tag the item
    if (epic) {
      const tagResponse = await api.setTags(repoPath, specCode, [epic]);
      if (tagResponse.success) {
        text += `Epic: #${epic} ✓\n`;
      } else {
        text += `Epic: Failed to tag - ${tagResponse.error}\n`;
      }
    }

    text += `\n💡 Use working("${specCode}") to start working on it`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// add_child - Add sub-task to existing item
server.tool(
  "add_child",
  "Add a child task to an existing spec item. Use this to break down work into smaller steps.",
  {
    parentId: z.string().describe("Parent item ID (e.g., 'SD.1')"),
    title: z.string().describe("Sub-task title")
  },
  async ({ parentId, title }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.addChildItem(repoPath, parentId, title);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    let text = `✅ Added sub-task: ${title}\n`;
    text += `Parent: ${parentId}\n`;
    text += `Child ID: ${response.data.childId}\n`;
    text += `\n💡 Use working("${title}") when ready to start`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// add_task - Add sub-task to current working item
server.tool(
  "add_task",
  "Add a sub-task to the current working item (anchor). Convenience wrapper that doesn't require specifying parent ID.",
  {
    title: z.string().describe("Sub-task title")
  },
  async ({ title }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    // Get current session to find anchor
    const sessionRes = await fetch(`${HTTP_BASE}/api/session?repoPath=${encodeURIComponent(repoPath)}`);
    const sessionData = await sessionRes.json();

    if (!sessionData.success || !sessionData.data) {
      return {
        content: [{
          type: "text",
          text: "❌ No active session. Start work on an item first with working() or impromptu()."
        }]
      };
    }

    const session = sessionData.data;

    // Check for anchor
    if (!session.anchor?.id) {
      return {
        content: [{
          type: "text",
          text: "❌ No current working item. Use working('item') to set an anchor first, or use add_child('parentId', 'title') to specify parent directly."
        }]
      };
    }

    const parentId = session.anchor.id;
    const response = await api.addChildItem(repoPath, parentId, title);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    let text = `✅ Added sub-task to current item\n`;
    text += `═══════════════════════════════════════\n\n`;
    text += `📝 "${title}"\n`;
    text += `📍 Parent: ${parentId} (${session.anchor.title})\n`;
    text += `🆔 ID: ${response.data.childId}\n`;
    text += `\n💡 Use tick("${title}") when done`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// tag - Set tags on a spec item
server.tool(
  "tag",
  "Set tags on a spec item for filtering and organization. Tags help group related items.",
  {
    itemId: z.string().describe("Item ID (e.g., 'FE.1')"),
    tags: z.array(z.string()).describe("Array of tags (lowercase, alphanumeric, hyphens/underscores allowed)")
  },
  async ({ itemId, tags }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    // Normalize tags: lowercase, trim
    const normalizedTags = tags.map(t => t.toLowerCase().trim()).filter(t => t.length > 0);

    const response = await api.setTags(repoPath, itemId, normalizedTags);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    const tagList = normalizedTags.length > 0 ? normalizedTags.map(t => `#${t}`).join(' ') : '(none)';
    return {
      content: [{
        type: "text",
        text: `🏷️ Tags set on ${itemId}: ${tagList}\n\n💡 Filter by tag in the UI`
      }]
    };
  }
);

// upgrade_mcp - Check server version and get upgrade instructions
server.tool(
  "upgrade_mcp",
  "Check MCP server version, staleness, and get upgrade instructions if needed.",
  {},
  async () => {
    const repoPath = getRepoPath();
    const chkdPath = repoPath;
    const stale = isServerStale();

    let text = `╔══════════════════════════════════════╗\n`;
    text += `║       MCP SERVER VERSION CHECK       ║\n`;
    text += `╚══════════════════════════════════════╝\n\n`;

    // Version and staleness check
    text += `Server Type: ${SERVER_TYPE}\n`;
    text += `Version: ${SERVER_VERSION}\n`;
    
    if (stale) {
      text += `\n⚠️  SERVER IS STALE!\n`;
      text += `The server code has changed since this session started.\n`;
      text += `Restart Claude Code to get the latest tools.\n`;
    } else {
      text += `Status: ✅ Up to date\n`;
    }
    
    text += `\n───────────────────────────────────────\n`;
    text += `Benefits of HTTP-based server:\n`;
    text += `• UI syncs automatically (no refresh!)\n`;
    text += `• Single source of truth (API)\n`;
    text += `• No database lock conflicts\n`;
    text += `• Better error handling\n`;
    text += `───────────────────────────────────────\n\n`;

    if (stale) {
      text += `🔄 ACTION REQUIRED:\n`;
      text += `Restart Claude Code to use the updated MCP server.\n\n`;
    }

    text += `📋 TO UPGRADE OTHER PROJECTS:\n`;
    text += `1. Open that project in Claude Code\n`;
    text += `2. Run:\n`;
    text += `   claude mcp remove chkd\n`;
    text += `   claude mcp add chkd -- npx tsx ${chkdPath}/src/mcp/server-http.ts\n`;
    text += `3. Restart Claude Code`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// quickwin - Add quick win (requires planning)
server.tool(
  "CreateQuickWin",
  "Add a quick win with required planning. Creates a FUT task with 5-step workflow: Scope → Align → Fix → Verify → Commit.",
  {
    title: z.string().describe("Quick win title (e.g., 'Fix button alignment')"),
    files: z.string().describe("File(s) you'll change (comma-separated)"),
    test: z.string().describe("How you'll verify it works"),
    why: z.string().optional().describe("Why this fix is needed")
  },
  async ({ title, files, test, why }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const filesToChange = files.split(',').map(f => f.trim()).filter(Boolean);
    if (filesToChange.length === 0) {
      return { content: [{ type: "text", text: "❌ files cannot be empty" }] };
    }

    const response = await fetch(`${API_BASE}/api/spec/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoPath,
        title,
        areaCode: 'FUT',
        workflowType: 'quickwin',
        keyRequirements: [why || `Quick fix: ${title}`],
        filesToChange,
        testing: [test]
      })
    });
    const result = await response.json();

    if (!result.success) {
      return { content: [{ type: "text", text: `❌ ${result.error}` }] };
    }

    return {
      content: [{
        type: "text",
        text: `⚡ Quick win created: ${result.data.sectionId} ${title}\n📁 Files: ${filesToChange.join(', ')}\n✓ Test: ${test}\n📋 Workflow: Scope → Align → Fix → Verify → Commit\n💡 Start: chkd_start("${result.data.sectionId}")`
      }]
    };
  }
);

// quickwins - List quick wins
server.tool(
  "ListQuickWins",
  "List all quick wins (FUT area tasks).",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await fetch(`${API_BASE}/api/spec/items?repoPath=${encodeURIComponent(repoPath)}`);
    const result = await response.json();
    const allItems = result.data || [];
    
    // Filter to FUT items (quickwins) - only top-level items
    const wins = allItems.filter((w: any) => w.areaCode === 'FUT' && !w.parentId);
    const pending = wins.filter((w: any) => w.status === 'open' || w.status === 'in-progress');
    const completed = wins.filter((w: any) => w.status === 'done');

    if (wins.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📝 No quick wins yet\n\n💡 Add one with CreateQuickWin(title, files, test)`
        }]
      };
    }

    let text = `⚡ Quick Wins\n`;
    text += `═══════════════════════════════════════\n\n`;

    if (pending.length > 0) {
      text += `⬜ PENDING (${pending.length}):\n`;
      pending.forEach((w: any) => {
        const status = w.status === 'in-progress' ? '◐' : '○';
        const title = w.title.replace(/^FUT\.\d+\s*/, '');
        text += `  ${status} ${w.displayId} ${title}\n`;
      });
      text += `\n`;
    }

    if (completed.length > 0) {
      text += `✅ COMPLETED (${completed.length}):\n`;
      completed.forEach((w: any) => {
        const title = w.title.replace(/^FUT\.\d+\s*/, '');
        text += `  ✓ ${w.displayId} ${title}\n`;
      });
    }

    text += `\n💡 Start with chkd_start("FUT.X")`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// quickwin_done - Complete a quick win
server.tool(
  "CompleteQuickWin",
  "Mark a quick win as done. Use FUT.X ID to find it.",
  {
    id: z.string().describe("Quick win ID (e.g., FUT.1)")
  },
  async ({ id }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    // Find the item
    const findRes = await fetch(`${API_BASE}/api/spec/item?repoPath=${encodeURIComponent(repoPath)}&query=${encodeURIComponent(id)}`);
    const findResult = await findRes.json();
    
    if (!findResult.success || !findResult.data) {
      return { content: [{ type: "text", text: `❌ Quick win not found: ${id}` }] };
    }

    const item = findResult.data;

    // Mark as done
    const response = await fetch(`${API_BASE}/api/spec/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPath, itemId: item.id, status: 'done' })
    });
    const result = await response.json();

    if (!result.success) {
      return { content: [{ type: "text", text: `❌ ${result.error}` }] };
    }

    const title = item.title.replace(/^FUT\.\d+\s*/, '');
    return {
      content: [{
        type: "text",
        text: `✅ Quick win done: ${item.displayId} ${title}\n\n📦 Before committing:\n   1. Review docs if behavior changed\n   2. Commit with descriptive message\n   3. Push to remote`
      }]
    };
  }
);

// ============================================
// Epic Tools
// ============================================

// epic - Create a new epic
server.tool(
  "epic",
  "Create a new epic for a large feature spanning multiple spec items. Creates docs/epics/{name}.md with overview, tag, and overhaul checklist.",
  {
    name: z.string().describe("Epic name (e.g., 'Auth Overhaul', 'Performance Sprint')"),
    description: z.string().describe("Brief description of the epic's goal"),
    scope: z.array(z.string()).optional().describe("Optional list of what's in scope")
  },
  async ({ name, description, scope }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.createEpic(repoPath, name, description, scope);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    const epic = response.data;
    let text = `✅ Epic created: ${epic.name}\n`;
    text += `───────────────────────────────────\n`;
    text += `📁 File: docs/epics/${epic.slug}.md\n`;
    text += `🏷️  Tag: ${epic.tag}\n\n`;
    text += `💡 Link items to this epic:\n`;
    text += `   add("title", areaCode="FE", epic="${epic.tag}")\n`;
    text += `   Or existing items: tag("FE.1", ["${epic.tag}"])`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// epics - List all epics
server.tool(
  "epics",
  "List all epics in the project with their progress.",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.getEpics(repoPath);
    const epics = response.data || [];

    if (epics.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📦 No epics yet\n\n💡 Create one with epic("name", "description")`
        }]
      };
    }

    let text = `📦 Epics\n`;
    text += `═══════════════════════════════════════\n\n`;

    for (const epic of epics) {
      const statusEmoji = {
        'planning': '📋',
        'in-progress': '🔨',
        'review': '👀',
        'complete': '✅'
      }[epic.status] || '📋';

      const progressBar = epic.itemCount > 0
        ? `[${epic.completedCount}/${epic.itemCount}] ${epic.progress}%`
        : 'No items linked';

      text += `${statusEmoji} ${epic.name}\n`;
      text += `   Tag: #${epic.tag} | ${progressBar}\n`;
      text += `   ${epic.description}\n\n`;
    }

    text += `💡 Link items: tag("ITEM.ID", ["epic-tag"])`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// attach - Attach a file to an item
server.tool(
  "attach",
  "Attach a file (screenshot, log, etc.) to a bug, quick win, or spec item. Files are stored in docs/attachments/.",
  {
    itemType: z.enum(['bug', 'quickwin', 'item']).describe("Type of item to attach to: 'bug', 'quickwin', or 'item'"),
    itemId: z.string().describe("ID of the item (bug ID, quick win ID, or spec item ID like 'SD.1')"),
    filePath: z.string().describe("Absolute path to the file to attach")
  },
  async ({ itemType, itemId, filePath }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.attachFile(repoPath, itemType, itemId, filePath);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}${response.hint ? `\n💡 ${response.hint}` : ''}`
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: `📎 Attached: ${response.data.originalName}\n   To: ${itemType} ${itemId}\n   Path: ${response.data.path}\n\n💡 View attachments with attachments("${itemType}", "${itemId}")`
      }]
    };
  }
);

// attachments - List attachments for an item
server.tool(
  "attachments",
  "List attachments for a bug, quick win, or spec item.",
  {
    itemType: z.enum(['bug', 'quickwin', 'item']).optional().describe("Type of item: 'bug', 'quickwin', or 'item'. Omit to list all."),
    itemId: z.string().optional().describe("ID of the item. Omit to list all of that type.")
  },
  async ({ itemType, itemId }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.getAttachments(repoPath, itemType, itemId);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    const attachments = response.data || [];

    if (attachments.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📎 No attachments found${itemType ? ` for ${itemType}${itemId ? ` ${itemId}` : ''}` : ''}\n\n💡 Attach files with attach("itemType", "itemId", "/path/to/file")`
        }]
      };
    }

    let text = `📎 Attachments${itemType ? ` for ${itemType}${itemId ? ` ${itemId}` : ''}` : ''}\n`;
    text += `═══════════════════════════════════════\n\n`;

    attachments.forEach((a: any) => {
      const sizeKB = Math.round(a.size / 1024);
      text += `• ${a.originalName} (${sizeKB}KB)\n`;
      text += `  Type: ${a.itemType}, ID: ${a.itemId}\n`;
      text += `  Path: ${a.path}\n\n`;
    });

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// ============================================
// WORKERS (Multi-Worker System)
// ============================================

// spawn_worker - Spawn a new worker
server.tool(
  "spawn_worker",
  "Spawn a new worker Claude to work on a task in parallel. Creates a git worktree, feature branch, and returns the command to start the worker.",
  {
    taskId: z.string().describe("Task ID from spec (e.g., 'SD.3')"),
    taskTitle: z.string().describe("Task title"),
    nextTaskId: z.string().optional().describe("Optional: pre-assign next task ID"),
    nextTaskTitle: z.string().optional().describe("Optional: pre-assign next task title")
  },
  async ({ taskId, taskTitle, nextTaskId, nextTaskTitle }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.spawnWorker(repoPath, taskId, taskTitle, undefined, nextTaskId, nextTaskTitle);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}${response.hint ? `\n💡 ${response.hint}` : ''}`
        }]
      };
    }

    const data = response.data;
    let text = `👷 Worker spawned!\n`;
    text += `═══════════════════════════════════════\n\n`;
    text += `Task: ${taskId} - ${taskTitle}\n`;
    text += `Worker ID: ${data.workerId}\n`;
    text += `Branch: ${data.branchName}\n`;
    text += `Worktree: ${data.worktreePath}\n\n`;
    text += `┌─ START WORKER ────────────────────────┐\n`;
    text += `│ Open a NEW terminal and run:          │\n`;
    text += `│                                       │\n`;
    text += `│ ${data.command.length > 37 ? data.command.slice(0, 34) + '...' : data.command.padEnd(37)}│\n`;
    text += `│                                       │\n`;
    text += `└───────────────────────────────────────┘\n\n`;
    text += `💡 The worker will connect automatically and start working.\n`;
    text += `   Use workers() to monitor progress.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// workers - List active workers
server.tool(
  "workers",
  "List all active workers for this project. Shows their status, current task, and progress.",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.getWorkers(repoPath);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    const { workers, maxWorkers, canSpawn } = response.data;

    if (workers.length === 0) {
      return {
        content: [{
          type: "text",
          text: `👷 No active workers\n\n💡 Spawn one with spawn_worker("SD.1", "Task title")`
        }]
      };
    }

    let text = `👷 Workers (${workers.length}/${maxWorkers})\n`;
    text += `═══════════════════════════════════════\n\n`;

    for (const worker of workers) {
      const statusIcon = worker.status === 'working' ? '🟢' :
                        worker.status === 'merging' ? '🔄' :
                        worker.status === 'paused' ? '🟡' :
                        worker.status === 'error' ? '🔴' :
                        worker.status === 'merged' ? '✅' : '⚪';

      const elapsed = worker.elapsedMs ? formatDuration(worker.elapsedMs) : '-';

      text += `${statusIcon} ${worker.id.substring(0, 20)}...\n`;
      text += `   Task: ${worker.taskId || '-'} ${worker.taskTitle || ''}\n`;
      text += `   Status: ${worker.status.toUpperCase()}`;
      if (worker.progress > 0) text += ` (${worker.progress}%)`;
      text += `\n`;
      text += `   Time: ${elapsed}`;
      if (worker.message) {
        text += ` • "${worker.message.substring(0, 30)}${worker.message.length > 30 ? '...' : ''}"`;
      }
      text += `\n`;

      if (worker.nextTaskId) {
        text += `   Next: ${worker.nextTaskId} ${worker.nextTaskTitle || ''}\n`;
      }
      text += `\n`;
    }

    if (canSpawn) {
      text += `💡 Slot available! Spawn with spawn_worker()`;
    } else {
      text += `⚠️ Max workers reached (${maxWorkers}). Wait for one to complete.`;
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// pause_worker - Pause a worker
server.tool(
  "pause_worker",
  "Pause a worker. The worker will stop at its next checkpoint.",
  {
    workerId: z.string().describe("Worker ID to pause")
  },
  async ({ workerId }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.updateWorker(workerId, { status: 'paused' });

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: `⏸️ Worker paused: ${workerId}\n\n💡 Resume with resume_worker("${workerId}")`
      }]
    };
  }
);

// resume_worker - Resume a paused worker
server.tool(
  "resume_worker",
  "Resume a paused worker.",
  {
    workerId: z.string().describe("Worker ID to resume")
  },
  async ({ workerId }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.updateWorker(workerId, { status: 'working' });

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: `▶️ Worker resumed: ${workerId}\n\n💡 Monitor with workers()`
      }]
    };
  }
);

// merge_worker - Merge a worker's branch
server.tool(
  "merge_worker",
  "Complete a worker's task and merge their branch to main. Checks for conflicts first.",
  {
    workerId: z.string().describe("Worker ID to merge"),
    autoMerge: z.boolean().optional().describe("Auto-merge if clean (default: true)"),
    commitMessage: z.string().optional().describe("Custom commit message")
  },
  async ({ workerId, autoMerge, commitMessage }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.completeWorker(workerId, autoMerge ?? true, commitMessage);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    const data = response.data;

    if (data.mergeStatus === 'conflicts') {
      let text = `⚠️ Merge conflicts detected!\n\n`;
      text += `Files with conflicts:\n`;
      data.conflicts?.forEach((c: any) => {
        text += `  • ${c.file} (${c.type})\n`;
      });
      text += `\n💡 Resolve conflicts manually, then try again.\n`;
      text += `   Or use resolve_conflicts() for auto-resolution.`;

      return {
        content: [{
          type: "text",
          text
        }]
      };
    }

    if (data.mergeStatus === 'pending') {
      return {
        content: [{
          type: "text",
          text: `🔄 Ready to merge (awaiting approval)\n\n💡 Run merge_worker("${workerId}", true) to merge now.`
        }]
      };
    }

    let text = `✅ Worker merged successfully!\n\n`;
    if (data.nextTask) {
      text += `📋 Next task ready: ${data.nextTask.taskId} - ${data.nextTask.taskTitle}\n`;
      text += `💡 Spawn a new worker for it with spawn_worker()`;
    } else {
      text += `💡 Worker complete. Check workers() for other active workers.`;
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// stop_worker - Stop and remove a worker
server.tool(
  "stop_worker",
  "Stop a worker and clean up its worktree. Use force=true for active workers.",
  {
    workerId: z.string().describe("Worker ID to stop"),
    force: z.boolean().optional().describe("Force stop even if working (default: false)"),
    deleteBranch: z.boolean().optional().describe("Also delete the branch (default: false)")
  },
  async ({ workerId, force, deleteBranch }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.deleteWorker(workerId, force, deleteBranch);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}${response.hint ? `\n💡 ${response.hint}` : ''}`
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: `🛑 Worker stopped: ${workerId}\n   Worktree removed: ${response.data.worktreeRemoved}\n   Branch deleted: ${response.data.branchDeleted}`
      }]
    };
  }
);

// dead_workers - Check for dead workers
server.tool(
  "dead_workers",
  "Check for workers that haven't sent a heartbeat recently. Use this to detect and clean up stuck workers.",
  {
    thresholdMinutes: z.number().optional().describe("Minutes without heartbeat to consider dead (default: 2)")
  },
  async ({ thresholdMinutes }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const thresholdMs = (thresholdMinutes || 2) * 60 * 1000;
    const response = await api.getDeadWorkers(repoPath, thresholdMs);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    const { deadWorkers, totalActive, deadCount } = response.data;

    if (deadCount === 0) {
      return {
        content: [{
          type: "text",
          text: `✅ All ${totalActive} workers are healthy\n\n💡 No dead workers detected (heartbeat threshold: ${thresholdMinutes || 2} min, pending timeout: 5 min)`
        }]
      };
    }

    let text = `⚠️ Dead Workers Detected (${deadCount}/${totalActive})\n`;
    text += `═══════════════════════════════════════\n\n`;
    text += `Threshold: ${thresholdMinutes || 2} minutes without heartbeat\n\n`;

    for (const worker of deadWorkers) {
      const lastSeen = worker.heartbeatAt
        ? new Date(worker.heartbeatAt + 'Z').toLocaleTimeString()
        : 'never';

      text += `🔴 ${worker.id.substring(0, 20)}...\n`;
      text += `   Task: ${worker.taskId || '-'} ${worker.taskTitle || ''}\n`;
      text += `   Last heartbeat: ${lastSeen}\n`;
      text += `   Status: ${worker.status}\n\n`;
    }

    text += `───────────────────────────────────────\n`;
    text += `💡 Options:\n`;
    text += `  • stop_worker("workerId", true) - Stop and cleanup\n`;
    text += `  • Check if worker terminal is still running\n`;
    text += `  • Worker may have crashed - restart manually`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// ============================================
// WORKER TOOLS (Used by worker Claudes)
// ============================================

// worker_heartbeat - Worker reports status
server.tool(
  "worker_heartbeat",
  "Send a heartbeat to report worker status. Workers should call this every 30 seconds to stay alive. Returns instructions if worker should pause/abort. Auto-detects worker ID if running in a worktree.",
  {
    workerId: z.string().optional().describe("Your worker ID (auto-detected if in worktree)"),
    message: z.string().optional().describe("Brief status message (what you're doing)"),
    progress: z.number().min(0).max(100).optional().describe("Progress percentage (0-100)")
  },
  async ({ workerId, message, progress }) => {
    // Auto-detect worker ID from worktree context if not provided
    let resolvedWorkerId = workerId;
    if (!resolvedWorkerId) {
      const workerContext = await getWorkerContext();
      if (workerContext?.id) {
        resolvedWorkerId = workerContext.id;
      } else {
        return {
          content: [{
            type: "text",
            text: `❌ No worker ID provided and not running in a worker worktree.\n\n💡 Either provide workerId parameter or run this from a worker context.`
          }]
        };
      }
    }
    
    const response = await api.workerHeartbeat(resolvedWorkerId, message, progress);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ Heartbeat failed: ${response.error}\n\n⚠️ You may have been disconnected. Check your worker ID.`
        }]
      };
    }

    const data = response.data;
    let text = `💓 Heartbeat recorded\n`;

    if (data.shouldPause) {
      text += `\n⏸️ PAUSE REQUESTED: Stop work and wait for resume signal.\n`;
      text += `   Check again with worker_heartbeat() in 30 seconds.`;
    } else if (data.shouldAbort) {
      text += `\n🛑 ABORT REQUESTED: Stop work immediately.\n`;
      text += `   Your task has been cancelled.`;
    } else {
      text += `Status: ${data.status}\n`;
      if (data.nextTask) {
        text += `Next task queued: ${data.nextTask.taskId} - ${data.nextTask.taskTitle}\n`;
      }
      text += `\n💡 Keep working. Next heartbeat in ~30 seconds.`;
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// worker_complete - Worker signals task completion
server.tool(
  "worker_complete",
  "Signal that your task is complete and ready for merge. Master Claude will handle the merge process. Auto-detects worker ID if running in a worktree.",
  {
    workerId: z.string().optional().describe("Your worker ID (auto-detected if in worktree)"),
    summary: z.string().optional().describe("Brief summary of what was accomplished")
  },
  async ({ workerId, summary }) => {
    // Auto-detect worker ID from worktree context if not provided
    let resolvedWorkerId = workerId;
    if (!resolvedWorkerId) {
      const workerContext = await getWorkerContext();
      if (workerContext?.id) {
        resolvedWorkerId = workerContext.id;
      } else {
        return {
          content: [{
            type: "text",
            text: `❌ No worker ID provided and not running in a worker worktree.\n\n💡 Either provide workerId parameter or run this from a worker context.`
          }]
        };
      }
    }
    
    // First update worker message with summary
    if (summary) {
      await api.updateWorker(resolvedWorkerId, { message: summary, progress: 100 });
    }

    // Then trigger completion/merge
    const response = await api.completeWorker(resolvedWorkerId, true);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ Completion failed: ${response.error}\n\n💡 Make sure all changes are committed to your branch.`
        }]
      };
    }

    const data = response.data;

    if (data.mergeStatus === 'conflicts') {
      let text = `⚠️ Merge conflicts detected!\n\n`;
      text += `Your work is saved but cannot be auto-merged.\n`;
      text += `Master Claude will help resolve conflicts.\n\n`;
      text += `Conflicting files:\n`;
      data.conflicts?.forEach((c: any) => {
        text += `  • ${c.file}\n`;
      });
      text += `\n💡 Wait for further instructions.`;

      return {
        content: [{
          type: "text",
          text
        }]
      };
    }

    let text = `✅ Task complete and merged!\n\n`;
    if (summary) {
      text += `Summary: ${summary}\n\n`;
    }

    if (data.nextTask) {
      text += `📋 Your next task: ${data.nextTask.taskId} - ${data.nextTask.taskTitle}\n`;
      text += `💡 Start working on it now!`;
    } else {
      text += `🎉 No more tasks assigned. Good work!\n`;
      text += `💡 Your session will end. Wait for Master to assign new work.`;
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// worker_status - Worker checks its own status
server.tool(
  "worker_status",
  "Check your worker status. Use this to see if you should pause, continue, or if new instructions are available.",
  {
    workerId: z.string().describe("Your worker ID")
  },
  async ({ workerId }) => {
    const response = await api.checkWorkerStatus(workerId);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}\n\n⚠️ Worker may have been removed.`
        }]
      };
    }

    const worker = response.data;
    const statusIcon = worker.status === 'working' ? '🟢' :
                      worker.status === 'paused' ? '⏸️' :
                      worker.status === 'merging' ? '🔄' :
                      worker.status === 'merged' ? '✅' :
                      worker.status === 'error' ? '🔴' : '⚪';

    let text = `👷 Worker Status\n`;
    text += `═══════════════════════════════════════\n\n`;
    text += `${statusIcon} Status: ${worker.status.toUpperCase()}\n`;
    text += `Task: ${worker.taskId || '-'} ${worker.taskTitle || ''}\n`;
    text += `Progress: ${worker.progress}%\n`;

    if (worker.message) {
      text += `Last message: ${worker.message}\n`;
    }

    const elapsed = worker.elapsedMs ? formatDuration(worker.elapsedMs) : '-';
    text += `Time: ${elapsed}\n`;

    if (worker.nextTaskId) {
      text += `\n📋 Next task: ${worker.nextTaskId} ${worker.nextTaskTitle || ''}\n`;
    }

    // Instructions based on status
    text += `\n───────────────────────────────────────\n`;
    if (worker.status === 'paused') {
      text += `⏸️ You are PAUSED. Wait for resume signal.\n`;
      text += `   Check again in 30 seconds.`;
    } else if (worker.status === 'error') {
      text += `🔴 ERROR state. Your session may have been terminated.\n`;
      text += `   Check with Master Claude.`;
    } else if (worker.status === 'merged') {
      text += `✅ Task merged! Start your next task if assigned.`;
    } else {
      text += `💡 Continue working. Send heartbeats every 30 seconds.`;
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// ============================================
// RESOURCES - The "Conscience" and Spec
// ============================================

server.resource(
  "conscience",
  "chkd://conscience",
  { description: "Current session state, guidance, and behavioral reminders. Read this to understand where you are and what you should be doing." },
  async (uri, extra) => {
    const repoPath = getRepoPath();

    try {
      const repo = await api.getRepoByPath(repoPath);
      if (!repo) {
        return {
          contents: [{
            uri: "chkd://conscience",
            mimeType: "text/plain",
            text: `⚠️ Project not registered with chkd.\nRun 'chkd upgrade' to set up.`
          }]
        };
      }

      const sessionResponse = await api.getSession(repoPath);
      const session = sessionResponse.data || { status: 'idle', elapsedMs: 0 };

      const queueResponse = await api.getQueue(repoPath);
      const queue = queueResponse.data?.items || [];

      const bugsResponse = await api.getBugs(repoPath);
      const bugs = (bugsResponse.data || []).filter((b: any) => b.status !== 'fixed' && b.status !== 'wont_fix');

      const anchorResponse = await api.getAnchor(repoPath);
      const trackStatus = anchorResponse.data;

      let text = `╔══════════════════════════════════════╗\n`;
      text += `║         CHKD CONSCIENCE              ║\n`;
      text += `║    ${SERVER_TYPE} v${SERVER_VERSION}${' '.repeat(Math.max(0, 22 - SERVER_TYPE.length - SERVER_VERSION.length))}║\n`;
      text += `╚══════════════════════════════════════╝\n\n`;

      // Queue first (highest priority)
      if (queue.length > 0) {
        text += `┌─ 📬 MESSAGES FROM USER (${queue.length}) ${'─'.repeat(Math.max(0, 10 - String(queue.length).length))}┐\n`;
        queue.forEach((q: any) => {
          const msg = q.title.length > 33 ? q.title.slice(0, 30) + '...' : q.title;
          text += `│ • ${msg.padEnd(33)}│\n`;
        });
        text += `│ ⚡ These are USER INSTRUCTIONS!     │\n`;
        text += `└─────────────────────────────────────┘\n\n`;
      }

      // Anchor status
      if (session.anchor || trackStatus?.anchor) {
        const anchor = session.anchor || trackStatus.anchor;
        const anchorTitle = anchor.title.length > 28 ? anchor.title.slice(0, 25) + '...' : anchor.title;

        if (session.status === 'idle') {
          text += `┌─ 🎯 PENDING TASK ────────────────────┐\n`;
          text += `│ ${anchorTitle.padEnd(36)}│\n`;
          text += `│                                     │\n`;
          text += `│ ⚡ User set this anchor - START IT! │\n`;
          text += `│                                     │\n`;
          text += `│ Run: impromptu("${anchor.id}")     │\n`;
          text += `└─────────────────────────────────────┘\n\n`;
        } else if (trackStatus?.onTrack) {
          text += `┌─ 🎯 ANCHOR ──────────────────────────┐\n`;
          text += `│ ${anchorTitle.padEnd(36)}│\n`;
          text += `│ Status: ✅ ON TRACK                  │\n`;
          text += `└─────────────────────────────────────┘\n\n`;
        } else {
          text += `┌─ ⚠️  ANCHOR (OFF TRACK!) ─────────────┐\n`;
          text += `│ 🎯 ${anchorTitle.padEnd(33)}│\n`;
          text += `│                                     │\n`;
          text += `│ → Return to anchor or pivot         │\n`;
          text += `└─────────────────────────────────────┘\n\n`;
        }
      }

      // Session state
      text += `┌─ SESSION STATE ─────────────────────┐\n`;

      if (session.status === 'idle') {
        text += `│ ⚠️  STATUS: IDLE                    │\n`;
        text += `│                                     │\n`;
        text += `│ You're not in a session!            │\n`;
        text += `│ Start one before writing code:      │\n`;
        text += `│  • status() - see what's next  │\n`;
        text += `│  • impromptu("desc") - ad-hoc  │\n`;
        text += `│  • debug("desc") - investigate │\n`;
        text += `└─────────────────────────────────────┘\n\n`;
      } else {
        const modeIcon = session.mode === 'debugging' ? '🔧' :
                        session.mode === 'impromptu' ? '⚡' : '🔨';
        const modeLabel = session.mode === 'debugging' ? 'DEBUG' :
                         session.mode === 'impromptu' ? 'IMPROMPTU' : 'BUILDING';

        text += `│ ${modeIcon} MODE: ${modeLabel.padEnd(24)}│\n`;

        if (session.currentTask) {
          const taskTitle = session.currentTask.title.length > 30
            ? session.currentTask.title.slice(0, 27) + '...'
            : session.currentTask.title;
          text += `│ Task: ${taskTitle.padEnd(28)}│\n`;
        }

        text += `│ Time: ${formatDuration(session.elapsedMs).padEnd(28)}│\n`;
        text += `└─────────────────────────────────────┘\n\n`;
      }

      // Bugs
      if (bugs.length > 0) {
        text += `┌─ 🐛 OPEN BUGS (${bugs.length}) ${'─'.repeat(Math.max(0, 18 - String(bugs.length).length))}┐\n`;
        const showBugs = bugs.slice(0, 3);
        showBugs.forEach((bug: any) => {
          const sevIcon = bug.severity === 'critical' ? '🔴' :
                          bug.severity === 'high' ? '🟠' : '🟡';
          const title = bug.title.length > 30 ? bug.title.slice(0, 27) + '...' : bug.title;
          text += `│ ${sevIcon} ${title.padEnd(32)}│\n`;
        });
        if (bugs.length > 3) {
          text += `│ ... and ${bugs.length - 3} more                      │\n`;
        }
        text += `└─────────────────────────────────────┘\n\n`;
      }

      // Habits
      text += `┌─ HABITS ────────────────────────────┐\n`;
      text += `│ • See bug? → bug() then move on│\n`;
      text += `│ • Off-task? → also() to log    │\n`;
      text += `│ • Progress? → pulse() visible  │\n`;
      text += `│ • Sub-item done? → tick() NOW  │\n`;
      text += `└─────────────────────────────────────┘\n`;

      return {
        contents: [{
          uri: "chkd://conscience",
          mimeType: "text/plain",
          text
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: "chkd://conscience",
          mimeType: "text/plain",
          text: `Error reading chkd state: ${error}`
        }]
      };
    }
  }
);

// Spec resource - read the current spec
server.resource(
  "spec",
  "chkd://spec",
  { description: "The current spec from the database - task list, areas, and progress. Read this to understand what needs to be done." },
  async (uri, extra) => {
    const repoPath = getRepoPath();

    try {
      let text = `╔══════════════════════════════════════╗\n`;
      text += `║            PROJECT SPEC              ║\n`;
      text += `╚══════════════════════════════════════╝\n\n`;

      // Try DB first
      const itemsResponse = await api.getSpecItems(repoPath, { topLevel: true, withProgress: true, withChildren: true });

      if (itemsResponse.success && itemsResponse.data?.items?.length > 0) {
        // Use DB items
        const items = itemsResponse.data.items;
        const progress = itemsResponse.data.progress;

        const pct = progress?.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
        const inProgressCount = progress?.inProgress || items.filter((i: any) => i.status === 'in-progress').length;

        text += `Progress: ${pct}% (${progress?.done || 0}/${progress?.total || items.length} complete`;
        if (inProgressCount > 0) text += `, ${inProgressCount} in progress`;
        text += `)\n\n`;

        // Group by area
        const areas = ['SD', 'FE', 'BE', 'FUT'];
        for (const areaCode of areas) {
          const areaItems = items.filter((i: any) => i.areaCode === areaCode);
          if (areaItems.length === 0) continue;

          const areaCompleted = areaItems.filter((i: any) => i.status === 'done').length;
          const areaTotal = areaItems.length;

          text += `═══ ${areaCode} (${areaCompleted}/${areaTotal}) ═══\n`;

          for (const item of areaItems) {
            const status = item.status === 'done' ? '✅' : item.status === 'in-progress' ? '🔨' : '⬜';
            text += `${status} ${item.displayId} ${item.title}\n`;

            if (item.children && item.children.length > 0) {
              for (const sub of item.children) {
                const subStatus = sub.status === 'done' ? '✅' : sub.status === 'in-progress' ? '🔨' : '  ';
                text += `   ${subStatus} ${sub.title}\n`;
              }
            }
          }
          text += `\n`;
        }
      } else {
        // No fallback - DB is source of truth
        text += `Repository not in database.\n\n`;
        text += `Run migration first:\n`;
        text += `npm run migrate -- "${repoPath}"\n`;
      }

      return {
        contents: [{
          uri: "chkd://spec",
          mimeType: "text/markdown",
          text
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: "chkd://spec",
          mimeType: "text/plain",
          text: `Error reading spec: ${error}`
        }]
      };
    }
  }
);
);

// ============================================
// SPEC MAINTENANCE TOOLS
// ============================================

// transfer - Transfer an item to a different repo
server.tool(
  "transfer",
  "Transfer a spec item from the current repo to another repo. Use when an item was created in the wrong project.",
  {
    itemId: z.string().describe("Item ID or title to transfer (e.g., 'SD.1' or 'User auth')"),
    targetRepoPath: z.string().describe("Path to the target repository"),
    targetAreaCode: z.string().describe("Target area code in destination repo (SD, FE, BE, FUT)")
  },
  async ({ itemId, targetRepoPath, targetAreaCode }) => {
    const repoPath = getRepoPath(); if (!repoPath) {
      return {
        content: [{ type: "text", text: "No repo path set." }]
      };
    }

    try {
      const res = await fetch(`${HTTP_BASE}/api/spec/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceRepoPath: repoPath,
          targetRepoPath,
          itemId,
          targetAreaCode
        })
      });
      const data = await res.json();

      if (!data.success) {
        return {
          content: [{ type: "text", text: `Error: ${data.error}` }]
        };
      }

      let text = `✅ Item Transferred\n`;
      text += `═══════════════════════════════════════\n\n`;
      text += `📦 From: ${data.data.sourceRepo}\n`;
      text += `📦 To: ${data.data.targetRepo}\n`;
      text += `🆔 New ID: ${data.data.newItemId}\n`;
      text += `📍 Area: ${data.data.targetArea}\n\n`;
      text += `The item has been moved to the target repository.`;

      return {
        content: [{ type: "text", text }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error}` }]
      };
    }
  }
);

// ============================================
// LEARNINGS (Prototype - Capture context from conversations)
// ============================================

// learn - Capture a learning from the conversation
server.tool(
  "learn",
  "Capture a learning from the current conversation. Use this to record preferences, patterns, decisions, or mistakes that should inform future work. This is a prototype feature to test whether capturing fine-grained context helps later.",
  {
    text: z.string().describe("The learning itself (e.g., 'Prefer Svelte 5 runes over legacy syntax')"),
    category: z.enum(['preference', 'pattern', 'decision', 'mistake', 'context', 'other']).optional()
      .describe("Category: preference (user likes X), pattern (do it this way), decision (we chose X), mistake (avoid Y), context (background info)"),
    context: z.string().optional().describe("What was happening when this came up (optional)")
  },
  async ({ text, category, context }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.addLearning(repoPath, text, category, context);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    const categoryIcon = {
      preference: '💜',
      pattern: '🔄',
      decision: '✅',
      mistake: '⚠️',
      context: '📝',
      other: '💡'
    }[category || 'other'] || '💡';

    let resultText = `${categoryIcon} Learning captured\n`;
    resultText += `───────────────────────────────────────\n`;
    resultText += `"${text}"\n`;
    if (category) resultText += `Category: ${category}\n`;
    if (context) resultText += `Context: ${context}\n`;
    resultText += `\n💡 View learnings with learnings()`;

    return {
      content: [{
        type: "text",
        text: resultText
      }]
    };
  }
);

// learnings - Retrieve captured learnings
server.tool(
  "learnings",
  "Retrieve captured learnings for this project. Use this at the start of work to recall preferences, patterns, and decisions from previous sessions.",
  {
    category: z.enum(['preference', 'pattern', 'decision', 'mistake', 'context', 'other']).optional()
      .describe("Filter by category"),
    query: z.string().optional().describe("Search text in learnings"),
    limit: z.number().optional().describe("Max results to return (default: 50)")
  },
  async ({ category, query, limit }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.getLearnings(repoPath, { category, query, limit });

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    const learnings = response.data || [];

    if (learnings.length === 0) {
      let emptyText = `📚 No learnings captured yet\n\n`;
      emptyText += `💡 Capture learnings as you work:\n`;
      emptyText += `   learn("Prefer Svelte 5 runes", "preference")\n`;
      emptyText += `   learn("Always add loading states", "pattern")\n`;
      emptyText += `   learn("Chose SQLite over Postgres", "decision", "For simplicity")`;
      return {
        content: [{
          type: "text",
          text: emptyText
        }]
      };
    }

    const categoryIcons: Record<string, string> = {
      preference: '💜',
      pattern: '🔄',
      decision: '✅',
      mistake: '⚠️',
      context: '📝',
      other: '💡'
    };

    let text = `📚 Project Learnings (${learnings.length})\n`;
    text += `═══════════════════════════════════════\n\n`;

    // Group by category
    const grouped: Record<string, any[]> = {};
    for (const l of learnings) {
      const cat = l.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(l);
    }

    for (const [cat, items] of Object.entries(grouped)) {
      const icon = categoryIcons[cat] || '💡';
      text += `${icon} ${cat.toUpperCase()} (${items.length})\n`;
      for (const item of items) {
        text += `  • ${item.text}\n`;
        if (item.context) {
          text += `    ↳ ${item.context}\n`;
        }
      }
      text += `\n`;
    }

    text += `───────────────────────────────────────\n`;
    text += `💡 Add more with learn("text", "category")`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// ============================================
// START SERVER
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const port = process.env.CHKD_PORT || '3848';
  console.error(`chkd MCP server running (connecting to port ${port})`);
}

main().catch(console.error);
