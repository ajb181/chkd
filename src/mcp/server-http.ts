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
import crypto from 'crypto';
import { execSync } from 'child_process';

// HTTP client for API calls
import * as api from './http-client.js';
import { BASE_URL as HTTP_BASE } from './http-client.js';
import { VERSION } from '../lib/version.js';

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
  if (session.mode === 'impromptu') {
    nudges.push(`⚡ Impromptu: Log what you did when done`);
  }

  return nudges;
}

function formatNudges(nudges: string[]): string {
  if (nudges.length === 0) return '';
  return `\n───────────────────\n` + nudges.join('\n');
}

// Get type/area-specific guidance for working/tick
interface TypeAreaContext {
  workflowType: string | null;
  areaCode: string;
}

function getWorkingGuidance(ctx: TypeAreaContext): string[] {
  const guidance: string[] = [];
  
  // Workflow type guidance
  switch (ctx.workflowType) {
    case 'quickwin':
      guidance.push(`⏱️ QUICK WIN: Keep it under 30 min. If it's growing, stop and reassess.`);
      break;
    case 'refactor':
      guidance.push(`🔄 REFACTOR: No behavior changes! Tests must pass before AND after.`);
      break;
    case 'audit':
      guidance.push(`📋 AUDIT: Document findings. No fixes yet - just investigate and report.`);
      break;
    case 'remove':
      guidance.push(`🗑️ REMOVE: Check dependencies first. What breaks if this goes away?`);
      break;
  }
  
  // Area code guidance
  switch (ctx.areaCode) {
    case 'FE':
      guidance.push(`🖼️ FRONTEND: Check all states — loading, error, empty, success.`);
      break;
    case 'BE':
      guidance.push(`📡 BACKEND: API contract first. Document the interface before implementing.`);
      break;
    case 'SD':
      guidance.push(`📐 SYSTEM DESIGN: Think architecture. Consider scale, failure modes, edge cases.`);
      break;
    case 'BUG':
      guidance.push(`🐛 DEBUG MODE — You are an expert debugger. Slow down.`);
      guidance.push(``);
      guidance.push(`• Don't rush to solutions — understand the problem first`);
      guidance.push(`• If 1st/2nd attempt fails → web search, ask user for help`);
      guidance.push(`• Ask user to help debug — they know the codebase`);
      guidance.push(`• Collaborate on testing — you don't need to do it all`);
      guidance.push(`• Share your hypothesis before implementing fixes`);
      break;
  }

  return guidance;
}

function getTickGuidance(ctx: TypeAreaContext): string[] {
  const guidance: string[] = [];
  
  // Workflow type guidance
  switch (ctx.workflowType) {
    case 'quickwin':
      guidance.push(`⚡ Quick win step done. Still on track for <30 min?`);
      break;
    case 'refactor':
      guidance.push(`🔄 Refactor step done. Behavior unchanged? Tests still passing?`);
      break;
    case 'audit':
      guidance.push(`📋 Audit step done. Capture findings in docs before moving on.`);
      break;
    case 'remove':
      guidance.push(`🗑️ Removal step done. Verify nothing is broken.`);
      break;
  }
  
  // Area code guidance
  switch (ctx.areaCode) {
    case 'FE':
      guidance.push(`🖼️ Did you test all UI states? Visual check complete?`);
      break;
    case 'BE':
      guidance.push(`📡 API response matches contract? Error handling in place?`);
      break;
  }
  
  return guidance;
}

// Server version identifier
const SERVER_TYPE = "http-based";
const SERVER_VERSION = VERSION;  // From shared src/lib/version.ts

// Version sync check - compares local file hash with server's expected hash
let versionCheckDone = false;
let versionMismatch: { local: string; server: string } | null = null;

function getLocalMcpHash(): string {
  try {
    const mcpPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'server-http.ts');
    const content = fs.readFileSync(mcpPath, 'utf-8');
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
  } catch {
    return 'unknown';
  }
}

async function checkVersionSync(): Promise<void> {
  if (versionCheckDone) return;
  versionCheckDone = true;
  
  try {
    const response = await fetch(`${HTTP_BASE}/api/version`);
    if (!response.ok) return;
    
    const data = await response.json();
    if (!data.success) return;
    
    const localHash = getLocalMcpHash();
    const serverHash = data.data.mcpHash;
    
    if (localHash !== serverHash && localHash !== 'unknown' && serverHash !== 'unknown') {
      versionMismatch = { local: localHash, server: serverHash };
    }
  } catch {
    // Server not reachable, skip check
  }
}

