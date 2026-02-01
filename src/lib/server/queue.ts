/**
 * Simple queue system for capturing messages/tasks without interrupting work
 */

export interface QueueItem {
  id: string;
  title: string;
  createdAt: Date;
}

// In-memory store per repo (could be persisted to DB later)
const queues = new Map<string, QueueItem[]>();

export function getQueueItems(repoPath: string): QueueItem[] {
  return queues.get(repoPath) || [];
}

export function addQueueItem(repoPath: string, title: string): QueueItem {
  const items = queues.get(repoPath) || [];
  const item: QueueItem = {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    createdAt: new Date(),
  };
  items.push(item);
  queues.set(repoPath, items);
  return item;
}

export function removeQueueItem(repoPath: string, itemId: string): boolean {
  const items = queues.get(repoPath) || [];
  const index = items.findIndex(i => i.id === itemId);
  if (index === -1) return false;
  items.splice(index, 1);
  queues.set(repoPath, items);
  return true;
}

export function clearQueue(repoPath: string): void {
  queues.set(repoPath, []);
}
