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

// In-memory stores (keyed by repoPath)
const proposals = new Map<string, Proposal[]>();
const auditItems = new Map<string, AuditItem[]>();
const flaggedItems = new Map<string, FlaggedItem[]>();
const deviations = new Map<string, Deviation[]>();
const scopeChanges = new Map<string, ScopeChange[]>();
const queueItems = new Map<string, QueueItem[]>();

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

// Clear all data for a repo (on session end)
export function clearRepoData(repoPath: string): void {
  proposals.delete(repoPath);
  auditItems.delete(repoPath);
  flaggedItems.delete(repoPath);
  queueItems.delete(repoPath);
  deviations.delete(repoPath);
  scopeChanges.delete(repoPath);
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