function getVersionWarning(): string {
  if (!versionMismatch) return '';
  return `\n⚠️ MCP OUT OF SYNC (local: ${versionMismatch.local}, server: ${versionMismatch.server})\n   Restart Claude Code to pick up latest changes.\n`;
}

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

// sync - Register project and sync files from templates (delegates to API)
server.tool(
  "sync",
  "Register project with chkd and sync files from templates. Updates CLAUDE.md, docs/, and skills/.",
  {},
  async () => {
    const repoPath = getRepoPath();
    const projectName = path.basename(repoPath);

    // Call the API endpoint which has the canonical sync logic
    try {
      const response = await fetch(`${HTTP_BASE}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath })
      });

      const result = await response.json();

      if (!result.success) {
        return {
          content: [{
            type: "text",
            text: `❌ Sync failed: ${result.error}`
          }]
        };
      }

      let text = `🔄 SYNC: ${projectName}\n`;
      text += `═══════════════════════════════════════\n`;
      text += `MCP: v${SERVER_VERSION}${isServerStale() ? ' ⚠️ STALE - restart Claude Code' : ''}\n\n`;

      // Show results from API
      if (result.data?.results) {
        result.data.results.forEach((r: string) => {
          text += `${r}\n`;
        });
      }

      text += `\n───────────────────────────────────────\n`;
      text += `✅ Sync complete!\n\n`;
      text += `Next: status() to see current state\n`;

      return {
        content: [{
          type: "text",
          text
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ Cannot connect to chkd server.\n\nMake sure the web server is running (npm run dev or npm run stable)`
        }]
      };
    }
  }
);

// status - Get current project status
server.tool(
  "status",
  "Get current chkd project status, progress, and active task. Run this first to understand where you are.",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);
    
    // Check version sync (runs once)
    await checkVersionSync();

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

    // Get queue
    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];

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
      statusText += `MCP: ${SERVER_TYPE} v${SERVER_VERSION} [${getLocalMcpHash()}]${isServerStale() ? ' ⚠️ STALE' : ''}`;
      statusText += getVersionWarning();
      statusText += `\n`;
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
          statusText += `💡 Start with impromptu()\n`;
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

      // Get nudges
      const nudges = await getContextualNudges(session, queue, repoPath);
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

