/**
 * Git Worktree Utilities for Multi-Worker System
 *
 * Provides functions to create, manage, and merge git worktrees
 * for parallel Claude worker instances.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = promisify(exec);

// ===== TYPES =====

export interface WorktreeInfo {
  path: string;           // Absolute path to worktree
  branch: string;         // Branch name
  commit: string;         // Current HEAD commit
  isMain: boolean;        // Is this the main worktree?
}

export interface MergeResult {
  success: boolean;
  conflicts?: ConflictInfo[];
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
  commitHash?: string;
}

export interface ConflictInfo {
  file: string;
  type: 'content' | 'deleted' | 'renamed' | 'added';
  oursContent?: string;    // First ~10 lines of our version
  theirsContent?: string;  // First ~10 lines of their version
  conflictLines: number;
}

export interface BranchStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: string[];
}

// ===== HELPER FUNCTIONS =====

/**
 * Execute a git command in a specific directory
 */
async function git(repoPath: string, args: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`git ${args}`, {
      cwd: repoPath,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
    });
    return stdout.trim();
  } catch (error: any) {
    // Include stderr in error message for debugging
    const stderr = error.stderr?.trim() || '';
    const message = stderr || error.message;
    throw new Error(`Git error: ${message}`);
  }
}

/**
 * Check if a path is inside a git repository
 */
async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    await git(repoPath, 'rev-parse --git-dir');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root of the git repository
 */
async function getRepoRoot(repoPath: string): Promise<string> {
  return git(repoPath, 'rev-parse --show-toplevel');
}

/**
 * Get current branch name
 */
async function getCurrentBranch(repoPath: string): Promise<string> {
  return git(repoPath, 'rev-parse --abbrev-ref HEAD');
}

/**
 * Get current commit hash
 */
async function getCurrentCommit(repoPath: string): Promise<string> {
  return git(repoPath, 'rev-parse HEAD');
}

/**
 * Slugify a string for use in branch names
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40); // Keep branch names reasonable
}

/**
 * Generate a unique worker ID
 */
export function generateWorkerId(username: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 6);
  return `worker-${username}-${timestamp}-${random}`;
}

/**
 * Generate branch name for a task
 */
export function generateBranchName(username: string, taskId: string, taskTitle: string): string {
  const slug = slugify(taskTitle);
  return `feature/${username}/${taskId.toLowerCase()}-${slug}`;
}

/**
 * Generate worktree path
 */
export function generateWorktreePath(repoPath: string, username: string, workerNumber: number): string {
  const repoName = path.basename(repoPath);
  const parentDir = path.dirname(repoPath);
  return path.join(parentDir, `${repoName}-${username}-${workerNumber}`);
}

// ===== MAIN FUNCTIONS =====

/**
 * Create a new worktree with a feature branch
 *
 * @param repoPath - Path to the main repository
 * @param worktreePath - Path where the worktree will be created
 * @param branchName - Name for the new branch
 * @returns WorktreeInfo for the created worktree
 */
export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branchName: string
): Promise<WorktreeInfo> {
  // Validate repo
  if (!await isGitRepo(repoPath)) {
    throw new Error(`Not a git repository: ${repoPath}`);
  }

  // Check if worktree path already exists
  if (fs.existsSync(worktreePath)) {
    throw new Error(`Worktree path already exists: ${worktreePath}`);
  }

  // Check if branch already exists
  try {
    await git(repoPath, `rev-parse --verify ${branchName}`);
    throw new Error(`Branch already exists: ${branchName}`);
  } catch (error: any) {
    // Branch doesn't exist - that's what we want
    if (!error.message.includes('Git error')) {
      throw error;
    }
  }

  // Create worktree with new branch
  await git(repoPath, `worktree add "${worktreePath}" -b "${branchName}"`);

  // Get commit info
  const commit = await getCurrentCommit(worktreePath);

  return {
    path: worktreePath,
    branch: branchName,
    commit,
    isMain: false,
  };
}

