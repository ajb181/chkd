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

// chkd_tag - Set tags on a spec item
server.tool(
  "chkd_tag",
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
        text: `🏷️ Tags set on ${itemId}: ${tagList}\n\n💡 Filter by tag in the UI or use #tag syntax in SPEC.md`
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

// chkd_attach - Attach a file to an item
server.tool(
  "chkd_attach",
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
        text: `📎 Attached: ${response.data.originalName}\n   To: ${itemType} ${itemId}\n   Path: ${response.data.path}\n\n💡 View attachments with chkd_attachments("${itemType}", "${itemId}")`
      }]
    };
  }
);

// chkd_attachments - List attachments for an item
server.tool(
  "chkd_attachments",
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
          text: `📎 No attachments found${itemType ? ` for ${itemType}${itemId ? ` ${itemId}` : ''}` : ''}\n\n💡 Attach files with chkd_attach("itemType", "itemId", "/path/to/file")`
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

// chkd_spawn_worker - Spawn a new worker
server.tool(
  "chkd_spawn_worker",
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
    text += `   Use chkd_workers() to monitor progress.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_workers - List active workers
server.tool(
  "chkd_workers",
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
          text: `👷 No active workers\n\n💡 Spawn one with chkd_spawn_worker("SD.1", "Task title")`
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
      text += `💡 Slot available! Spawn with chkd_spawn_worker()`;
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

// chkd_pause_worker - Pause a worker
server.tool(
  "chkd_pause_worker",
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
        text: `⏸️ Worker paused: ${workerId}\n\n💡 Resume with chkd_resume_worker("${workerId}")`
      }]
    };
  }
);

// chkd_resume_worker - Resume a paused worker
server.tool(
  "chkd_resume_worker",
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
        text: `▶️ Worker resumed: ${workerId}\n\n💡 Monitor with chkd_workers()`
      }]
    };
  }
);

// chkd_merge_worker - Merge a worker's branch
server.tool(
  "chkd_merge_worker",
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
      text += `   Or use chkd_resolve_conflicts() for auto-resolution.`;

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
          text: `🔄 Ready to merge (awaiting approval)\n\n💡 Run chkd_merge_worker("${workerId}", true) to merge now.`
        }]
      };
    }

    let text = `✅ Worker merged successfully!\n\n`;
    if (data.nextTask) {
      text += `📋 Next task ready: ${data.nextTask.taskId} - ${data.nextTask.taskTitle}\n`;
      text += `💡 Spawn a new worker for it with chkd_spawn_worker()`;
    } else {
      text += `💡 Worker complete. Check chkd_workers() for other active workers.`;
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_stop_worker - Stop and remove a worker
server.tool(
  "chkd_stop_worker",
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

// chkd_dead_workers - Check for dead workers
server.tool(
  "chkd_dead_workers",
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
          text: `✅ All ${totalActive} workers are healthy\n\n💡 No dead workers detected (threshold: ${thresholdMinutes || 2} min)`
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
    text += `  • chkd_stop_worker("workerId", true) - Stop and cleanup\n`;
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

// chkd_worker_heartbeat - Worker reports status
server.tool(
  "chkd_worker_heartbeat",
  "Send a heartbeat to report worker status. Workers should call this every 30 seconds to stay alive. Returns instructions if worker should pause/abort.",
  {
    workerId: z.string().describe("Your worker ID"),
    message: z.string().optional().describe("Brief status message (what you're doing)"),
    progress: z.number().min(0).max(100).optional().describe("Progress percentage (0-100)")
  },
  async ({ workerId, message, progress }) => {
    const response = await api.workerHeartbeat(workerId, message, progress);

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
      text += `   Check again with chkd_worker_heartbeat() in 30 seconds.`;
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

// chkd_worker_complete - Worker signals task completion
server.tool(
  "chkd_worker_complete",
  "Signal that your task is complete and ready for merge. Master Claude will handle the merge process.",
  {
    workerId: z.string().describe("Your worker ID"),
    summary: z.string().optional().describe("Brief summary of what was accomplished")
  },
  async ({ workerId, summary }) => {
    // First update worker message with summary
    if (summary) {
      await api.updateWorker(workerId, { message: summary, progress: 100 });
    }

    // Then trigger completion/merge
    const response = await api.completeWorker(workerId, true);

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

// chkd_worker_status - Worker checks its own status
server.tool(
  "chkd_worker_status",
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
// MANAGER RESEARCH TOOLS (MW.10)
// ============================================

// chkd_research_codebase - Get codebase overview
server.tool(
  "chkd_research_codebase",
  "Get an overview of the codebase structure. Use this before planning work to understand what exists.",
  {
    focus: z.string().optional().describe("Focus area: 'all', 'src', 'api', 'components', 'tests' (default: all)")
  },
  async ({ focus = 'all' }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const fs = await import('fs/promises');
    const path = await import('path');

    async function getDirectoryStructure(dir: string, depth: number = 0, maxDepth: number = 3): Promise<string[]> {
      if (depth >= maxDepth) return [];
      const lines: string[] = [];
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const filtered = entries.filter(e =>
          !e.name.startsWith('.') &&
          !['node_modules', 'build', 'dist', '.svelte-kit', 'coverage'].includes(e.name)
        );

        for (const entry of filtered.slice(0, 20)) {
          const indent = '  '.repeat(depth);
          if (entry.isDirectory()) {
            lines.push(`${indent}📁 ${entry.name}/`);
            const subLines = await getDirectoryStructure(path.join(dir, entry.name), depth + 1, maxDepth);
            lines.push(...subLines);
          } else {
            lines.push(`${indent}📄 ${entry.name}`);
          }
        }
        if (filtered.length > 20) {
          lines.push(`${'  '.repeat(depth)}... and ${filtered.length - 20} more`);
        }
      } catch {
        // Directory not accessible
      }
      return lines;
    }

    let targetDir = repoPath;
    if (focus === 'src') targetDir = path.join(repoPath, 'src');
    else if (focus === 'api') targetDir = path.join(repoPath, 'src', 'routes', 'api');
    else if (focus === 'components') targetDir = path.join(repoPath, 'src', 'lib', 'components');
    else if (focus === 'tests') targetDir = path.join(repoPath, 'tests');

    const structure = await getDirectoryStructure(targetDir);

    // Check for key files
    const keyFiles = ['package.json', 'tsconfig.json', 'svelte.config.js', 'vite.config.ts', 'docs/SPEC.md'];
    const existingKeys: string[] = [];
    for (const file of keyFiles) {
      try {
        await fs.access(path.join(repoPath, file));
        existingKeys.push(file);
      } catch {}
    }

    let text = `📊 Codebase Overview (${focus})\n`;
    text += `═══════════════════════════════════════\n\n`;
    text += `📍 Path: ${repoPath}\n`;
    text += `🔑 Key files: ${existingKeys.join(', ')}\n\n`;
    text += `📁 Structure:\n`;
    text += structure.join('\n');
    text += `\n\n💡 Use chkd_research_patterns to find specific patterns`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_research_patterns - Find existing patterns
server.tool(
  "chkd_research_patterns",
  "Find existing implementation patterns in the codebase. Helps understand how things are done before adding new code.",
  {
    pattern: z.enum(['auth', 'database', 'api', 'components', 'forms', 'state', 'tests', 'custom']).describe("Pattern type to search for"),
    customQuery: z.string().optional().describe("Custom search query (when pattern='custom')")
  },
  async ({ pattern, customQuery }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const patternQueries: Record<string, { query: string; fileTypes: string }> = {
      auth: { query: 'auth|login|session|jwt|token|password', fileTypes: '*.ts,*.js,*.svelte' },
      database: { query: 'prisma|sqlite|db\\.|database|query|select|insert', fileTypes: '*.ts,*.js' },
      api: { query: 'fetch|api|endpoint|POST|GET|DELETE|PATCH', fileTypes: '*.ts,*.js,*.svelte' },
      components: { query: 'export.*function|\\$props|createEventDispatcher', fileTypes: '*.svelte' },
      forms: { query: 'form|input|submit|validate|bind:value', fileTypes: '*.svelte' },
      state: { query: 'writable|readable|derived|\\$:|store', fileTypes: '*.ts,*.js,*.svelte' },
      tests: { query: 'describe|it\\(|test\\(|expect|vitest|jest', fileTypes: '*.test.ts,*.spec.ts' },
      custom: { query: customQuery || '', fileTypes: '*.ts,*.js,*.svelte' }
    };

    const { query, fileTypes } = patternQueries[pattern];
    if (!query) {
      return { content: [{ type: "text", text: "❌ Please provide customQuery when using pattern='custom'" }] };
    }

    let results: string[] = [];
    try {
      const { stdout } = await execAsync(
        `grep -r -l -E "${query}" --include="${fileTypes.split(',').join('" --include="')}" . 2>/dev/null | head -20`,
        { cwd: repoPath, maxBuffer: 1024 * 1024 }
      );
      results = stdout.trim().split('\n').filter(Boolean);
    } catch {
      // No matches or error
    }

    let text = `🔍 Pattern Search: ${pattern}\n`;
    text += `═══════════════════════════════════════\n\n`;
    text += `Query: ${query}\n`;
    text += `File types: ${fileTypes}\n\n`;

    if (results.length === 0) {
      text += `📭 No files found matching this pattern.\n`;
      text += `\n💡 This might be a new area - no existing patterns to follow.`;
    } else {
      text += `📄 Files with this pattern (${results.length}):\n`;
      for (const file of results) {
        text += `  • ${file.replace('./', '')}\n`;
      }
      text += `\n💡 Read these files to understand existing patterns before implementing similar features.`;
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_research_dependencies - Analyze what a file touches
server.tool(
  "chkd_research_dependencies",
  "Analyze what files import or are imported by a given file. Helps understand impact of changes.",
  {
    file: z.string().describe("File path (relative to repo root) to analyze")
  },
  async ({ file }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const path = await import('path');
    const fs = await import('fs/promises');
    const execAsync = promisify(exec);

    const fullPath = path.join(repoPath, file);
    let fileContent = '';
    try {
      fileContent = await fs.readFile(fullPath, 'utf-8');
    } catch {
      return { content: [{ type: "text", text: `❌ File not found: ${file}` }] };
    }

    // Find imports in this file
    const importRegex = /import\s+.*from\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match;
    while ((match = importRegex.exec(fileContent)) !== null) {
      imports.push(match[1]);
    }

    // Find files that import this file
    const fileName = path.basename(file).replace(/\.[^.]+$/, '');
    let importedBy: string[] = [];
    try {
      const { stdout } = await execAsync(
        `grep -r -l "${fileName}" --include="*.ts" --include="*.js" --include="*.svelte" . 2>/dev/null | head -15`,
        { cwd: repoPath }
      );
      importedBy = stdout.trim().split('\n').filter(f => f && f !== `./${file}`);
    } catch {}

    let text = `🔗 Dependency Analysis: ${file}\n`;
    text += `═══════════════════════════════════════\n\n`;

    text += `📥 This file imports (${imports.length}):\n`;
    if (imports.length === 0) {
      text += `  (no imports)\n`;
    } else {
      for (const imp of imports.slice(0, 15)) {
        text += `  • ${imp}\n`;
      }
      if (imports.length > 15) text += `  ... and ${imports.length - 15} more\n`;
    }

    text += `\n📤 Imported by (${importedBy.length}):\n`;
    if (importedBy.length === 0) {
      text += `  (not imported by other files)\n`;
    } else {
      for (const imp of importedBy) {
        text += `  • ${imp.replace('./', '')}\n`;
      }
    }

    text += `\n💡 Changes to this file may affect the files that import it.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_research_summary - Create research summary
server.tool(
  "chkd_research_summary",
  "Create a research summary to share with the user before starting work. Summarizes what you learned about the codebase.",
  {
    task: z.string().describe("The task or feature you're researching"),
    findings: z.array(z.string()).describe("Key findings from your research (3-7 bullet points)"),
    existingPatterns: z.array(z.string()).optional().describe("Existing patterns to follow"),
    filesToModify: z.array(z.string()).optional().describe("Files that will likely need changes"),
    risks: z.array(z.string()).optional().describe("Potential risks or concerns"),
    recommendation: z.string().describe("Your recommendation on how to proceed")
  },
  async ({ task, findings, existingPatterns, filesToModify, risks, recommendation }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    let text = `📋 Research Summary\n`;
    text += `═══════════════════════════════════════\n\n`;
    text += `🎯 Task: ${task}\n\n`;

    text += `🔍 Key Findings:\n`;
    for (const finding of findings) {
      text += `  • ${finding}\n`;
    }

    if (existingPatterns && existingPatterns.length > 0) {
      text += `\n📐 Existing Patterns to Follow:\n`;
      for (const pattern of existingPatterns) {
        text += `  • ${pattern}\n`;
      }
    }

    if (filesToModify && filesToModify.length > 0) {
      text += `\n📁 Files to Modify:\n`;
      for (const file of filesToModify) {
        text += `  • ${file}\n`;
      }
    }

    if (risks && risks.length > 0) {
      text += `\n⚠️ Potential Risks:\n`;
      for (const risk of risks) {
        text += `  • ${risk}\n`;
      }
    }

    text += `\n💡 Recommendation:\n${recommendation}\n`;
    text += `\n───────────────────────────────────────\n`;
    text += `Ready to proceed? Spawn workers with chkd_spawn_worker.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// ============================================
// MANAGER STORY WRITING TOOLS (MW.11)
// ============================================

// chkd_story_create - Create a structured story from user request
server.tool(
  "chkd_story_create",
  "Create a structured user story from a feature request. Use this to turn vague requests into well-defined stories.",
  {
    request: z.string().describe("The user's feature request"),
    context: z.string().optional().describe("Additional context about the codebase or requirements"),
    title: z.string().describe("A clear, concise title for the story"),
    userStory: z.string().describe("The 'As a... I want... So that...' format story"),
    acceptanceCriteria: z.array(z.string()).describe("List of testable acceptance criteria"),
    outOfScope: z.array(z.string()).optional().describe("What is explicitly NOT included")
  },
  async ({ request, context, title, userStory, acceptanceCriteria, outOfScope }) => {
    let text = `📖 User Story\n`;
    text += `═══════════════════════════════════════\n\n`;
    text += `📝 Original Request:\n"${request}"\n\n`;

    if (context) {
      text += `📍 Context:\n${context}\n\n`;
    }

    text += `───────────────────────────────────────\n\n`;
    text += `🎯 **${title}**\n\n`;
    text += `${userStory}\n\n`;

    text += `✅ Acceptance Criteria:\n`;
    for (let i = 0; i < acceptanceCriteria.length; i++) {
      text += `  ${i + 1}. ${acceptanceCriteria[i]}\n`;
    }

    if (outOfScope && outOfScope.length > 0) {
      text += `\n🚫 Out of Scope:\n`;
      for (const item of outOfScope) {
        text += `  • ${item}\n`;
      }
    }

    text += `\n───────────────────────────────────────\n`;
    text += `💡 Next: Use chkd_story_breakdown to create worker tasks`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_story_breakdown - Break story into worker-assignable tasks
server.tool(
  "chkd_story_breakdown",
  "Break a user story into worker-assignable sub-tasks. Creates tasks that can be assigned to parallel workers.",
  {
    storyTitle: z.string().describe("The story title"),
    tasks: z.array(z.object({
      id: z.string().describe("Task ID (e.g., T1, T2)"),
      title: z.string().describe("Task title"),
      description: z.string().describe("What this task involves"),
      dependencies: z.array(z.string()).optional().describe("IDs of tasks this depends on"),
      estimatedComplexity: z.enum(['small', 'medium', 'large']).describe("Size estimate"),
      files: z.array(z.string()).optional().describe("Files likely to be modified")
    })).describe("List of sub-tasks")
  },
  async ({ storyTitle, tasks }) => {
    let text = `📋 Task Breakdown: ${storyTitle}\n`;
    text += `═══════════════════════════════════════\n\n`;

    // Group by complexity
    const byComplexity = {
      small: tasks.filter(t => t.estimatedComplexity === 'small'),
      medium: tasks.filter(t => t.estimatedComplexity === 'medium'),
      large: tasks.filter(t => t.estimatedComplexity === 'large')
    };

    text += `📊 Summary: ${tasks.length} tasks\n`;
    text += `  • Small: ${byComplexity.small.length}\n`;
    text += `  • Medium: ${byComplexity.medium.length}\n`;
    text += `  • Large: ${byComplexity.large.length}\n\n`;

    text += `───────────────────────────────────────\n\n`;

    for (const task of tasks) {
      const complexityEmoji = task.estimatedComplexity === 'small' ? '🟢' :
                              task.estimatedComplexity === 'medium' ? '🟡' : '🔴';
      text += `${complexityEmoji} **${task.id}: ${task.title}**\n`;
      text += `   ${task.description}\n`;

      if (task.dependencies && task.dependencies.length > 0) {
        text += `   ⏳ Depends on: ${task.dependencies.join(', ')}\n`;
      }

      if (task.files && task.files.length > 0) {
        text += `   📁 Files: ${task.files.join(', ')}\n`;
      }
      text += `\n`;
    }

    // Suggest parallel execution
    const independent = tasks.filter(t => !t.dependencies || t.dependencies.length === 0);
    if (independent.length > 1) {
      text += `───────────────────────────────────────\n`;
      text += `💡 Parallelization Opportunity:\n`;
      text += `   ${independent.length} tasks can run in parallel: ${independent.map(t => t.id).join(', ')}\n`;
    }

    text += `\n💡 Next: Use chkd_story_present to show user for approval`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_story_present - Present story for user approval
server.tool(
  "chkd_story_present",
  "Present a complete story and task breakdown for user approval before spawning workers.",
  {
    title: z.string().describe("Story title"),
    userStory: z.string().describe("The user story"),
    acceptanceCriteria: z.array(z.string()).describe("Acceptance criteria"),
    tasks: z.array(z.object({
      id: z.string(),
      title: z.string(),
      complexity: z.enum(['small', 'medium', 'large']),
      canParallelize: z.boolean().describe("Can this run in parallel with others?")
    })).describe("Task summary"),
    parallelWorkers: z.number().describe("Suggested number of parallel workers"),
    estimatedScope: z.string().describe("Overall scope assessment (e.g., 'Medium - 2-3 hours with 2 workers')")
  },
  async ({ title, userStory, acceptanceCriteria, tasks, parallelWorkers, estimatedScope }) => {
    let text = `╔═══════════════════════════════════════════════════════════╗\n`;
    text += `║              📋 STORY READY FOR APPROVAL                  ║\n`;
    text += `╚═══════════════════════════════════════════════════════════╝\n\n`;

    text += `🎯 **${title}**\n\n`;
    text += `${userStory}\n\n`;

    text += `✅ Acceptance Criteria:\n`;
    for (let i = 0; i < acceptanceCriteria.length; i++) {
      text += `   ${i + 1}. ${acceptanceCriteria[i]}\n`;
    }
    text += `\n`;

    text += `📋 Tasks (${tasks.length}):\n`;
    for (const task of tasks) {
      const emoji = task.complexity === 'small' ? '🟢' :
                    task.complexity === 'medium' ? '🟡' : '🔴';
      const parallel = task.canParallelize ? '⚡' : '  ';
      text += `   ${emoji}${parallel} ${task.id}: ${task.title}\n`;
    }
    text += `\n`;

    text += `───────────────────────────────────────────────────────────\n`;
    text += `📊 Execution Plan:\n`;
    text += `   • Parallel Workers: ${parallelWorkers}\n`;
    text += `   • Scope: ${estimatedScope}\n`;
    text += `   ⚡ = Can run in parallel\n`;
    text += `───────────────────────────────────────────────────────────\n\n`;

    text += `❓ **Does this look right?**\n\n`;
    text += `If approved, I'll:\n`;
    text += `1. Add tasks to the spec\n`;
    text += `2. Spawn ${parallelWorkers} worker${parallelWorkers > 1 ? 's' : ''}\n`;
    text += `3. Begin implementation\n\n`;

    text += `Reply with approval or adjustments needed.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// ============================================
// MANAGER CODE REVIEW (MW.12)
// ============================================

// chkd_review_diff - Pull and diff worker branch
server.tool(
  "chkd_review_diff",
  "Get a diff summary of changes made by a worker. Use this to review what a worker has implemented before merging.",
  {
    branchName: z.string().describe("The worker's branch name to diff"),
    targetBranch: z.string().optional().default("main").describe("Branch to compare against (default: main)"),
    filesOnly: z.boolean().optional().describe("Only show file list, not full diff"),
    pathFilter: z.string().optional().describe("Filter to specific path (e.g., 'src/components')")
  },
  async ({ branchName, targetBranch, filesOnly, pathFilter }) => {
    let text = `📊 Code Review: ${branchName}\n`;
    text += `═══════════════════════════════════════\n\n`;
    text += `Comparing: ${branchName} → ${targetBranch}\n\n`;

    // This would be populated by actually running git commands
    // For now, provide structure for Claude to fill in after running git diff
    text += `🔍 **Review Checklist:**\n\n`;
    text += `Run these commands to review:\n\n`;
    text += `\`\`\`bash\n`;
    text += `# See all changed files\n`;
    text += `git diff --name-status ${targetBranch}...${branchName}`;
    if (pathFilter) text += ` -- ${pathFilter}`;
    text += `\n\n`;
    text += `# See full diff\n`;
    text += `git diff ${targetBranch}...${branchName}`;
    if (pathFilter) text += ` -- ${pathFilter}`;
    text += `\n\n`;
    text += `# See commit history\n`;
    text += `git log --oneline ${targetBranch}..${branchName}\n`;
    text += `\`\`\`\n\n`;

    text += `───────────────────────────────────────\n`;
    text += `💡 After reviewing, use:\n`;
    text += `• chkd_review_quality - Check code quality\n`;
    text += `• chkd_review_criteria - Verify acceptance criteria`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_review_quality - Check code quality
server.tool(
  "chkd_review_quality",
  "Evaluate code quality for a set of changes. Use this to document your code review findings.",
  {
    branchName: z.string().describe("Branch being reviewed"),
    patterns: z.object({
      followsExisting: z.boolean().describe("Does code follow existing patterns?"),
      patternNotes: z.string().optional().describe("Notes about pattern adherence")
    }).describe("Pattern check"),
    style: z.object({
      consistent: z.boolean().describe("Is style consistent with codebase?"),
      styleNotes: z.string().optional().describe("Notes about style issues")
    }).describe("Style check"),
    testing: z.object({
      hasTests: z.boolean().describe("Are there tests for new functionality?"),
      testsCoverage: z.enum(['none', 'partial', 'good', 'excellent']).describe("Test coverage level"),
      testNotes: z.string().optional().describe("Notes about testing")
    }).describe("Testing check"),
    issues: z.array(z.object({
      severity: z.enum(['critical', 'major', 'minor', 'suggestion']),
      file: z.string(),
      line: z.number().optional(),
      description: z.string()
    })).optional().describe("Specific issues found"),
    overallScore: z.enum(['approve', 'approve_with_suggestions', 'needs_changes', 'reject']).describe("Overall review result")
  },
  async ({ branchName, patterns, style, testing, issues, overallScore }) => {
    const scoreEmoji = {
      'approve': '✅',
      'approve_with_suggestions': '🟡',
      'needs_changes': '🟠',
      'reject': '❌'
    };

    let text = `📝 Code Quality Review: ${branchName}\n`;
    text += `═══════════════════════════════════════\n\n`;

    // Overall result
    text += `${scoreEmoji[overallScore]} **Result: ${overallScore.replace(/_/g, ' ').toUpperCase()}**\n\n`;

    // Pattern check
    text += `🔧 **Patterns:** ${patterns.followsExisting ? '✅ Follows existing' : '⚠️ Deviates'}\n`;
    if (patterns.patternNotes) text += `   ${patterns.patternNotes}\n`;
    text += `\n`;

    // Style check
    text += `🎨 **Style:** ${style.consistent ? '✅ Consistent' : '⚠️ Inconsistent'}\n`;
    if (style.styleNotes) text += `   ${style.styleNotes}\n`;
    text += `\n`;

    // Testing check
    const testEmoji = { none: '❌', partial: '🟡', good: '✅', excellent: '🌟' };
    text += `🧪 **Testing:** ${testEmoji[testing.testsCoverage]} ${testing.testsCoverage}\n`;
    text += `   Has tests: ${testing.hasTests ? 'Yes' : 'No'}\n`;
    if (testing.testNotes) text += `   ${testing.testNotes}\n`;
    text += `\n`;

    // Issues
    if (issues && issues.length > 0) {
      text += `───────────────────────────────────────\n`;
      text += `📋 Issues Found (${issues.length}):\n\n`;

      const severityOrder = ['critical', 'major', 'minor', 'suggestion'];
      const sortedIssues = [...issues].sort((a, b) =>
        severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)
      );

      const severityEmoji = { critical: '🔴', major: '🟠', minor: '🟡', suggestion: '💡' };
      for (const issue of sortedIssues) {
        text += `${severityEmoji[issue.severity]} **${issue.severity.toUpperCase()}** - ${issue.file}`;
        if (issue.line) text += `:${issue.line}`;
        text += `\n   ${issue.description}\n\n`;
      }
    }

    text += `───────────────────────────────────────\n`;
    if (overallScore === 'approve' || overallScore === 'approve_with_suggestions') {
      text += `✅ Ready for merge. Use worker complete flow to merge changes.`;
    } else {
      text += `⚠️ Changes needed before merge. Send feedback to worker.`;
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_review_criteria - Verify acceptance criteria
server.tool(
  "chkd_review_criteria",
  "Verify that acceptance criteria have been met by the worker's implementation. Use this to document criteria verification.",
  {
    storyTitle: z.string().describe("The story being verified"),
    criteria: z.array(z.object({
      criterion: z.string().describe("The acceptance criterion text"),
      met: z.boolean().describe("Is this criterion fully met?"),
      evidence: z.string().optional().describe("Evidence/notes for why it's met or not"),
      partiallyMet: z.boolean().optional().describe("Is it partially met?")
    })).describe("Criteria verification results"),
    additionalNotes: z.string().optional().describe("Any additional notes about the implementation")
  },
  async ({ storyTitle, criteria, additionalNotes }) => {
    const metCount = criteria.filter(c => c.met).length;
    const partialCount = criteria.filter(c => !c.met && c.partiallyMet).length;
    const notMetCount = criteria.filter(c => !c.met && !c.partiallyMet).length;

    let text = `✅ Acceptance Criteria Verification\n`;
    text += `═══════════════════════════════════════\n\n`;
    text += `📖 Story: ${storyTitle}\n\n`;

    // Summary
    text += `📊 Summary: ${metCount}/${criteria.length} criteria met\n`;
    if (partialCount > 0) text += `   (${partialCount} partially met)\n`;
    text += `\n`;

    // Progress bar
    const pct = Math.round((metCount / criteria.length) * 100);
    const filled = Math.round(pct / 5);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    text += `[${bar}] ${pct}%\n\n`;

    text += `───────────────────────────────────────\n\n`;

    // Individual criteria
    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      let emoji = c.met ? '✅' : (c.partiallyMet ? '🟡' : '❌');
      text += `${emoji} **${i + 1}. ${c.criterion}**\n`;
      if (c.evidence) {
        text += `   ${c.evidence}\n`;
      }
      text += `\n`;
    }

    if (additionalNotes) {
      text += `───────────────────────────────────────\n`;
      text += `📝 Notes:\n${additionalNotes}\n\n`;
    }

    text += `───────────────────────────────────────\n`;
    if (metCount === criteria.length) {
      text += `✅ All criteria met! Ready for final review and merge.`;
    } else if (notMetCount === 0) {
      text += `🟡 Some criteria partially met. Consider if acceptable or needs more work.`;
    } else {
      text += `❌ ${notMetCount} criteria not met. Worker needs to address these before merge.`;
    }

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_review_feedback - Send feedback to worker
server.tool(
  "chkd_review_feedback",
  "Send review feedback to a worker. Use this when issues are found that need to be addressed before merge.",
  {
    workerId: z.string().describe("Worker ID to send feedback to"),
    branchName: z.string().describe("Worker's branch name"),
    feedbackType: z.enum(['changes_requested', 'questions', 'suggestions']).describe("Type of feedback"),
    summary: z.string().describe("Brief summary of feedback"),
    items: z.array(z.object({
      file: z.string().optional().describe("File path if applicable"),
      line: z.number().optional().describe("Line number if applicable"),
      issue: z.string().describe("Description of the issue"),
      suggestion: z.string().optional().describe("Suggested fix")
    })).describe("Individual feedback items"),
    blocksApproval: z.boolean().describe("Does this feedback block merge approval?")
  },
  async ({ workerId, branchName, feedbackType, summary, items, blocksApproval }) => {
    let text = `📨 Review Feedback Sent\n`;
    text += `═══════════════════════════════════════\n\n`;

    const typeEmoji = {
      'changes_requested': '🔴',
      'questions': '❓',
      'suggestions': '💡'
    };

    text += `${typeEmoji[feedbackType]} **${feedbackType.replace(/_/g, ' ').toUpperCase()}**\n`;
    text += `Worker: ${workerId} (${branchName})\n`;
    text += `Blocks Merge: ${blocksApproval ? 'Yes' : 'No'}\n\n`;

    text += `📝 **Summary:** ${summary}\n\n`;

    text += `───────────────────────────────────────\n`;
    text += `📋 Feedback Items (${items.length}):\n\n`;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      text += `${i + 1}. `;
      if (item.file) {
        text += `**${item.file}`;
        if (item.line) text += `:${item.line}`;
        text += `**\n   `;
      }
      text += `${item.issue}\n`;
      if (item.suggestion) {
        text += `   💡 Suggestion: ${item.suggestion}\n`;
      }
      text += `\n`;
    }

    text += `───────────────────────────────────────\n`;
    text += `📡 Signal sent to worker. They will:\n`;
    text += `1. Receive this feedback\n`;
    text += `2. Make the requested changes\n`;
    text += `3. Signal back when ready for re-review\n\n`;
    text += `Use chkd_review_diff to review changes when worker signals completion.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_review_approve - Approve worker changes for merge
server.tool(
  "chkd_review_approve",
  "Approve a worker's changes and authorize merge. Use this after review passes all checks.",
  {
    workerId: z.string().describe("Worker ID to approve"),
    branchName: z.string().describe("Worker's branch name"),
    reviewSummary: z.string().describe("Summary of what was reviewed"),
    testsVerified: z.boolean().describe("Were tests verified to pass?"),
    qualityApproved: z.boolean().describe("Does code quality meet standards?"),
    criteriaApproved: z.boolean().describe("Are acceptance criteria met?"),
    mergeStrategy: z.enum(['squash', 'merge', 'rebase']).optional().default('squash').describe("How to merge (default: squash)"),
    notes: z.string().optional().describe("Any additional notes for the merge")
  },
  async ({ workerId, branchName, reviewSummary, testsVerified, qualityApproved, criteriaApproved, mergeStrategy, notes }) => {
    const allChecks = testsVerified && qualityApproved && criteriaApproved;

    let text = `✅ Review Approval\n`;
    text += `═══════════════════════════════════════\n\n`;

    text += `Worker: ${workerId}\n`;
    text += `Branch: ${branchName}\n`;
    text += `Merge Strategy: ${mergeStrategy}\n\n`;

    text += `📝 **Review Summary:**\n${reviewSummary}\n\n`;

    text += `───────────────────────────────────────\n`;
    text += `✓ Pre-Merge Checklist:\n\n`;
    text += `${testsVerified ? '✅' : '❌'} Tests verified\n`;
    text += `${qualityApproved ? '✅' : '❌'} Code quality approved\n`;
    text += `${criteriaApproved ? '✅' : '❌'} Acceptance criteria met\n\n`;

    if (notes) {
      text += `📝 Notes: ${notes}\n\n`;
    }

    text += `───────────────────────────────────────\n`;
    if (allChecks) {
      text += `✅ **APPROVED FOR MERGE**\n\n`;
      text += `Next steps:\n`;
      text += `1. Signal worker to complete\n`;
      text += `2. Worker merges branch to main\n`;
      text += `3. Worker cleans up worktree\n\n`;
      text += `Use the worker complete API to trigger merge.`;
    } else {
      text += `⚠️ **CANNOT APPROVE**\n\n`;
      text += `Some checks have not passed. Please address:\n`;
      if (!testsVerified) text += `• Verify tests pass\n`;
      if (!qualityApproved) text += `• Approve code quality\n`;
      if (!criteriaApproved) text += `• Verify acceptance criteria\n`;
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
// MANAGER DOCUMENTER (MW.13)
// ============================================

// chkd_docs_readme - Update README with new features
server.tool(
  "chkd_docs_readme",
  "Generate README updates for new features. Use this to document what was added after work completes.",
  {
    featureTitle: z.string().describe("Title of the new feature"),
    featureDescription: z.string().describe("Brief description of what the feature does"),
    usage: z.object({
      command: z.string().optional().describe("CLI command if applicable"),
      example: z.string().optional().describe("Usage example"),
      options: z.array(z.object({
        flag: z.string(),
        description: z.string()
      })).optional().describe("Command options if applicable")
    }).optional().describe("How to use the feature"),
    section: z.enum(['features', 'commands', 'api', 'configuration', 'other']).describe("Which README section this belongs in"),
    breaking: z.boolean().optional().describe("Is this a breaking change?")
  },
  async ({ featureTitle, featureDescription, usage, section, breaking }) => {
    let text = `📝 README Update Draft\n`;
    text += `═══════════════════════════════════════\n\n`;

    if (breaking) {
      text += `⚠️ **BREAKING CHANGE**\n\n`;
    }

    text += `Section: ${section.toUpperCase()}\n\n`;
    text += `───────────────────────────────────────\n\n`;

    text += `### ${featureTitle}\n\n`;
    text += `${featureDescription}\n\n`;

    if (usage) {
      if (usage.command) {
        text += `**Usage:**\n`;
        text += `\`\`\`bash\n${usage.command}\n\`\`\`\n\n`;
      }
      if (usage.example) {
        text += `**Example:**\n`;
        text += `\`\`\`\n${usage.example}\n\`\`\`\n\n`;
      }
      if (usage.options && usage.options.length > 0) {
        text += `**Options:**\n`;
        for (const opt of usage.options) {
          text += `| \`${opt.flag}\` | ${opt.description} |\n`;
        }
        text += `\n`;
      }
    }

    text += `───────────────────────────────────────\n`;
    text += `📍 Add this to the README.md in the "${section}" section.\n`;
    text += `Use the Edit tool to make the actual update.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_docs_changelog - Add CHANGELOG entry
server.tool(
  "chkd_docs_changelog",
  "Generate a CHANGELOG entry for completed work. Use this to document changes for releases.",
  {
    version: z.string().optional().describe("Version number (or 'Unreleased')"),
    date: z.string().optional().describe("Release date (YYYY-MM-DD format)"),
    changes: z.array(z.object({
      type: z.enum(['added', 'changed', 'deprecated', 'removed', 'fixed', 'security']),
      description: z.string(),
      issue: z.string().optional().describe("Issue/PR number if applicable")
    })).describe("List of changes")
  },
  async ({ version, date, changes }) => {
    let text = `📋 CHANGELOG Entry Draft\n`;
    text += `═══════════════════════════════════════\n\n`;

    const ver = version || 'Unreleased';
    const dt = date || new Date().toISOString().split('T')[0];

    text += `## [${ver}] - ${dt}\n\n`;

    // Group by type
    const typeOrder = ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security'];
    const typeLabels: Record<string, string> = {
      added: 'Added',
      changed: 'Changed',
      deprecated: 'Deprecated',
      removed: 'Removed',
      fixed: 'Fixed',
      security: 'Security'
    };

    for (const type of typeOrder) {
      const items = changes.filter(c => c.type === type);
      if (items.length > 0) {
        text += `### ${typeLabels[type]}\n`;
        for (const item of items) {
          text += `- ${item.description}`;
          if (item.issue) text += ` (#${item.issue})`;
          text += `\n`;
        }
        text += `\n`;
      }
    }

    text += `───────────────────────────────────────\n`;
    text += `📍 Add this to CHANGELOG.md (or create one if it doesn't exist).\n`;
    text += `Format follows Keep a Changelog (https://keepachangelog.com)`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_docs_api - Update API documentation
server.tool(
  "chkd_docs_api",
  "Generate API documentation for new or changed endpoints. Use this when API routes are modified.",
  {
    endpoint: z.string().describe("API endpoint path (e.g., /api/workers)"),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe("HTTP method"),
    description: z.string().describe("What this endpoint does"),
    request: z.object({
      params: z.array(z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
        description: z.string()
      })).optional().describe("URL parameters"),
      body: z.array(z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
        description: z.string()
      })).optional().describe("Request body fields")
    }).optional().describe("Request format"),
    response: z.object({
      success: z.string().describe("Success response format"),
      error: z.string().optional().describe("Error response format")
    }).describe("Response format"),
    example: z.object({
      request: z.string().optional(),
      response: z.string()
    }).optional().describe("Example request/response")
  },
  async ({ endpoint, method, description, request, response, example }) => {
    let text = `📚 API Documentation Draft\n`;
    text += `═══════════════════════════════════════\n\n`;

    text += `## \`${method} ${endpoint}\`\n\n`;
    text += `${description}\n\n`;

    if (request) {
      text += `### Request\n\n`;

      if (request.params && request.params.length > 0) {
        text += `**URL Parameters:**\n`;
        text += `| Name | Type | Required | Description |\n`;
        text += `|------|------|----------|-------------|\n`;
        for (const p of request.params) {
          text += `| \`${p.name}\` | ${p.type} | ${p.required ? 'Yes' : 'No'} | ${p.description} |\n`;
        }
        text += `\n`;
      }

      if (request.body && request.body.length > 0) {
        text += `**Body Parameters:**\n`;
        text += `| Name | Type | Required | Description |\n`;
        text += `|------|------|----------|-------------|\n`;
        for (const b of request.body) {
          text += `| \`${b.name}\` | ${b.type} | ${b.required ? 'Yes' : 'No'} | ${b.description} |\n`;
        }
        text += `\n`;
      }
    }

    text += `### Response\n\n`;
    text += `**Success:**\n\`\`\`json\n${response.success}\n\`\`\`\n\n`;
    if (response.error) {
      text += `**Error:**\n\`\`\`json\n${response.error}\n\`\`\`\n\n`;
    }

    if (example) {
      text += `### Example\n\n`;
      if (example.request) {
        text += `**Request:**\n\`\`\`bash\n${example.request}\n\`\`\`\n\n`;
      }
      text += `**Response:**\n\`\`\`json\n${example.response}\n\`\`\`\n\n`;
    }

    text += `───────────────────────────────────────\n`;
    text += `📍 Add this to the API documentation (e.g., docs/API.md).\n`;
    text += `Use the Edit tool to make the actual update.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_docs_comments - Suggest inline code comments
server.tool(
  "chkd_docs_comments",
  "Generate inline code comment suggestions for new or complex code. Use this to document tricky logic.",
  {
    file: z.string().describe("File path that needs comments"),
    comments: z.array(z.object({
      line: z.number().describe("Line number for the comment"),
      type: z.enum(['explanation', 'warning', 'todo', 'note']).describe("Type of comment"),
      text: z.string().describe("The comment text")
    })).describe("Comments to add"),
    summary: z.string().optional().describe("Optional file-level summary/header comment")
  },
  async ({ file, comments, summary }) => {
    let text = `💬 Inline Comment Suggestions\n`;
    text += `═══════════════════════════════════════\n\n`;

    text += `📄 File: ${file}\n\n`;

    if (summary) {
      text += `**File Summary:**\n`;
      text += `\`\`\`\n/**\n * ${summary}\n */\n\`\`\`\n\n`;
    }

    text += `───────────────────────────────────────\n`;
    text += `📋 Comments to add (${comments.length}):\n\n`;

    const typePrefix: Record<string, string> = {
      explanation: '//',
      warning: '// ⚠️ WARNING:',
      todo: '// TODO:',
      note: '// NOTE:'
    };

    for (const c of comments) {
      text += `**Line ${c.line}:**\n`;
      text += `\`\`\`\n${typePrefix[c.type]} ${c.text}\n\`\`\`\n\n`;
    }

    text += `───────────────────────────────────────\n`;
    text += `📍 Use the Edit tool to add these comments to the file.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// chkd_docs_commit - Prepare docs commit
server.tool(
  "chkd_docs_commit",
  "Generate a documentation commit message and prepare for merge. Use this after all doc updates are complete.",
  {
    featureRef: z.string().describe("Feature reference (e.g., MW.13 or SD.1)"),
    filesUpdated: z.array(z.string()).describe("List of documentation files updated"),
    summary: z.string().describe("Summary of documentation changes"),
    relatedCommit: z.string().optional().describe("Hash of related code commit")
  },
  async ({ featureRef, filesUpdated, summary, relatedCommit }) => {
    let text = `📝 Documentation Commit Ready\n`;
    text += `═══════════════════════════════════════\n\n`;

    text += `🏷️ Feature: ${featureRef}\n\n`;

    text += `📁 Files Updated:\n`;
    for (const f of filesUpdated) {
      text += `  • ${f}\n`;
    }
    text += `\n`;

    text += `───────────────────────────────────────\n`;
    text += `**Commit Message:**\n\n`;
    text += `\`\`\`\n`;
    text += `docs: Update documentation for ${featureRef}\n\n`;
    text += `${summary}\n\n`;
    text += `Files:\n`;
    for (const f of filesUpdated) {
      text += `- ${f}\n`;
    }
    if (relatedCommit) {
      text += `\nRelated: ${relatedCommit}\n`;
    }
    text += `\`\`\`\n\n`;

    text += `───────────────────────────────────────\n`;
    text += `📍 Commands to run:\n\n`;
    text += `\`\`\`bash\n`;
    text += `# Stage docs\n`;
    text += `git add ${filesUpdated.join(' ')}\n\n`;
    text += `# Commit\n`;
    text += `git commit -m "docs: Update documentation for ${featureRef}"\n`;
    text += `\`\`\`\n\n`;
    text += `Then merge with the feature branch or main as appropriate.`;

    return {
      content: [{
        type: "text",
        text
      }]
    };
  }
);

// ============================================
// EXTERNAL STORY SUBMISSION (MW.14)
// ============================================

// chkd_ideas_list - List submitted ideas
server.tool(
  "chkd_ideas_list",
  "List feature ideas submitted by stakeholders. Use this to see what ideas need review.",
  {
    status: z.enum(['all', 'submitted', 'reviewing', 'approved', 'rejected']).optional().default('all')
      .describe("Filter by status (default: all)")
  },
  async ({ status }) => {
    if (!currentRepoPath) {
      return {
        content: [{ type: "text", text: "No repo path set. Cannot list ideas." }]
      };
    }

    try {
      const filterParam = status === 'all' ? '' : `&status=${status}`;
      const res = await fetch(`${HTTP_BASE}/api/ideas?repoPath=${encodeURIComponent(currentRepoPath)}${filterParam}`);
      const data = await res.json();

      if (!data.success) {
        return {
          content: [{ type: "text", text: `Error: ${data.error}` }]
        };
      }

      const ideas = data.data || [];

      if (ideas.length === 0) {
        return {
          content: [{
            type: "text",
            text: `💡 No ideas found${status !== 'all' ? ` with status "${status}"` : ''}.`
          }]
        };
      }

      let text = `💡 Feature Ideas\n`;
      text += `═══════════════════════════════════════\n\n`;

      const statusEmoji: Record<string, string> = {
        submitted: '📥',
        reviewing: '🔍',
        approved: '✅',
        rejected: '❌'
      };

      // Group by status
      const byStatus = {
        submitted: ideas.filter((i: any) => i.status === 'submitted'),
        reviewing: ideas.filter((i: any) => i.status === 'reviewing'),
        approved: ideas.filter((i: any) => i.status === 'approved'),
        rejected: ideas.filter((i: any) => i.status === 'rejected')
      };

      for (const [stat, items] of Object.entries(byStatus)) {
        if (items.length > 0) {
          text += `${statusEmoji[stat]} **${stat.toUpperCase()}** (${items.length})\n`;
          for (const idea of items as any[]) {
            text += `  • [${idea.id}] ${idea.title}`;
            if (idea.submitterEmail) text += ` (${idea.submitterEmail})`;
            text += `\n`;
          }
          text += `\n`;
        }
      }

      text += `───────────────────────────────────────\n`;
      text += `💡 Use chkd_ideas_review to examine an idea in detail.`;

      return {
        content: [{ type: "text", text }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error listing ideas: ${error}` }]
      };
    }
  }
);

// chkd_ideas_review - Review a specific idea
server.tool(
  "chkd_ideas_review",
  "Review a specific idea in detail. Use this to understand what's being requested before approving/rejecting.",
  {
    query: z.string().describe("Idea ID or title to find")
  },
  async ({ query }) => {
    if (!currentRepoPath) {
      return {
        content: [{ type: "text", text: "No repo path set. Cannot review idea." }]
      };
    }

    try {
      const res = await fetch(`${HTTP_BASE}/api/ideas?repoPath=${encodeURIComponent(currentRepoPath)}`);
      const data = await res.json();

      if (!data.success) {
        return {
          content: [{ type: "text", text: `Error: ${data.error}` }]
        };
      }

      const ideas = data.data || [];
      const queryLower = query.toLowerCase();
      const idea = ideas.find((i: any) =>
        i.id === query ||
        i.id.startsWith(query) ||
        i.title.toLowerCase().includes(queryLower)
      );

      if (!idea) {
        return {
          content: [{ type: "text", text: `Idea not found: ${query}` }]
        };
      }

      const statusEmoji: Record<string, string> = {
        submitted: '📥 Submitted',
        reviewing: '🔍 Under Review',
        approved: '✅ Approved',
        rejected: '❌ Rejected'
      };

      let text = `💡 Idea Review\n`;
      text += `═══════════════════════════════════════\n\n`;

      text += `🏷️ **${idea.title}**\n`;
      text += `ID: ${idea.id}\n`;
      text += `Status: ${statusEmoji[idea.status]}\n`;
      if (idea.submitterEmail) {
        text += `Submitter: ${idea.submitterEmail}\n`;
      }
      text += `Submitted: ${idea.createdAt}\n\n`;

      text += `───────────────────────────────────────\n`;
      text += `📝 **Description:**\n\n${idea.description}\n\n`;

      if (idea.feedback) {
        text += `───────────────────────────────────────\n`;
        text += `💬 **Feedback:** ${idea.feedback}\n\n`;
      }

      if (idea.promotedTo) {
        text += `───────────────────────────────────────\n`;
        text += `✅ **Promoted to:** ${idea.promotedTo}\n\n`;
      }

      text += `───────────────────────────────────────\n`;
      text += `🎯 Actions:\n`;
      if (idea.status === 'submitted') {
        text += `• chkd_ideas_start_review - Start reviewing this idea\n`;
      }
      if (idea.status === 'submitted' || idea.status === 'reviewing') {
        text += `• chkd_ideas_approve - Approve and promote to spec\n`;
        text += `• chkd_ideas_reject - Reject with feedback\n`;
      }

      return {
        content: [{ type: "text", text }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error reviewing idea: ${error}` }]
      };
    }
  }
);

// chkd_ideas_start_review - Move idea to reviewing status
server.tool(
  "chkd_ideas_start_review",
  "Start reviewing a submitted idea. Moves it to 'reviewing' status.",
  {
    query: z.string().describe("Idea ID or title")
  },
  async ({ query }) => {
    if (!currentRepoPath) {
      return {
        content: [{ type: "text", text: "No repo path set." }]
      };
    }

    try {
      const res = await fetch(`${HTTP_BASE}/api/ideas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: currentRepoPath,
          query,
          status: 'reviewing'
        })
      });
      const data = await res.json();

      if (!data.success) {
        return {
          content: [{ type: "text", text: `Error: ${data.error}` }]
        };
      }

      return {
        content: [{
          type: "text",
          text: `🔍 Started review: ${data.data.title}\n\nThe idea is now in "Under Review" status.`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error}` }]
      };
    }
  }
);