// done - End the current session
server.tool(
  "done",
  "End the current session (impromptu or feature work). Clears the active state.",
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
    
    const queueResponse = await api.getQueue(repoPath);
    const queue = queueResponse.data?.items || [];
    
    let text = `✅ Session ended: ${taskTitle}\n📊 Duration: ${duration}\n`;
    
    // Context-aware next step suggestions
    text += `\n───────────────────────────────────────`;
    text += `\nWHAT'S NEXT?`;
    
    if (queue.length > 0) {
      text += `\n• 📬 Queue has ${queue.length} message(s) from user - check these first`;
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

// ReviewDone - Log completed code review
server.tool(
  "ReviewDone",
  "Log completed code review. Required before ticking main item as done.",
  {
    itemId: z.string().describe("Item ID (e.g., BE.45)"),
    summary: z.string().describe("Review summary: what passed, any concerns addressed")
  },
  async ({ itemId, summary }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    // Validate summary length
    if (!summary || summary.trim().length < 10) {
      return {
        content: [{
          type: "text",
          text: `❌ Review summary must be at least 10 characters\n\nProvide a meaningful summary of what was reviewed and approved.`
        }]
      };
    }

    // Find the item in DB
    const findResponse = await api.findSpecItem(repoPath, itemId);
    if (!findResponse.success || !findResponse.data?.items?.length) {
      return {
        content: [{
          type: "text",
          text: `❌ Item not found: ${itemId}`
        }]
      };
    }

    const item = findResponse.data.items[0];

    // Mark review completed in DB
    const response = await fetch(`${HTTP_BASE}/api/spec/review-done`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPath, itemId: item.id, summary })
    });

    const result = await response.json();
    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${result.error}`
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: `✅ Review logged for ${itemId}\n\n${summary}\n\n💡 You can now tick("${itemId}") to complete all checkpoints.`
      }]
    };
  }
);

// list_reviews - Show completed reviews
server.tool(
  "list_reviews",
  "List all completed code reviews from review.log",
  {
    limit: z.number().optional().describe("Max reviews to show (default: 10)")
  },
  async ({ limit = 10 }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const logPath = path.join(repoPath, '.chkd', 'review.log');

    if (!fs.existsSync(logPath)) {
      return {
        content: [{
          type: "text",
          text: `📝 No reviews logged yet\n\n💡 Reviews are logged with ReviewDone(itemId, summary)`
        }]
      };
    }

    const logs = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    const reviews = logs
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-limit);

    if (reviews.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📝 No reviews found in log`
        }]
      };
    }

    let text = `📋 Code Reviews (${reviews.length}):\n\n`;
    reviews.forEach((review: any) => {
      const date = new Date(review.timestamp).toLocaleString();
      text += `✅ ${review.itemId} - ${date}\n`;
      text += `   ${review.summary}\n\n`;
    });

    return {
      content: [{
        type: "text",
        text
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
    try {
      const repoPath = getRepoPath();
      await requireRepo(repoPath);

      // Get full title and context from DB
      let fullTitle = item;
      let workflowType: string | null = null;
      let areaCode = 'SD';
      const findResponse = await api.findSpecItem(repoPath, item);
      if (findResponse.success && findResponse.data?.items?.length > 0) {
        const foundItem = findResponse.data.items[0];
        fullTitle = foundItem.title;
        workflowType = foundItem.workflowType || null;
        areaCode = foundItem.areaCode || 'SD';
      }
      // If not found, use the input as-is - the tick API will error if invalid

      // Check if this is a parent item (e.g., BE.45 not BE.45.1.1)
      const isParentItem = /^[A-Z]+\.\d+$/.test(item);

      if (isParentItem && findResponse.success && findResponse.data?.items?.length > 0) {
        // Parent items require ReviewDone to be called first
        const foundItem = findResponse.data.items[0];
        if (!foundItem.reviewCompleted) {
          return {
            content: [{
              type: "text",
              text: `❌ Cannot complete ${item}\n\n` +
                    `REQUIRED: Run code review and call ReviewDone() first.\n\n` +
                    `Steps:\n` +
                    `1. Run: /deep-review\n` +
                    `2. Review the results with user, get approval\n` +
                    `3. Call: ReviewDone("${item}", "Passed: [summary of review]")\n` +
                    `4. Then: tick("${item}")\n\n` +
                    `This ensures code quality before marking work complete.`
            }]
          };
        }
      }

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

      // If this was a parent item, all children were marked done
      if (isParentItem) {
        text += `\n\n🎉 All checkpoints marked complete!`;
      }

      // Check if this was a Confirm step - remind about user approval
      const lowerTitle = fullTitle.toLowerCase();
      if (lowerTitle.includes('confirm') || lowerTitle.includes('approval') || lowerTitle.includes('verify')) {
        text += `\n\n⚠️  CHECKPOINT: Did you get explicit user approval?`;
        text += `\n   If not, discuss with user before proceeding.`;
      }

      // Add type/area-specific guidance
      const tickGuidance = getTickGuidance({ workflowType, areaCode });
      if (tickGuidance && tickGuidance.length > 0) {
        text += `\n\n` + tickGuidance.join('\n');
      }

      if (queue && queue.length > 0) {
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
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `❌ ${err instanceof Error ? err.message : String(err)}`
        }]
      };
    }
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
    try {
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
                (tbcResponse.data.tbcFields || []).map((f: string) => `  • ${f}`).join('\n') + '\n\n' +
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

      // Get full title and context from DB
      let fullTitle = item;
      let workflowType: string | null = null;
      let areaCode = 'SD';
      const findResponse = await api.findSpecItem(repoPath, item);
      if (findResponse.success && findResponse.data?.items?.length > 0) {
        const foundItem = findResponse.data.items[0];
        fullTitle = foundItem.title;
        workflowType = foundItem.workflowType || null;
        areaCode = foundItem.areaCode || 'SD';
      }
      // If not found, use the input as-is

      const queueResponse = await api.getQueue(repoPath);
      const queue = queueResponse.data?.items || [];

      // Check if this is a parent item with children
      let children: any[] = [];
      let isParent = false;
      let firstIncomplete: any = null;

      if (findResponse.success && findResponse.data?.items?.length > 0) {
        const foundItem = findResponse.data.items[0];
        const allItemsResponse = await api.getSpecItems(repoPath, {});
        if (allItemsResponse.success && allItemsResponse.data?.items) {
          children = allItemsResponse.data.items.filter(
            (i: any) => i.parentId === foundItem.id
          );
          isParent = children.length > 0;
          // Sort by displayId for consistent ordering
          children.sort((a: any, b: any) => a.displayId.localeCompare(b.displayId));
          firstIncomplete = children.find((c: any) => c.status !== 'done');
        }
      }

      let text = '';

      if (isParent) {
        // Parent item - show overview with full context
        const foundItem = findResponse.data.items[0];
        const doneCount = children.filter((c: any) => c.status === 'done').length;
        const totalCount = children.length;
        text = `📋 ${fullTitle}`;
        text += `\n   Progress: ${doneCount}/${totalCount} checkpoints complete`;

        // MANDATORY INSTRUCTIONS FIRST - agent must see these before context
        const incomplete = children.filter((c: any) => c.status !== 'done');
        if (incomplete.length > 0) {
          text += `\n\n⚠️ STOP — Create your task list NOW before doing anything else.`;
          text += `\nRun TaskCreate() for EACH checkpoint below. Do NOT skip this step.\n`;
          incomplete.forEach((child: any) => {
            text += `\nTaskCreate("${child.title}")`;
          });

          text += `\n\n📖 Read docs/AGENT-GOVERNANCE.md before starting.`;
          text += `\n📁 Keep files in docs/${foundItem.displayId}/`;
          text += `\n📝 Write a short summary of bug/fix/test to docs/${foundItem.displayId}/fix.md — do NOT skip this.`;
        } else {
          text += `\n\n✅ All checkpoints complete! Run tick("${item}") to finish.`;
        }

        // Show design file link
        if (foundItem.designFile) {
          text += `\n\n📄 DESIGN FILE: ${foundItem.designFile}`;
          text += `\n   Read this before any implementation.`;
        }

        // Show description/story if available
        if (foundItem.description) {
          text += `\n\n📝 DESCRIPTION:\n${foundItem.description}`;
        }
        if (foundItem.story && foundItem.story !== foundItem.description) {
          text += `\n\n📖 USER STORY:\n${foundItem.story}`;
        }

        // Show key requirements
        if (foundItem.keyRequirements && foundItem.keyRequirements.length > 0) {
          text += `\n\n✅ KEY REQUIREMENTS:`;
          foundItem.keyRequirements.forEach((req: string) => {
            text += `\n  • ${req}`;
          });
        }

        // Show files to change
        if (foundItem.filesToChange && foundItem.filesToChange.length > 0) {
          text += `\n\n📁 FILES TO CHANGE:`;
          foundItem.filesToChange.forEach((file: string) => {
            text += `\n  • ${file}`;
          });
        }

        // Show testing criteria
        if (foundItem.testing && foundItem.testing.length > 0) {
          text += `\n\n🧪 TESTING:`;
          foundItem.testing.forEach((test: string) => {
            text += `\n  • ${test}`;
          });
        }

        text += `\n\n✅ When done: tick("${foundItem.displayId}")`;
      } else {
        // Leaf checkpoint - show working state
        text = `🔨 Working on: ${fullTitle}`;

        // Add type/area-specific guidance
        const workingGuidance = getWorkingGuidance({ workflowType, areaCode });
        if (workingGuidance && workingGuidance.length > 0) {
          text += `\n\n` + workingGuidance.join('\n');
        }

        // Check if this is a Confirm/Verify step
        const lowerTitle = fullTitle.toLowerCase();
        if (lowerTitle.includes('confirm') || lowerTitle.includes('approval') || lowerTitle.includes('verify')) {
          text += `\n\n🛑 USER APPROVAL REQUIRED`;
          text += `\n   Show your findings → wait for user "yes" → then tick.`;
        }

        text += `\n\n💭 When done, run tick("${item}")`;
      }

      if (queue && queue.length > 0) {
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
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `❌ ${err instanceof Error ? err.message : String(err)}`
        }]
      };
    }
  }
);