/**
 * Copy chkd workflow files to a worktree
 * These files may be untracked/gitignored but are needed for workers
 */
export function copyChkdFilesToWorktree(repoPath: string, worktreePath: string): void {
  const filesToCopy = ['CLAUDE.md'];
  const dirsToCopy = ['docs', '.claude'];

  // Copy individual files
  for (const file of filesToCopy) {
    const src = path.join(repoPath, file);
    const dest = path.join(worktreePath, file);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  }

  // Copy directories (recursive)
  for (const dir of dirsToCopy) {
    const src = path.join(repoPath, dir);
    const dest = path.join(worktreePath, dir);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.cpSync(src, dest, { recursive: true });
    }
  }
}

/**
 * Remove a worktree and optionally its branch
 *
 * @param repoPath - Path to the main repository
 * @param worktreePath - Path to the worktree to remove
 * @param deleteBranch - Whether to delete the branch too (default: false)
 */
export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  deleteBranch: boolean = false
): Promise<void> {
  // Get branch name before removing (if we need to delete it)
  let branchName: string | null = null;
  if (deleteBranch && fs.existsSync(worktreePath)) {
    try {
      branchName = await getCurrentBranch(worktreePath);
    } catch {
      // Worktree might be in bad state, continue with removal
    }
  }

  // Remove the worktree
  try {
    await git(repoPath, `worktree remove "${worktreePath}" --force`);
  } catch (error: any) {
    // If worktree doesn't exist in git's list, try manual cleanup
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
  }

  // Prune worktree references
  await git(repoPath, 'worktree prune');

  // Delete branch if requested
  if (deleteBranch && branchName && branchName !== 'main' && branchName !== 'master') {
    try {
      await git(repoPath, `branch -D "${branchName}"`);
    } catch {
      // Branch might already be deleted or merged
    }
  }
}

/**
 * List all worktrees for a repository
 *
 * @param repoPath - Path to any worktree in the repository
 * @returns Array of WorktreeInfo
 */
export async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  const output = await git(repoPath, 'worktree list --porcelain');
  const worktrees: WorktreeInfo[] = [];

  if (!output) return worktrees;

  // Parse porcelain output
  // Format:
  // worktree /path/to/worktree
  // HEAD abc123
  // branch refs/heads/branch-name
  // (blank line)
  const entries = output.split('\n\n').filter(Boolean);

  for (const entry of entries) {
    const lines = entry.split('\n');
    let wtPath = '';
    let commit = '';
    let branch = '';

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        wtPath = line.substring(9);
      } else if (line.startsWith('HEAD ')) {
        commit = line.substring(5);
      } else if (line.startsWith('branch ')) {
        branch = line.substring(7).replace('refs/heads/', '');
      } else if (line === 'detached') {
        branch = '(detached)';
      }
    }

    if (wtPath) {
      const repoRoot = await getRepoRoot(repoPath);
      worktrees.push({
        path: wtPath,
        branch,
        commit,
        isMain: wtPath === repoRoot,
      });
    }
  }

  return worktrees;
}

/**
 * Check for merge conflicts WITHOUT actually merging
 * Uses git merge --no-commit --no-ff, then aborts
 *
 * @param repoPath - Path to the repository (main worktree)
 * @param branchName - Branch to check for conflicts
 * @param targetBranch - Branch to merge into (default: current branch)
 * @returns Array of conflicts (empty if clean merge possible)
 */
