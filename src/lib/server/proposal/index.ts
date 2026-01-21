/**
 * Proposal System - Track scope changes, proposals, and audit trail
 *
 * Flow:
 *   User request → /session/check → ON-PLAN or OFF-PLAN
 *                                         ↓
 *                                 ┌───────┴───────┐
 *                                 ↓               ↓
 *                            /deviate        /propose-change
 *                         (quick add)       (needs approval)
 *                                 ↓               ↓
 *                            Logged in       Small → auto-approve
 *                            deviations      Big → wait for user
 *                                 ↓               ↓
 *                                       /respond-to-proposal
 *                                       ├─ approve → add to spec
 *                                       ├─ reject → skip
 *                                       └─ send-to-chkd → flag for discussion
 */

// Types
export interface Proposal {
  id: string;
  repoPath: string;
  type: 'add' | 'modify' | 'remove';
  title: string;
  description: string;
  reason: string;
  size: 'small' | 'big';
  source: 'claude' | 'user';
  status: 'pending' | 'approved' | 'rejected' | 'sent-to-chkd';
  areaCode?: string;
  createdAt: Date;
  respondedAt?: Date;
}

export interface AuditItem {
  id: string;
  repoPath: string;
  title: string;
  description?: string;
  type: 'bug' | 'idea' | 'feature' | 'quick-fix';
  addedDuringTask: string;
  tested: boolean;
  reviewed: boolean;
  createdAt: Date;
}

export interface FlaggedItem {
  id: string;
  repoPath: string;
  title: string;
  description: string;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
  type: 'bug' | 'idea' | 'feature';
  status: 'pending' | 'planned' | 'dismissed';
  createdAt: Date;
  plannedAt?: Date;
  plannedArea?: string;
}

export interface Deviation {
  request: string;
  handled: 'added' | 'rejected' | 'allowed';
  timestamp: Date;
}

export interface QueueItem {
  id: string;
  repoPath: string;
  title: string;
  createdAt: Date;
}

export interface ScopeChange {
  type: 'added' | 'removed';
  itemId: string;
  title: string;
  timestamp: Date;
}

export interface BlockingState {
  isBlocking: boolean;
  question?: string;
  options?: string[];
  timestamp?: Date;
}

export interface HandoverNote {
  taskId: string;
  taskTitle: string;
  note: string;
  pausedBy: string;
  createdAt: Date;
}

// In-memory stores (keyed by repoPath)
const proposals = new Map<string, Proposal[]>();
const auditItems = new Map<string, AuditItem[]>();
const flaggedItems = new Map<string, FlaggedItem[]>();
const deviations = new Map<string, Deviation[]>();
const scopeChanges = new Map<string, ScopeChange[]>();
const queueItems = new Map<string, QueueItem[]>();
const blockingStates = new Map<string, BlockingState>();
// Handover notes keyed by repoPath, then by taskId
const handoverNotes = new Map<string, Map<string, HandoverNote>>();

// File path for handover notes
function getHandoverFilePath(repoPath: string): string {
  return `${repoPath}/.handover.md`;
}

// Load handover notes from file
async function loadHandoverNotes(repoPath: string): Promise<Map<string, HandoverNote>> {
  const filePath = getHandoverFilePath(repoPath);
  const notes = new Map<string, HandoverNote>();

  try {
    const { readFile } = await import('fs/promises');
    const content = await readFile(filePath, 'utf-8');

    // Parse the markdown format
    const noteBlocks = content.split('\n## ').filter(b => b.trim());
    for (const block of noteBlocks) {
      const lines = block.split('\n');
      const headerMatch = lines[0].match(/^(?:## )?(.+?) \((\S+)\)$/);
      if (!headerMatch) continue;

      const taskTitle = headerMatch[1];
      const taskId = headerMatch[2];

      let note = '';
      let pausedBy = 'user';
      let createdAt = new Date();

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('**Paused by:**')) {
          pausedBy = line.replace('**Paused by:**', '').trim();
        } else if (line.startsWith('**At:**')) {
          createdAt = new Date(line.replace('**At:**', '').trim());
        } else if (line.startsWith('> ')) {
          note += (note ? '\n' : '') + line.slice(2);
        }
      }

      if (note) {
        notes.set(taskId, { taskId, taskTitle, note, pausedBy, createdAt });
      }
    }
  } catch {
    // File doesn't exist yet, that's fine
  }

  return notes;
}