// chkd_ideas_approve - Approve idea and promote to spec
server.tool(
  "chkd_ideas_approve",
  "Approve an idea and promote it to the spec. Creates a new spec item from the idea.",
  {
    query: z.string().describe("Idea ID or title"),
    areaCode: z.enum(['SD', 'FE', 'BE', 'FUT']).describe("Area for the new spec item"),
    title: z.string().optional().describe("Override title for spec item (uses idea title if not provided)"),
    feedback: z.string().optional().describe("Optional feedback message for the submitter")
  },
  async ({ query, areaCode, title, feedback }) => {
    if (!currentRepoPath) {
      return {
        content: [{ type: "text", text: "No repo path set." }]
      };
    }

    try {
      // First, get the idea details
      const listRes = await fetch(`${HTTP_BASE}/api/ideas?repoPath=${encodeURIComponent(currentRepoPath)}`);
      const listData = await listRes.json();
      const queryLower = query.toLowerCase();
      const idea = listData.data?.find((i: any) =>
        i.id === query || i.id.startsWith(query) || i.title.toLowerCase().includes(queryLower)
      );

      if (!idea) {
        return {
          content: [{ type: "text", text: `Idea not found: ${query}` }]
        };
      }

      const specTitle = title || idea.title;

      // Add to spec
      const addRes = await fetch(`${HTTP_BASE}/api/spec/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: currentRepoPath,
          title: specTitle,
          areaCode,
          story: idea.description
        })
      });
      const addData = await addRes.json();

      if (!addData.success) {
        return {
          content: [{ type: "text", text: `Failed to add to spec: ${addData.error}` }]
        };
      }

      const specItemId = addData.data?.itemId || `${areaCode}.?`;

      // Update idea status to approved
      const approveRes = await fetch(`${HTTP_BASE}/api/ideas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: currentRepoPath,
          query: idea.id,
          status: 'approved',
          feedback: feedback || 'Approved and added to development spec',
          promotedTo: specItemId
        })
      });
      const approveData = await approveRes.json();

      if (!approveData.success) {
        return {
          content: [{ type: "text", text: `Added to spec but failed to update idea: ${approveData.error}` }]
        };
      }

      let text = `✅ Idea Approved!\n`;
      text += `═══════════════════════════════════════\n\n`;
      text += `📝 **${idea.title}**\n\n`;
      text += `Promoted to: **${specItemId}** in ${areaCode} area\n`;
      if (feedback) {
        text += `Feedback: ${feedback}\n`;
      }
      text += `\n`;
      text += `The submitter${idea.submitterEmail ? ` (${idea.submitterEmail})` : ''} can now track progress via the spec.`;

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