export async function checkConflicts(
  repoPath: string,
  branchName: string,
  targetBranch?: string
): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];

  // Save current branch
  const currentBranch = await getCurrentBranch(repoPath);
  const target = targetBranch || currentBranch;

  // If we need to switch branches
  if (target !== currentBranch) {
    await git(repoPath, `checkout "${target}"`);
  }

  try {
    // Attempt merge without committing
    try {
      await git(repoPath, `merge --no-commit --no-ff "${branchName}"`);
      // No conflicts - abort the merge
      await git(repoPath, 'merge --abort');
      return [];
    } catch (mergeError: any) {
      // Check if it's a conflict or another error
      if (!mergeError.message.includes('Automatic merge failed') &&
          !mergeError.message.includes('CONFLICT')) {
        // Abort any partial merge
        try { await git(repoPath, 'merge --abort'); } catch {}
        throw mergeError;
      }

      // Get list of conflicted files
      const statusOutput = await git(repoPath, 'status --porcelain');
      const lines = statusOutput.split('\n').filter(Boolean);

      for (const line of lines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);

        // UU = both modified (content conflict)
        // DD = both deleted
        // AU = added by us
        // UA = added by them
        // DU = deleted by us, modified by them
        // UD = modified by us, deleted by them
        if (status.includes('U') || status === 'DD') {
          let type: ConflictInfo['type'] = 'content';
          if (status === 'DD') type = 'deleted';
          else if (status === 'AU' || status === 'UA') type = 'added';
          else if (status.includes('D')) type = 'deleted';

          // Try to get conflict content
          let oursContent: string | undefined;
          let theirsContent: string | undefined;
          let conflictLines = 0;

          if (type === 'content') {
            try {
              const fileContent = fs.readFileSync(path.join(repoPath, file), 'utf-8');
              const conflictMatches = fileContent.match(/<<<<<<</g);
              conflictLines = conflictMatches?.length || 0;

              // Extract first conflict marker section
              const conflictSection = fileContent.match(/<<<<<<< .*?\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> .*?\n/);
              if (conflictSection) {
                oursContent = conflictSection[1].split('\n').slice(0, 10).join('\n');
                theirsContent = conflictSection[2].split('\n').slice(0, 10).join('\n');
              }
            } catch {
              // File might not be readable
            }
          }

          conflicts.push({
            file,
            type,
            oursContent,
            theirsContent,
            conflictLines,
          });
        }
      }

      // Abort the merge
      await git(repoPath, 'merge --abort');
    }
  } finally {
    // Restore original branch if we switched
    if (target !== currentBranch) {
      try {
        await git(repoPath, `checkout "${currentBranch}"`);
      } catch {
        // Best effort to restore
      }
    }
  }

  return conflicts;
}

/**
 * Merge a branch into the target branch
 *
 * @param repoPath - Path to the repository
 * @param branchName - Branch to merge
 * @param targetBranch - Branch to merge into (default: current branch)
 * @param commitMessage - Custom commit message (default: auto-generated)
 * @returns MergeResult
 */
export async function mergeBranch(
  repoPath: string,
  branchName: string,
  targetBranch?: string,
  commitMessage?: string
): Promise<MergeResult> {
  // Save current branch
  const currentBranch = await getCurrentBranch(repoPath);
  const target = targetBranch || currentBranch;

  // If we need to switch branches
  if (target !== currentBranch) {
    await git(repoPath, `checkout "${target}"`);
  }

  try {
    // First check for conflicts
    const conflicts = await checkConflicts(repoPath, branchName, target);
    if (conflicts.length > 0) {
      return {
        success: false,
        conflicts,
      };
    }

    // Get stats before merge
    const statsBefore = await getBranchStats(repoPath, branchName, target);

    // Perform the merge
    const message = commitMessage || `Merge ${branchName}: Worker task complete`;
    await git(repoPath, `merge "${branchName}" -m "${message}"`);

    // Get commit hash
    const commitHash = await getCurrentCommit(repoPath);

    return {
      success: true,
      filesChanged: statsBefore.filesChanged,
      insertions: statsBefore.insertions,
      deletions: statsBefore.deletions,
      commitHash,
    };
  } finally {
    // Restore original branch if we switched
    if (target !== currentBranch) {
      try {
        await git(repoPath, `checkout "${currentBranch}"`);
      } catch {
        // Best effort to restore
      }
    }
  }
}

