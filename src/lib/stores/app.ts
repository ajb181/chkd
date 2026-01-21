import { writable, derived } from 'svelte/store';
import type { Repository, Session, Bug, HandoverNote } from '$lib/api';

// Repository state
export const repos = writable<Repository[]>([]);
export const currentRepoId = writable<string | null>(null);

export const currentRepo = derived(
  [repos, currentRepoId],
  ([$repos, $currentRepoId]) => $repos.find(r => r.id === $currentRepoId) || null
);

// Session state
export const session = writable<Session | null>(null);

// Bugs
export const bugs = writable<Bug[]>([]);

// Handover notes
export const handoverNotes = writable<HandoverNote[]>([]);

// Repo status for cards
export interface RepoStatus {
  currentTask: string | null;
  currentItem: string | null;
  status: 'idle' | 'building' | 'debugging';
  repoProgress: number;
  taskProgress: number;
  completedItems: number;
  totalItems: number;
  queueCount: number;
}

export const repoStatuses = writable<Map<string, RepoStatus>>(new Map());

// Loading state
export const isLoading = writable(false);

// Set current repo by path
export function setCurrentRepoByPath(path: string) {
  repos.subscribe(r => {
    const repo = r.find(repo => repo.path === path);
    if (repo) {
      currentRepoId.set(repo.id);
    }
  })();
}