// add - Add a feature to spec
server.tool(
  "add",
  "Add a new feature or task to the spec. Creates item with workflow sub-tasks. IMPORTANT: Requires a design file - write your design first, then pass the path.",
  {
    title: z.string().describe("Feature title (e.g., 'User authentication')"),
    areaCode: z.string().describe("Area code: SD, FE, BE, or FUT"),
    designFile: z.string().describe("Path to design file (REQUIRED). Write your design to docs/designs/my-feature.md first, then pass that path here. File is moved to docs/{ITEM.ID}/design.md"),
    description: z.string().optional().describe("Optional description or user story"),
    keyRequirements: z.array(z.string()).optional().describe("Key requirements for this feature - REQUIRED, don't leave empty"),
    filesToChange: z.array(z.string()).optional().describe("Files that will be modified - REQUIRED, don't leave empty"),
    testing: z.array(z.string()).optional().describe("How to test this feature - REQUIRED, don't leave empty"),
    epic: z.string().optional().describe("Epic tag to link this item to (e.g., 'auth-overhaul')")
  },
  async ({ title, areaCode, designFile, description, keyRequirements, filesToChange, testing, epic }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.addFeatureWithMetadata(repoPath, {
      title,
      areaCode,
      description,
      keyRequirements,
      filesToChange,
      testing,
      designFile
    });

    if (!response.success) {
      let errorText = `❌ ${response.error}`;
      if (response.hint) errorText += `\n💡 ${response.hint}`;
      if (response.checkedPath) errorText += `\nChecked: ${response.checkedPath}`;
      return {
        content: [{
          type: "text",
          text: errorText
        }]
      };
    }

    const specCode = response.data.sectionId || response.data.itemId;
    let text = `✅ Added: ${specCode} ${title}\n`;
    text += `Area: ${areaCode}\n`;
    if (response.data.designFile) {
      text += `Design: ${response.data.designFile}\n`;
    }
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
    text += `ID: ${response.data.displayId}\n`;
    text += `\n💡 Add to your task list: TaskCreate("${title}")\n`;
    text += `   When parent complete: tick("${parentId}")`;

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
    text += `🆔 ID: ${response.data.displayId}\n`;
    text += `\n💡 Add to your task list: TaskCreate("${title}")\n`;
    text += `   When parent complete: tick("${parentId}")`;

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

// delete - Delete a spec item
server.tool(
  "delete",
  "Delete a spec item or quick win. Use with caution - this is permanent.",
  {
    itemId: z.string().describe("Item ID or title to delete (e.g., 'FE.1' or 'Login page')")
  },
  async ({ itemId }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await api.deleteItem(repoPath, itemId);

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
        text: `🗑️ Deleted: ${itemId}\n\nThis action cannot be undone.`
      }]
    };
  }
);