/**
 * Resolve conflicts with a strategy
 *
 * @param repoPath - Path to the repository (with active merge conflict)
 * @param strategy - 'ours' keeps target branch, 'theirs' keeps source branch
 * @param files - Specific files to resolve (default: all)
 */
export async function resolveConflicts(
  repoPath: string,
  strategy: 'ours' | 'theirs',
  files?: string[]
): Promise<void> {
  if (files && files.length > 0) {
    // Resolve specific files
    for (const file of files) {
      await git(repoPath, `checkout --${strategy} "${file}"`);
      await git(repoPath, `add "${file}"`);
    }
  } else {
    // Resolve all conflicts with strategy
    // Get list of conflicted files
    const statusOutput = await git(repoPath, 'status --porcelain');
    const conflictedFiles = statusOutput
      .split('\n')
      .filter(line => line.substring(0, 2).includes('U'))
      .map(line => line.substring(3));

    for (const file of conflictedFiles) {
      await git(repoPath, `checkout --${strategy} "${file}"`);
      await git(repoPath, `add "${file}"`);
    }
  }
}

/**
 * Get diff statistics for a branch compared to target
 *
 * @param repoPath - Path to the repository
 * @param branchName - Branch to compare
 * @param targetBranch - Branch to compare against (default: main or master)
 * @returns Branch statistics
 */
export async function getBranchStats(
  repoPath: string,
  branchName: string,
  targetBranch?: string
): Promise<BranchStats> {
  // Determine target branch
  let target = targetBranch;
  if (!target) {
    // Try to find main/master
    try {
      await git(repoPath, 'rev-parse --verify main');
      target = 'main';
    } catch {
      try {
        await git(repoPath, 'rev-parse --verify master');
        target = 'master';
      } catch {
        target = await getCurrentBranch(repoPath);
      }
    }
  }

  // Get diff stats
  const statsOutput = await git(repoPath, `diff --stat "${target}...${branchName}"`);

  // Parse stats output
  // Last line is like: " 5 files changed, 100 insertions(+), 20 deletions(-)"
  const lines = statsOutput.split('\n').filter(Boolean);
  const summaryLine = lines[lines.length - 1] || '';

  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;

  const filesMatch = summaryLine.match(/(\d+) files? changed/);
  const insertMatch = summaryLine.match(/(\d+) insertions?\(\+\)/);
  const deleteMatch = summaryLine.match(/(\d+) deletions?\(-\)/);

  if (filesMatch) filesChanged = parseInt(filesMatch[1], 10);
  if (insertMatch) insertions = parseInt(insertMatch[1], 10);
  if (deleteMatch) deletions = parseInt(deleteMatch[1], 10);

  // Get list of changed files
  const filesOutput = await git(repoPath, `diff --name-only "${target}...${branchName}"`);
  const files = filesOutput.split('\n').filter(Boolean);

  return {
    filesChanged,
    insertions,
    deletions,
    files,
  };
}

/**
 * Get the default branch (main or master)
 */
export async function getDefaultBranch(repoPath: string): Promise<string> {
  try {
    await git(repoPath, 'rev-parse --verify main');
    return 'main';
  } catch {
    try {
      await git(repoPath, 'rev-parse --verify master');
      return 'master';
    } catch {
      // Fall back to current branch
      return getCurrentBranch(repoPath);
    }
  }
}

/**
 * Check if there are uncommitted changes in a worktree
 */
export async function hasUncommittedChanges(worktreePath: string): Promise<boolean> {
  const status = await git(worktreePath, 'status --porcelain');
  return status.length > 0;
}

/**
 * Get the username for branch naming (from git config or OS)
 */
export async function getUsername(repoPath: string): Promise<string> {
  try {
    const gitUser = await git(repoPath, 'config user.name');
    if (gitUser) {
      return slugify(gitUser);
    }
  } catch {
    // Fall through to OS username
  }

  return os.userInfo().username || 'user';
}
