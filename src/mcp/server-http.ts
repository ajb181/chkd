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

// HTTP client for API calls
import * as api from './http-client.js';

// Still need spec parser for local file reads
import { SpecParser } from '../lib/server/spec/parser.js';

// Get repo path from current working directory
function getRepoPath(): string {
  return process.cwd();
}

// Helper to get repo or throw
async function requireRepo(repoPath: string) {
  const repo = await api.getRepoByPath(repoPath);
  if (!repo) {
    throw new Error(`Project not registered with chkd. Run 'chkd upgrade' first.`);
  }
  return repo;
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
      nudges.push(`   → chkd_impromptu("${trackStatus.anchor.id || trackStatus.anchor.title}")`);
    } else {
      nudges.push(`🚨 IDLE: You're not in a session! Start one NOW:`);
      nudges.push(`   → chkd_impromptu("what you're doing") for ad-hoc work`);
      nudges.push(`   → chkd_debug("what you're investigating") for research`);
      nudges.push(`   → chkd_bugfix("bug title") to fix a bug`);
    }
    return nudges;
  }

  // Check-in nudge
  const timeSinceCheckIn = getTimeSinceCheckIn(repoPath);
  if (timeSinceCheckIn > CHECK_IN_INTERVAL) {
    const mins = Math.floor(timeSinceCheckIn / 60000);
    nudges.push(`⏰ ${mins}+ min without check-in. Run chkd_checkin()`);
  }

  // Off-track nudge
  if (!trackStatus.onTrack && trackStatus.anchor) {
    nudges.push(`⚠️ OFF TRACK: Anchor is "${trackStatus.anchor.title}" - return or pivot`);
  }

  // Queue nudges
  if (queue.length > 0) {
    nudges.push(`📬 ${queue.length} message(s) from user - check with chkd_pulse()`);
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
const SERVER_VERSION = "2.0.0";

// Create MCP Server
const server = new McpServer({
  name: "chkd",
  version: SERVER_VERSION,
});

// ============================================
// TOOLS
// ============================================

// chkd_status - Get current project status
server.tool(
  "chkd_status",
  "Get current chkd project status, progress, and active task. Run this first to understand where you are.",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    // Get session from API
    const sessionResponse = await api.getSession(repoPath);
    const session = sessionResponse.data || { status: 'idle', elapsedMs: 0 };

    // Parse spec for progress
    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    let progress = { completed: 0, total: 0, percentage: 0 };

    if (fs.existsSync(specPath)) {
      const specContent = fs.readFileSync(specPath, 'utf-8');
      const parser = new SpecParser();
      const spec = parser.parse(specContent);
      const allItems = spec.areas.flatMap(a => a.items);
      progress.total = allItems.length;
      progress.completed = allItems.filter(i => i.completed).length;
      progress.percentage = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
    }

    // Get queue and bugs
    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];

    const bugsResponse = await api.getBugs(repoPath);
    const bugs = (bugsResponse.data || []).filter((b: any) => b.status !== 'fixed' && b.status !== 'wont_fix');

    let statusText = `📁 ${path.basename(repoPath)}\n`;
    statusText += `Progress: ${progress.percentage}% (${progress.completed}/${progress.total})\n`;
    statusText += `MCP: ${SERVER_TYPE} v${SERVER_VERSION} ✓\n\n`;

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
        statusText += `💡 START THIS NOW → chkd_impromptu("${trackStatus.anchor.id || trackStatus.anchor.title}")\n`;
      } else {
        statusText += `Status: IDLE - No active task\n`;
        statusText += `💡 Start with chkd_impromptu(), chkd_debug(), or chkd_bugfix()\n`;
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

    return {
      content: [{
        type: "text",
        text: statusText + formatNudges(nudges)
      }]
    };
  }
);