// update_item - Update a spec item's metadata
server.tool(
  "update_item",
  "Update a spec item's metadata (title, description, requirements, files, testing, designFile).",
  {
    itemId: z.string().describe("Item ID (e.g., 'BE.43')"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    story: z.string().optional().describe("New user story"),
    keyRequirements: z.array(z.string()).optional().describe("Key requirements array"),
    filesToChange: z.array(z.string()).optional().describe("Files to change array"),
    testing: z.array(z.string()).optional().describe("Testing criteria array"),
    designFile: z.string().optional().describe("Path to design file")
  },
  async ({ itemId, title, description, story, keyRequirements, filesToChange, testing, designFile }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (story !== undefined) updates.story = story;
    if (keyRequirements !== undefined) updates.keyRequirements = keyRequirements;
    if (filesToChange !== undefined) updates.filesToChange = filesToChange;
    if (testing !== undefined) updates.testing = testing;
    if (designFile !== undefined) updates.designFile = designFile;

    if (Object.keys(updates).length === 0) {
      return {
        content: [{
          type: "text",
          text: "❌ At least one field required: title, description, story, keyRequirements, filesToChange, testing, designFile"
        }]
      };
    }

    const response = await api.editItem(repoPath, itemId, updates);

    if (!response.success) {
      return {
        content: [{
          type: "text",
          text: `❌ ${response.error}`
        }]
      };
    }

    const updatedFields = Object.keys(updates).join(', ');
    return {
      content: [{
        type: "text",
        text: `✅ Updated ${itemId}\n   Fields: ${updatedFields}`
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

    const response = await fetch(`${HTTP_BASE}/api/spec/add`, {
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
        text: `⚡ Quick win created: ${result.data.sectionId} ${title}\n📁 Files: ${filesToChange.join(', ')}\n✓ Test: ${test}\n📋 Workflow: Scope → Align → Fix → Verify → Commit\n💡 Start: working("${result.data.sectionId}")`
      }]
    };
  }
);

// bug - Add bug for debugging
server.tool(
  "CreateBug",
  "Add a bug for investigation. Creates a BUG task with 8-checkpoint debug workflow: Investigate → Fix → Review → Finish.",
  {
    title: z.string().describe("Bug title (e.g., 'Null check missing in login handler')"),
    reproduce: z.string().describe("How to reproduce the bug"),
    files: z.string().describe("File(s) affected (comma-separated)"),
    expected: z.string().describe("What should happen instead")
  },
  async ({ title, reproduce, files, expected }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const filesToChange = files.split(',').map(f => f.trim()).filter(Boolean);
    if (filesToChange.length === 0) {
      return { content: [{ type: "text", text: "❌ files cannot be empty" }] };
    }

    const response = await fetch(`${HTTP_BASE}/api/spec/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoPath,
        title,
        areaCode: 'BUG',
        keyRequirements: [reproduce],
        filesToChange,
        testing: [expected]
      })
    });
    const result = await response.json();

    if (!result.success) {
      return { content: [{ type: "text", text: `❌ ${result.error}` }] };
    }

    return {
      content: [{
        type: "text",
        text: `🐛 Bug created: ${result.data.sectionId} ${title}\n📁 Files: ${filesToChange.join(', ')}\n✓ Expected: ${expected}\n📋 Workflow: Investigate → Fix → Review → Finish\n💡 Start: working("${result.data.sectionId}")`
      }]
    };
  }
);

// bugs - List bugs
server.tool(
  "ListBugs",
  "List all bugs (BUG area tasks).",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await fetch(`${HTTP_BASE}/api/spec/items?repoPath=${encodeURIComponent(repoPath)}`);
    const result = await response.json();
    const allItems = result.data?.items || [];

    // Filter to BUG items - only top-level items
    const bugs = allItems.filter((b: any) => b.areaCode === 'BUG' && !b.parentId);
    const pending = bugs.filter((b: any) => b.status === 'open' || b.status === 'in-progress');
    const completed = bugs.filter((b: any) => b.status === 'done');

    if (bugs.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📝 No bugs logged yet\n\n💡 Add one with CreateBug(title, reproduce, files, expected)`
        }]
      };
    }

    let text = `🐛 Bugs\n`;
    text += `═══════════════════════════════════════\n\n`;

    if (pending.length > 0) {
      text += `⬜ PENDING (${pending.length}):\n`;
      pending.forEach((b: any) => {
        const status = b.status === 'in-progress' ? '◐' : '○';
        const title = b.title.replace(/^BUG\.\d+\s*/, '');
        text += `  ${status} ${b.displayId} ${title}\n`;
      });
      text += `\n`;
    }

    if (completed.length > 0) {
      text += `✅ FIXED (${completed.length}):\n`;
      completed.forEach((b: any) => {
        const title = b.title.replace(/^BUG\.\d+\s*/, '');
        text += `  ✓ ${b.displayId} ${title}\n`;
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

// quickwins - List quick wins
server.tool(
  "ListQuickWins",
  "List all quick wins (FUT area tasks).",
  {},
  async () => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    const response = await fetch(`${HTTP_BASE}/api/spec/items?repoPath=${encodeURIComponent(repoPath)}`);
    const result = await response.json();
    const allItems = result.data?.items || [];

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

    text += `\n💡 Start with working("FUT.X")`;

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
    const findRes = await fetch(`${HTTP_BASE}/api/spec/item?repoPath=${encodeURIComponent(repoPath)}&query=${encodeURIComponent(id)}`);
    const findResult = await findRes.json();
    
    if (!findResult.success || !findResult.data) {
      return { content: [{ type: "text", text: `❌ Quick win not found: ${id}` }] };
    }

    const item = findResult.data;

    // Mark as done
    const response = await fetch(`${HTTP_BASE}/api/spec/update`, {
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

// list - List items with optional filters
server.tool(
  "list",
  "List spec items with optional filters by type, area, or status.",
  {
    type: z.enum(['quickwin', 'refactor', 'audit', 'remove', 'default', 'all']).optional().describe("Workflow type filter (default: all)"),
    area: z.enum(['SD', 'FE', 'BE', 'FUT']).optional().describe("Area code filter"),
    status: z.enum(['open', 'in-progress', 'done']).optional().describe("Status filter")
  },
  async ({ type, area, status }) => {
    const repoPath = getRepoPath();
    await requireRepo(repoPath);

    // Build query params
    const params = new URLSearchParams({ repoPath, topLevel: 'true' });
    if (type && type !== 'all') {
      params.set('workflowType', type);
    }
    if (area) {
      params.set('area', area);
    }
    if (status) {
      params.set('status', status);
    }

    const response = await fetch(`${HTTP_BASE}/api/spec/items?${params}`);
    const result = await response.json();
    const items = (result.data?.items || []).filter((i: any) => !i.parentId);

    if (items.length === 0) {
      let msg = `📋 No items found`;
      if (type && type !== 'all') msg += ` (type: ${type})`;
      if (area) msg += ` (area: ${area})`;
      if (status) msg += ` (status: ${status})`;
      return { content: [{ type: "text", text: msg }] };
    }

    // Group by status
    const pending = items.filter((i: any) => i.status === 'open' || i.status === 'in-progress');
    const completed = items.filter((i: any) => i.status === 'done');

    let text = `📋 Items`;
    if (type && type !== 'all') text += ` [${type}]`;
    if (area) text += ` [${area}]`;
    text += `\n═══════════════════════════════════════\n\n`;

    if (pending.length > 0) {
      text += `⬜ PENDING (${pending.length}):\n`;
      pending.forEach((i: any) => {
        const statusIcon = i.status === 'in-progress' ? '◐' : '○';
        const typeTag = i.workflowType ? ` [${i.workflowType}]` : '';
        const tagsStr = i.tags && i.tags.length > 0 ? ` #${i.tags.join(' #')}` : '';
        text += `  ${statusIcon} ${i.displayId} ${i.title.replace(/^[A-Z]+\.\d+\s*/, '')}${typeTag}${tagsStr}\n`;
      });
      text += `\n`;
    }

    if (completed.length > 0 && !status) {
      text += `✅ COMPLETED (${completed.length}):\n`;
      completed.slice(0, 5).forEach((i: any) => {
        const tagsStr = i.tags && i.tags.length > 0 ? ` #${i.tags.join(' #')}` : '';
        text += `  ✓ ${i.displayId} ${i.title.replace(/^[A-Z]+\.\d+\s*/, '')}${tagsStr}\n`;
      });
      if (completed.length > 5) {
        text += `  ... and ${completed.length - 5} more\n`;
      }
    }

    text += `\n💡 Filter: list(type="quickwin") list(area="FE") list(status="open")`;

    return { content: [{ type: "text", text }] };
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
  "Attach a file (screenshot, log, etc.) to a quick win or spec item. Files are stored in docs/attachments/.",
  {
    itemType: z.enum(['quickwin', 'item']).describe("Type of item to attach to: 'quickwin' or 'item'"),
    itemId: z.string().describe("ID of the item (quick win ID, or spec item ID like 'SD.1')"),
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
  "List attachments for a quick win or spec item.",
  {
    itemType: z.enum(['quickwin', 'item']).optional().describe("Type of item: 'quickwin' or 'item'. Omit to list all."),
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

      // Habits
      text += `┌─ HABITS ────────────────────────────┐\n`;
      text += `│ • Off-task? → also() to log     │\n`;
      text += `│ • Progress? → pulse() visible   │\n`;
      text += `│ • Checkpoint done? → tick() NOW │\n`;
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

// ============================================
// GOVERNANCE TOOLS
// ============================================

// Minimum characters for a meaningful justification reason
const MIN_JUSTIFY_REASON_LENGTH = 20;

// Helper to log decisions to .chkd/decisions.json
function logDecision(repoPath: string, decision: Record<string, any>): { success: boolean; error?: string } {
  try {
    const chkdDir = path.join(repoPath, '.chkd');
    const decisionsFile = path.join(chkdDir, 'decisions.json');

    // Ensure .chkd directory exists
    if (!fs.existsSync(chkdDir)) {
      fs.mkdirSync(chkdDir, { recursive: true });
    }

    // Append as JSONL
    const entry = JSON.stringify({ ts: new Date().toISOString(), ...decision }) + '\n';
    fs.appendFileSync(decisionsFile, entry);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// assume - Surface assumptions explicitly
server.tool(
  "assume",
  "Surface an assumption you're making. Creates audit trail. Use when uncertain about requirements, APIs, or behavior.",
  {
    assumption: z.string().describe("The assumption you're making"),
    confidence: z.enum(['low', 'medium', 'high']).describe("How confident are you?"),
    evidence: z.string().describe("Why is this assumption reasonable?"),
    impact: z.string().describe("What breaks if this assumption is wrong?")
  },
  async ({ assumption, confidence, evidence, impact }) => {
    const repoPath = getRepoPath();

    // Log to decisions.json
    logDecision(repoPath, {
      type: 'assume',
      assumption,
      confidence,
      evidence,
      impact
    });

    let text = '';

    if (confidence === 'low') {
      text += `🚨 LOW CONFIDENCE ASSUMPTION:\n`;
      text += `"${assumption}"\n\n`;
      text += `Evidence: ${evidence}\n`;
      text += `Impact if wrong: ${impact}\n\n`;
      text += `⚠️ Consider asking user before proceeding.\n`;
      text += `Logged to .chkd/decisions.json`;
    } else if (confidence === 'medium') {
      text += `⚠️ Assumption logged (${confidence} confidence):\n`;
      text += `"${assumption}"\n\n`;
      text += `Evidence: ${evidence}\n`;
      text += `Impact if wrong: ${impact}\n\n`;
      text += `Consider confirming with user if critical path.\n`;
      text += `Logged to .chkd/decisions.json`;
    } else {
      text += `✓ Assumption logged (${confidence} confidence):\n`;
      text += `"${assumption}"\n\n`;
      text += `Evidence: ${evidence}\n`;
      text += `Impact if wrong: ${impact}\n`;
      text += `Logged to .chkd/decisions.json`;
    }

    return { content: [{ type: "text", text }] };
  }
);

// justify - Document why you're creating something new instead of reusing
server.tool(
  "justify",
  "Document why you're creating new code instead of reusing existing. Use before creating any new function, component, type, or file.",
  {
    createType: z.enum(['function', 'component', 'type', 'constant', 'file', 'hook', 'utility']).describe("What type of thing are you creating?"),
    name: z.string().describe("Name of the thing you're creating"),
    searched: z.array(z.string()).describe("What search terms did you use to find existing code?"),
    found: z.array(z.string()).describe("What similar things did you find? (empty if none)"),
    inUse: z.boolean().optional().describe("Are the found items actually in use in the codebase?"),
    reason: z.string().describe("Why create new instead of reusing found items?")
  },
  async ({ createType, name, searched, found, inUse, reason }) => {
    const repoPath = getRepoPath();

    // Log to decisions.json
    logDecision(repoPath, {
      type: 'justify',
      createType,
      name,
      searched,
      found,
      inUse,
      reason
    });

    const warnings: string[] = [];

    // Check for weak justification
    if (searched.length < 3) {
      warnings.push(`Search seems narrow (${searched.length} terms). Consider broader search.`);
    }

    if (found.length > 0 && inUse === false) {
      warnings.push(`Found existing code that's not in use. Consider reviving instead of creating new.`);
    }

    if (reason.length < MIN_JUSTIFY_REASON_LENGTH) {
      warnings.push(`Reason is brief (${reason.length} chars). Be more specific about why reuse isn't viable.`);
    }

    let text = `✓ Justified: ${createType} ${name}\n`;
    text += `  Searched: ${searched.join(', ')}\n`;
    text += `  Found: ${found.length > 0 ? found.join(', ') + (inUse ? ' (in use)' : ' (not in use)') : 'none'}\n`;
    text += `  Reason: ${reason}\n`;

    if (warnings.length > 0) {
      text += `\n⚠️ Warnings:\n`;
      warnings.forEach(w => text += `  • ${w}\n`);
    }

    text += `\nLogged to .chkd/decisions.json`;

    return { content: [{ type: "text", text }] };
  }
);

// decisions - View logged decisions
server.tool(
  "decisions",
  "View logged decisions (assumptions, justifications, reviews) from this session.",
  {
    type: z.enum(['all', 'assume', 'justify', 'review']).optional().describe("Filter by decision type"),
    limit: z.number().optional().describe("Max entries to show (default 10)")
  },
  async ({ type, limit = 10 }) => {
    const repoPath = getRepoPath();
    const decisionsFile = path.join(repoPath, '.chkd', 'decisions.json');

    if (!fs.existsSync(decisionsFile)) {
      return { content: [{ type: "text", text: "No decisions logged yet." }] };
    }

    const lines = fs.readFileSync(decisionsFile, 'utf-8').trim().split('\n').filter(Boolean);
    let entries: Record<string, any>[] = [];

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }

    // Filter by type
    if (type && type !== 'all') {
      entries = entries.filter(e => e.type === type);
    }

    // Take last N
    entries = entries.slice(-limit);

    if (entries.length === 0) {
      return { content: [{ type: "text", text: `No ${type || ''} decisions found.` }] };
    }

    let text = `📋 Decisions (${entries.length}):\n\n`;

    entries.forEach(e => {
      const time = new Date(e.ts).toLocaleTimeString();
      if (e.type === 'assume') {
        const icon = e.confidence === 'low' ? '🚨' : e.confidence === 'medium' ? '⚠️' : '✓';
        text += `${icon} [${time}] ASSUME (${e.confidence}): "${e.assumption}"\n`;
      } else if (e.type === 'justify') {
        text += `✓ [${time}] JUSTIFY: ${e.createType} ${e.name}\n`;
      } else if (e.type === 'review') {
        const approved = e.approved ? '✅' : '❌';
        text += `${approved} [${time}] REVIEW: ${e.files?.join(', ') || 'unknown'}\n`;
      }
    });

    return { content: [{ type: "text", text }] };
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