// Save handover notes to file
async function saveHandoverNotes(repoPath: string, notes: Map<string, HandoverNote>): Promise<void> {
  const filePath = getHandoverFilePath(repoPath);
  const { writeFile, unlink } = await import('fs/promises');

  if (notes.size === 0) {
    // Delete the file if no notes
    try {
      await unlink(filePath);
    } catch {
      // File didn't exist, that's fine
    }
    return;
  }

  let content = '# Handover Notes\n\n';
  content += 'Paused tasks with notes for the next session.\n\n---\n\n';

  for (const note of notes.values()) {
    content += `## ${note.taskTitle} (${note.taskId})\n\n`;
    content += `**Paused by:** ${note.pausedBy}\n`;
    content += `**At:** ${note.createdAt.toISOString()}\n\n`;
    content += note.note.split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
    content += '---\n\n';
  }

  await writeFile(filePath, content.trim() + '\n', 'utf-8');
}

// ID generator
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Proposals
export function getProposals(repoPath: string): Proposal[] {
  if (!proposals.has(repoPath)) {
    proposals.set(repoPath, []);
  }
  return proposals.get(repoPath)!;
}

export function addProposal(proposal: Proposal): void {
  getProposals(proposal.repoPath).push(proposal);
}

export function getProposalById(repoPath: string, proposalId: string): Proposal | undefined {
  return getProposals(repoPath).find(p => p.id === proposalId);
}

export function getPendingProposals(repoPath: string): Proposal[] {
  return getProposals(repoPath).filter(p => p.status === 'pending');
}

// Audit items
export function getAuditItems(repoPath: string): AuditItem[] {
  if (!auditItems.has(repoPath)) {
    auditItems.set(repoPath, []);
  }
  return auditItems.get(repoPath)!;
}

export function addAuditItem(item: AuditItem): void {
  getAuditItems(item.repoPath).push(item);
}

// Flagged items
export function getFlaggedItems(repoPath: string): FlaggedItem[] {
  if (!flaggedItems.has(repoPath)) {
    flaggedItems.set(repoPath, []);
  }
  return flaggedItems.get(repoPath)!;
}

export function addFlaggedItem(item: FlaggedItem): void {
  getFlaggedItems(item.repoPath).push(item);
}

export function getPendingFlaggedItems(repoPath: string): FlaggedItem[] {
  return getFlaggedItems(repoPath).filter(f => f.status === 'pending');
}

// Deviations (audit trail)
export function getDeviations(repoPath: string): Deviation[] {
  if (!deviations.has(repoPath)) {
    deviations.set(repoPath, []);
  }
  return deviations.get(repoPath)!;
}

export function addDeviation(repoPath: string, deviation: Deviation): void {
  getDeviations(repoPath).push(deviation);
}

// Scope changes (audit trail)
export function getScopeChanges(repoPath: string): ScopeChange[] {
  if (!scopeChanges.has(repoPath)) {
    scopeChanges.set(repoPath, []);
  }
  return scopeChanges.get(repoPath)!;
}

export function addScopeChange(repoPath: string, change: ScopeChange): void {
  getScopeChanges(repoPath).push(change);
}

// Queue items (user adds while Claude is working)
export function getQueueItems(repoPath: string): QueueItem[] {
  if (!queueItems.has(repoPath)) {
    queueItems.set(repoPath, []);
  }
  return queueItems.get(repoPath)!;
}