// chkd_ideas_reject - Reject idea with feedback
server.tool(
  "chkd_ideas_reject",
  "Reject an idea with feedback explaining why. The submitter will see this feedback.",
  {
    query: z.string().describe("Idea ID or title"),
    feedback: z.string().describe("Feedback explaining why the idea was rejected")
  },
  async ({ query, feedback }) => {
    if (!currentRepoPath) {
      return {
        content: [{ type: "text", text: "No repo path set." }]
      };
    }

    try {
      const res = await fetch(`${HTTP_BASE}/api/ideas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: currentRepoPath,
          query,
          status: 'rejected',
          feedback
        })
      });
      const data = await res.json();

      if (!data.success) {
        return {
          content: [{ type: "text", text: `Error: ${data.error}` }]
        };
      }

      let text = `❌ Idea Rejected\n`;
      text += `═══════════════════════════════════════\n\n`;
      text += `📝 **${data.data.title}**\n\n`;
      text += `💬 Feedback: ${feedback}\n\n`;
      text += `The idea has been moved to the Rejected section with your feedback.`;

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
// SPEC MAINTENANCE TOOLS
// ============================================

// chkd_transfer - Transfer an item to a different repo
server.tool(
  "chkd_transfer",
  "Transfer a spec item from the current repo to another repo. Use when an item was created in the wrong project.",
  {
    itemId: z.string().describe("Item ID or title to transfer (e.g., 'SD.1' or 'User auth')"),
    targetRepoPath: z.string().describe("Path to the target repository"),
    targetAreaCode: z.string().describe("Target area code in destination repo (SD, FE, BE, FUT)")
  },
  async ({ itemId, targetRepoPath, targetAreaCode }) => {
    if (!currentRepoPath) {
      return {
        content: [{ type: "text", text: "No repo path set." }]
      };
    }

    try {
      const res = await fetch(`${HTTP_BASE}/api/spec/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceRepoPath: currentRepoPath,
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

// chkd_spec_check - Validate SPEC.md format
server.tool(
  "chkd_spec_check",
  "Validate SPEC.md format and find issues. Use --fix to auto-fix some problems.",
  {
    fix: z.boolean().optional().describe("Auto-fix fixable issues (default: false)")
  },
  async ({ fix = false }) => {
    if (!currentRepoPath) {
      return {
        content: [{ type: "text", text: "No repo path set." }]
      };
    }

    try {
      const res = await fetch(`${HTTP_BASE}/api/spec/validate?repoPath=${encodeURIComponent(currentRepoPath)}&fix=${fix}`);
      const data = await res.json();

      if (!data.success) {
        return {
          content: [{ type: "text", text: `Error: ${data.error}` }]
        };
      }

      const { valid, issues, fixed } = data.data;

      if (valid && issues.length === 0) {
        return {
          content: [{ type: "text", text: "✅ SPEC.md is valid - no issues found" }]
        };
      }

      let text = `${valid ? '⚠️' : '❌'} SPEC.md Validation Results\n`;
      text += `═══════════════════════════════════════\n\n`;

      if (issues.length > 0) {
        const errors = issues.filter((i: any) => i.type === 'error');
        const warnings = issues.filter((i: any) => i.type === 'warning');

        if (errors.length > 0) {
          text += `**Errors (${errors.length}):**\n`;
          for (const issue of errors) {
            text += `  ❌ Line ${issue.line || '?'}: ${issue.message}\n`;
          }
          text += `\n`;
        }

        if (warnings.length > 0) {
          text += `**Warnings (${warnings.length}):**\n`;
          for (const issue of warnings) {
            text += `  ⚠️ Line ${issue.line || '?'}: ${issue.message}\n`;
          }
          text += `\n`;
        }
      }

      if (fixed && fixed.length > 0) {
        text += `**Fixed (${fixed.length}):**\n`;
        for (const f of fixed) {
          text += `  ✓ ${f}\n`;
        }
        text += `\n`;
      }

      if (!fix && issues.some((i: any) => i.fixable)) {
        text += `💡 Run chkd_spec_check(fix: true) to auto-fix some issues`;
      }

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

// chkd_spec_repair - Repair/reformat SPEC.md using AI
server.tool(
  "chkd_spec_repair",
  "Reformat SPEC.md using AI to fix formatting issues. Creates a backup before modifying.",
  {},
  async () => {
    if (!currentRepoPath) {
      return {
        content: [{ type: "text", text: "No repo path set." }]
      };
    }

    try {
      const res = await fetch(`${HTTP_BASE}/api/spec/repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: currentRepoPath })
      });
      const data = await res.json();

      if (!data.success) {
        return {
          content: [{ type: "text", text: `Error: ${data.error}` }]
        };
      }

      let text = `✅ SPEC.md Repaired\n`;
      text += `═══════════════════════════════════════\n\n`;
      text += `📁 Backup saved to: docs/SPEC-backup.md\n`;
      text += `📊 Result: ${data.data.totalItems} items across ${data.data.areaCount} areas\n`;
      text += `📈 Progress: ${data.data.progress}% complete`;

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
// START SERVER
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("chkd MCP server (HTTP-based) running");
}

main().catch(console.error);