// chkd_impromptu - Start an impromptu session
server.tool(
  "chkd_impromptu",
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
    text += `When done: chkd_done() to end session`;

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

// chkd_debug - Start a debug session
server.tool(
  "chkd_debug",
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

    let text = `🔧 Debug session started\n`;
    text += `Investigating: ${description}\n`;
    text += `───────────────────\n`;
    text += `Focus on understanding, not fixing yet.\n`;
    text += `If you find a bug: chkd_bug() to log it\n`;
    text += `When done: chkd_done() to end session`;

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

// chkd_done - End the current session
server.tool(
  "chkd_done",
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

    return {
      content: [{
        type: "text",
        text: `✅ Session ended: ${taskTitle}\n📊 Duration: ${duration}\n\n💭 What's next? Run chkd_status() to see options.`
      }]
    };
  }
);

// chkd_bug - Log a bug
server.tool(
  "chkd_bug",
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
      text += `\n💭 Fix it later with chkd_bugfix()`;
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

// chkd_bugfix - Start working on a bug
server.tool(
  "chkd_bugfix",
  "Start working on a bug. This begins a debug session and prompts you to align with the user on what the bug means.",
  {
    query: z.string().describe("Bug title or ID to work on")
  },
  async ({ query }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const bug = await api.getBugByQuery(repoPath, query);
    if (!bug) {
      const bugsResponse = await api.getBugs(repoPath);
      const bugs = (bugsResponse.data || []).filter((b: any) => b.status !== 'fixed');
      let bugList = bugs.length > 0
        ? bugs.map((b: any) => `  • ${b.id.slice(0,6)} - ${b.title}`).join('\n')
        : '  (no open bugs)';
      return {
        content: [{
          type: "text",
          text: `❌ Bug not found: "${query}"\n\nOpen bugs:\n${bugList}`
        }]
      };
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

    let text = `🐛 Bug: ${bug.title}\n`;
    text += `Severity: ${sevIcon} ${bug.severity.toUpperCase()}\n`;
    if (bug.description) {
      text += `Description: ${bug.description}\n`;
    }
    text += `\n🔧 Debug session started\n`;
    text += `─────────────────────────────────\n`;
    text += `⚠️  ALIGN WITH USER FIRST:\n`;
    text += `   Explain your understanding of this bug.\n`;
    text += `   Get agreement on what the problem is before proceeding.\n`;
    text += `─────────────────────────────────\n`;
    text += `Workflow:\n`;
    text += `1. Align   → Agree with user on what bug means\n`;
    text += `2. Research → Find root cause\n`;
    text += `3. Propose → Suggest fix, get approval\n`;
    text += `4. Fix     → Make minimal change\n`;
    text += `5. Verify  → User confirms it's solved\n`;
    text += `─────────────────────────────────\n`;
    text += `💡 Use chkd_pulse() to stay connected\n`;
    text += `💡 Run chkd_fix() when ready → then chkd_resolve() after user verifies`;

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

// chkd_fix - Signal fix is ready
server.tool(
  "chkd_fix",
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
        text: `🔧 Fix ready: ${bug.title}\n─────────────────────────────────\n⚠️  VERIFY WITH USER:\n   Ask user to confirm the fix solves the problem.\n   Do not close until user has verified.\n─────────────────────────────────\n💡 Run chkd_resolve("${query}") after user confirms`
      }]
    };
  }
);

// chkd_resolve - Close a verified bug
server.tool(
  "chkd_resolve",
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
        text: `✅ Bug resolved: ${bug.title}\n📴 Debug session ended\n\n💭 Nice work. What's next?`
      }]
    };
  }
);