export function addQueueItem(repoPath: string, title: string): QueueItem {
  const item: QueueItem = {
    id: generateId(),
    repoPath,
    title,
    createdAt: new Date(),
  };
  getQueueItems(repoPath).push(item);
  return item;
}

export function removeQueueItem(repoPath: string, itemId: string): boolean {
  const items = getQueueItems(repoPath);
  const index = items.findIndex(i => i.id === itemId);
  if (index >= 0) {
    items.splice(index, 1);
    return true;
  }
  return false;
}

export function clearQueue(repoPath: string): QueueItem[] {
  const items = getQueueItems(repoPath);
  const cleared = [...items];
  items.length = 0;
  return cleared;
}

// Blocking state (Claude waiting for input)
export function getBlockingState(repoPath: string): BlockingState {
  return blockingStates.get(repoPath) || { isBlocking: false };
}

export function setBlocking(repoPath: string, question: string, options?: string[]): void {
  blockingStates.set(repoPath, {
    isBlocking: true,
    question,
    options,
    timestamp: new Date(),
  });
}

export function clearBlocking(repoPath: string): void {
  blockingStates.set(repoPath, { isBlocking: false });
}

// Handover notes (when pausing a task) - now with file persistence
export async function getHandoverNotesAsync(repoPath: string): Promise<Map<string, HandoverNote>> {
  if (!handoverNotes.has(repoPath)) {
    // Load from file on first access
    const loaded = await loadHandoverNotes(repoPath);
    handoverNotes.set(repoPath, loaded);
  }
  return handoverNotes.get(repoPath)!;
}

// Sync version for backward compatibility (uses cache only)
export function getHandoverNotes(repoPath: string): Map<string, HandoverNote> {
  if (!handoverNotes.has(repoPath)) {
    handoverNotes.set(repoPath, new Map());
  }
  return handoverNotes.get(repoPath)!;
}

export async function setHandoverNote(repoPath: string, taskId: string, taskTitle: string, note: string, pausedBy: string = 'user'): Promise<HandoverNote> {
  const notes = await getHandoverNotesAsync(repoPath);
  const handover: HandoverNote = {
    taskId,
    taskTitle,
    note,
    pausedBy,
    createdAt: new Date(),
  };
  notes.set(taskId, handover);
  await saveHandoverNotes(repoPath, notes);
  return handover;
}

export async function getHandoverNote(repoPath: string, taskId: string): Promise<HandoverNote | undefined> {
  const notes = await getHandoverNotesAsync(repoPath);
  return notes.get(taskId);
}

export async function clearHandoverNote(repoPath: string, taskId: string): Promise<boolean> {
  const notes = await getHandoverNotesAsync(repoPath);
  const deleted = notes.delete(taskId);
  if (deleted) {
    await saveHandoverNotes(repoPath, notes);
  }
  return deleted;
}

export async function getAllHandoverNotes(repoPath: string): Promise<HandoverNote[]> {
  const notes = await getHandoverNotesAsync(repoPath);
  return Array.from(notes.values());
}

// Clear all data for a repo (on session end)
export function clearRepoData(repoPath: string): void {
  proposals.delete(repoPath);
  auditItems.delete(repoPath);
  flaggedItems.delete(repoPath);
  queueItems.delete(repoPath);
  deviations.delete(repoPath);
  scopeChanges.delete(repoPath);
  blockingStates.delete(repoPath);
}

// Get summary for a repo
export function getProposalSummary(repoPath: string): {
  pendingProposals: number;
  pendingFlagged: number;
  unreviewedAudit: number;
  totalDeviations: number;
  totalScopeChanges: number;
} {
  return {
    pendingProposals: getPendingProposals(repoPath).length,
    pendingFlagged: getPendingFlaggedItems(repoPath).length,
    unreviewedAudit: getAuditItems(repoPath).filter(a => !a.reviewed).length,
    totalDeviations: getDeviations(repoPath).length,
    totalScopeChanges: getScopeChanges(repoPath).length,
  };
}