// chkd_checkin - Structured check-in
server.tool(
  "chkd_checkin",
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
        text += `  → Return to anchor or call chkd_pivot()\n`;
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

// chkd_pulse - Quick status update
server.tool(
  "chkd_pulse",
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

    let text = `💓 Pulse: ${status}\n`;
    text += `✓ Check-in recorded (timer reset)\n`;

    if (session?.currentTask) {
      text += `Task: ${session.currentTask.title}\n`;
      text += `Iteration: ${session.iteration || 1} • ${formatDuration(session.elapsedMs || 0)}\n`;
    }

    // Show anchor status
    const anchorResponse = await api.getAnchor(repoPath);
    const trackStatus = anchorResponse.data;
    if (trackStatus?.anchor) {
      if (trackStatus.onTrack) {
        text += `🎯 Anchor: ${trackStatus.anchor.title} ✓\n`;
      } else {
        text += `⚠️ OFF TRACK from anchor: ${trackStatus.anchor.title}\n`;
      }
    }

    if (queue.length > 0) {
      text += `\n📬 Queue (${queue.length}):\n`;
      queue.forEach((q: any) => {
        text += `  • ${q.title}\n`;
      });
    }

    text += `\n💭 Keep going. Pulse again in ~15 min or when you make progress.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_also - Log off-task work
server.tool(
  "chkd_also",
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

// chkd_tick - Mark item complete
server.tool(
  "chkd_tick",
  "Mark a spec item as complete. Use the item title or ID.",
  {
    item: z.string().describe("Item title or ID to mark complete")
  },
  async ({ item }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

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

    let text = `✅ Completed: ${item}`;

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

// chkd_working - Signal starting work on an item
server.tool(
  "chkd_working",
  "Signal you're starting work on a specific item. Updates the UI to show current focus.",
  {
    item: z.string().describe("Item title or ID you're starting")
  },
  async ({ item }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.markInProgress(repoPath, item);

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

    let text = `🔨 Working on: ${item}`;

    if (queue.length > 0) {
      text += `\n\n📬 Queue (${queue.length}):\n`;
      queue.forEach((q: any) => {
        text += `  • ${q.title}\n`;
      });
    }

    text += `\n\n💭 When done, run chkd_tick() immediately.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_suggest - Suggest what to work on
server.tool(
  "chkd_suggest",
  "Analyze the spec and suggest what to work on next. Use this to help the user decide their next task.",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    if (!fs.existsSync(specPath)) {
      return {
        content: [{
          type: "text",
          text: `No SPEC.md found. Can't suggest tasks without a spec.\n\n💡 Create docs/SPEC.md with your task list.`
        }]
      };
    }

    const specContent = fs.readFileSync(specPath, 'utf-8');
    const parser = new SpecParser();
    const spec = parser.parse(specContent);

    const bugsResponse = await api.getBugs(repoPath);
    const bugs = (bugsResponse.data || []).filter((b: any) => b.status !== 'fixed' && b.status !== 'wont_fix');
    const criticalBugs = bugs.filter((b: any) => b.severity === 'critical');
    const highBugs = bugs.filter((b: any) => b.severity === 'high');

    const allItems = spec.areas.flatMap(a => a.items.map(i => ({ ...i, area: a.name })));
    const incomplete = allItems.filter(i => !i.completed);
    const inProgress = incomplete.filter(i => i.status === 'in-progress');
    const notStarted = incomplete.filter(i => i.status !== 'in-progress');

    let text = `📊 Suggestion Analysis\n`;
    text += `═══════════════════════════════════════\n\n`;

    if (criticalBugs.length > 0) {
      text += `🔴 CRITICAL BUGS (fix first!):\n`;
      criticalBugs.forEach((b: any) => {
        text += `   • ${b.title}\n`;
      });
      text += `\n→ Suggestion: Fix critical bugs before new features.\n`;
      text += `  Use chkd_bugfix("${criticalBugs[0].title}")\n\n`;
    }

    if (inProgress.length > 0) {
      text += `🔨 IN PROGRESS (finish these):\n`;
      inProgress.forEach((item: any) => {
        text += `   • ${item.id} ${item.title}\n`;
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
        text += `   • ${item.id} ${item.title} (${item.area})\n`;
      });
      if (notStarted.length > 5) text += `   ... and ${notStarted.length - 5} more\n`;
      text += `\n→ Suggestion: Start with ${notStarted[0].id} ${notStarted[0].title}\n`;
    }

    const completed = allItems.length - incomplete.length;
    const pct = allItems.length > 0 ? Math.round((completed / allItems.length) * 100) : 0;

    text += `\n───────────────────────────────────────\n`;
    text += `Progress: ${pct}% | Bugs: ${bugs.length} | Remaining: ${incomplete.length}\n`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_pivot - Change anchor/focus
server.tool(
  "chkd_pivot",
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

// chkd_bugs - List open bugs
server.tool(
  "chkd_bugs",
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
          text: `🐛 No open bugs\n\n💭 Notice something wrong? Log it with chkd_bug()`
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

    text += `\n💭 Fix bugs with chkd_bugfix("title or id")`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_add - Add a feature to spec
server.tool(
  "chkd_add",
  "Add a new feature or task to the spec. Creates item with workflow sub-tasks.",
  {
    title: z.string().describe("Feature title (e.g., 'User authentication')"),
    areaCode: z.string().describe("Area code: SD, FE, BE, or FUT"),
    description: z.string().optional().describe("Optional description or user story"),
    tasks: z.array(z.string()).optional().describe("Optional custom sub-tasks (defaults to standard workflow)")
  },
  async ({ title, areaCode, description, tasks }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.addFeature(repoPath, title, areaCode, description, tasks);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    let text = `✅ Added: ${title}\n`;
    text += `Area: ${areaCode}\n`;
    text += `ID: ${response.data.itemId}\n`;
    if (tasks && tasks.length > 0) {
      text += `Tasks: ${tasks.length} custom sub-tasks\n`;
    } else {
      text += `Tasks: Standard workflow (6 phases)\n`;
    }
    text += `\n💡 Use chkd_working("${response.data.itemId}") to start working on it`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_add_child - Add sub-task to existing item
server.tool(
  "chkd_add_child",
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
    text += `\n💡 Use chkd_working("${title}") when ready to start`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_upgrade_mcp - Check server version and get upgrade instructions
server.tool(
  "chkd_upgrade_mcp",
  "Check which MCP server version you're using and get upgrade instructions if needed.",
  {},
  async () => {
    const repoPath = getRepoPath();
    const chkdPath = repoPath; // Assuming current project is chkd dev repo

    let text = `╔══════════════════════════════════════╗\n`;
    text += `║       MCP SERVER VERSION CHECK       ║\n`;
    text += `╚══════════════════════════════════════╝\n\n`;

    text += `✅ You're using the NEW HTTP-based server!\n\n`;
    text += `Server Type: ${SERVER_TYPE}\n`;
    text += `Version: ${SERVER_VERSION}\n\n`;
    text += `───────────────────────────────────────\n`;
    text += `Benefits of HTTP-based server:\n`;
    text += `• UI syncs automatically (no refresh!)\n`;
    text += `• Single source of truth (API)\n`;
    text += `• No database lock conflicts\n`;
    text += `• Better error handling\n`;
    text += `───────────────────────────────────────\n\n`;

    text += `🔄 TO UPGRADE OTHER PROJECTS:\n\n`;
    text += `If you have OTHER projects using chkd MCP,\n`;
    text += `update them to use the new server:\n\n`;
    text += `1. Open that project in Claude Code\n`;
    text += `2. Run these commands:\n`;
    text += `   claude mcp remove chkd\n`;
    text += `   claude mcp add chkd -- npx tsx ${chkdPath}/src/mcp/server-http.ts\n`;
    text += `3. Restart Claude Code\n\n`;
    text += `💡 The old server (server.ts) still works but\n`;
    text += `   doesn't have UI sync capabilities.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_win - Add quick win
server.tool(
  "chkd_win",
  "Add a quick win - small improvement or task to do later. Stored in docs/QUICKWINS.md.",
  {
    title: z.string().describe("Quick win title (e.g., 'Add syntax highlighting to code blocks')")
  },
  async ({ title }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    await api.createQuickWin(repoPath, title);

    return {
      content: [{
        type: "text",
        text: `✅ Quick win added: ${title}\n\n💡 View all with chkd_wins()`
      }]
    };
  }
);

// chkd_wins - List quick wins
server.tool(
  "chkd_wins",
  "List all quick wins from docs/QUICKWINS.md.",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.getQuickWins(repoPath);
    const wins = response.data || [];

    if (wins.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📝 No quick wins yet\n\n💡 Add one with chkd_win("title")`
        }]
      };
    }

    const pending = wins.filter((w: any) => !w.completed);
    const completed = wins.filter((w: any) => w.completed);

    let text = `📝 Quick Wins\n`;
    text += `═══════════════════════════════════════\n\n`;

    if (pending.length > 0) {
      text += `⬜ PENDING (${pending.length}):\n`;
      pending.forEach((w: any) => {
        text += `  • ${w.title}\n`;
      });
      text += `\n`;
    }

    if (completed.length > 0) {
      text += `✅ COMPLETED (${completed.length}):\n`;
      completed.forEach((w: any) => {
        text += `  • ${w.title}\n`;
      });
    }

    text += `\n💡 Complete with chkd_won("title")`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_won - Complete a quick win
server.tool(
  "chkd_won",
  "Mark a quick win as done (or reopen if already done). Use title or ID to find it.",
  {
    query: z.string().describe("Quick win title or ID")
  },
  async ({ query }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.completeQuickWin(repoPath, query);

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
        text: `✅ Quick win completed: ${query}\n\n💡 Nice! Keep knocking them out.`
      }]
    };
  }
);

// ============================================
// RESOURCES - The "Conscience" and Spec
// ============================================

server.resource(
  "chkd://conscience",
  "Current session state, guidance, and behavioral reminders. Read this to understand where you are and what you should be doing.",
  async () => {
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
          text += `│ Run: chkd_impromptu("${anchor.id}")     │\n`;
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
        text += `│  • chkd_status() - see what's next  │\n`;
        text += `│  • chkd_impromptu("desc") - ad-hoc  │\n`;
        text += `│  • chkd_debug("desc") - investigate │\n`;
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
      text += `│ • See bug? → chkd_bug() then move on│\n`;
      text += `│ • Off-task? → chkd_also() to log    │\n`;
      text += `│ • Progress? → chkd_pulse() visible  │\n`;
      text += `│ • Sub-item done? → chkd_tick() NOW  │\n`;
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
  "chkd://spec",
  "The current SPEC.md contents - task list, areas, and progress. Read this to understand what needs to be done.",
  async () => {
    const repoPath = getRepoPath();
    const specPath = path.join(repoPath, 'docs', 'SPEC.md');

    try {
      if (!fs.existsSync(specPath)) {
        return {
          contents: [{
            uri: "chkd://spec",
            mimeType: "text/plain",
            text: `No SPEC.md found at ${specPath}\n\nCreate one with areas and tasks to track.`
          }]
        };
      }

      const specContent = fs.readFileSync(specPath, 'utf-8');
      const parser = new SpecParser();
      const spec = parser.parse(specContent);

      let text = `╔══════════════════════════════════════╗\n`;
      text += `║            PROJECT SPEC              ║\n`;
      text += `╚══════════════════════════════════════╝\n\n`;

      const allItems = spec.areas.flatMap(a => a.items);
      const completed = allItems.filter(i => i.completed).length;
      const inProgress = allItems.filter(i => i.status === 'in-progress').length;
      const total = allItems.length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

      text += `Progress: ${pct}% (${completed}/${total} complete`;
      if (inProgress > 0) text += `, ${inProgress} in progress`;
      text += `)\n\n`;

      for (const area of spec.areas) {
        const areaItems = area.items;
        const areaCompleted = areaItems.filter(i => i.completed).length;
        const areaTotal = areaItems.length;

        text += `═══ ${area.name} (${areaCompleted}/${areaTotal}) ═══\n`;

        for (const item of areaItems) {
          const status = item.completed ? '✅' : item.status === 'in-progress' ? '🔨' : '⬜';
          text += `${status} ${item.id} ${item.title}\n`;

          if (item.children && item.children.length > 0) {
            for (const sub of item.children) {
              const subStatus = sub.completed ? '✅' : sub.status === 'in-progress' ? '🔨' : '  ';
              text += `   ${subStatus} ${sub.title}\n`;
            }
          }
        }
        text += `\n`;
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

// ============================================
// START SERVER
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("chkd MCP server (HTTP-based) running");
}

main().catch(console.error);
