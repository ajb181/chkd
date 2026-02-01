/**
 * Workflow templates for new features
 *
 * These are pure functions that return workflow step arrays.
 * No file I/O or parser dependencies.
 */

import type { WorkflowStep } from '$lib/types';

/**
 * Default workflow steps for new features with nested checkpoint children
 *
 * Philosophy: 
 * - Get user feedback BEFORE investing in real implementation
 * - Each phase has fixed sub-tasks that force human+AI checkpoints
 * - Works for FE, BE, or full-stack via "Assess" checkpoints
 */
export const DEFAULT_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    task: 'Explore: research problem, check existing code/patterns & files',
    children: [
      'Research: investigate codebase, problem space, and any discovery docs',
      'Reuse: identify existing functions/patterns to extend rather than build from scratch',
      'Questions: consider if clarification needed - ask user if unclear',
      'Share: inform user of findings before continuing'
    ]
  },
  {
    task: 'Design: plan approach + define endpoint contracts',
    children: [
      'Reference: check wireframes, style guide, or similar elements for styling reference',
      'Draft: create initial design/approach',
      'Review: show user, iterate if needed'
    ]
  },
  {
    task: 'Prototype: build UI with mock data (if applicable)',
    children: [
      'Assess: does this task involve UI? If pure backend, note "N/A" and continue',
      'Contract: define API/function signatures and data structures (the mock is the spec)',
      'Build: create UI using those contracts with mock data',
      'Test: verify UI renders correctly, all states work',
      'Demo: show user, get feedback before building backend'
    ]
  },
  {
    task: 'Wire-up: implement backend and connect',
    children: [
      'Assess: backend needed? If frontend-only, note "N/A" and continue',
      'Implement: build backend to match the contracts defined in Prototype',
      'Connect: replace mocks with real calls',
      'Verify: test end-to-end flow'
    ]
  },
  {
    task: 'Feedback: user tests the real working feature',
    children: [
      'Demo: show user the working feature end-to-end',
      'Iterate: make changes based on feedback'
    ]
  },
  {
    task: 'Polish: error states, edge cases, second-order effects',
    children: [
      'Consider: wider impact, what else could this affect',
      'Tests: run ALL existing tests. If any fail: show user EXACT failure output, get approval before changing ANY test. Never rewrite a test just to make it pass',
      'Review: inspect the work thoroughly',
      'Confirm: verify against discovery assumptions if any, show user findings, get approval'
    ]
  },
  {
    task: 'Document: update docs, guides, and CLAUDE.md if needed',
    children: [
      'Write: update relevant documentation',
      'Review: confirm docs match implementation'
    ]
  },
  {
    task: 'Commit: commit code to git with descriptive message',
    children: [
      'Stage: review changes, stage files',
      'Commit: summary line (what), body (why + assumptions), push to remote'
    ]
  }
];

// Shorter workflows for specific task types

/** Remove workflow: Explore → Wire-up → Commit (deletion tasks) */
export const REMOVE_WORKFLOW: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  DEFAULT_WORKFLOW_STEPS[3], // Wire-up (the deletion work)
  DEFAULT_WORKFLOW_STEPS[7], // Commit
];

/** Refactor workflow: Understand → Plan → Tests Before → Confirm → Refactor → Tests After → Commit */
export const REFACTOR_WORKFLOW: WorkflowStep[] = [
  {
    task: 'Understand: what are we refactoring and why?',
    children: [
      'What: identify the code to refactor',
      'Why: cleaner, faster, simpler? Document the reason'
    ]
  },
  {
    task: 'Plan: design the refactor approach',
    children: [
      'Approach: how will you restructure it?',
      'Risks: what could break?'
    ]
  },
  {
    task: 'Tests Before: ensure existing behavior is captured',
    children: [
      'Find: locate existing tests (unit + e2e)',
      'Run: all tests must pass before refactoring',
      'Write: if no tests exist, write them first'
    ]
  },
  {
    task: 'Confirm: get user approval before changing',
    children: [
      'Share: present plan to user',
      'Approve: get explicit go-ahead'
    ]
  },
  {
    task: 'Refactor: make the changes',
    children: [
      'Change: restructure the code',
      'Preserve: keep behavior exactly the same'
    ]
  },
  {
    task: 'Tests After: verify nothing broke',
    children: [
      'Run: ALL tests again (unit + e2e)',
      'Verify: same behavior, all passing',
      'Add: write new tests if coverage gaps found'
    ]
  },
  {
    task: 'Commit: descriptive message',
    children: [
      'Stage: review all changes',
      'Commit: explain what changed and why'
    ]
  }
];

/** Audit workflow: Explore → Feedback → Document → Commit (research + discuss findings) */
export const AUDIT_WORKFLOW: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  DEFAULT_WORKFLOW_STEPS[4], // Feedback (discuss findings)
  DEFAULT_WORKFLOW_STEPS[6], // Document
  DEFAULT_WORKFLOW_STEPS[7], // Commit
];

/** Debug workflow: Reproduce → Investigate → Share → Fix → Test → Commit */
export const DEBUG_WORKFLOW: WorkflowStep[] = [
  {
    task: 'Reproduce: confirm the bug exists',
    children: [
      'Steps: what triggers the bug?',
      'Evidence: screenshot/log showing the bug'
    ]
  },
  {
    task: 'Investigate: find the root cause',
    children: [
      'Trace: follow the code path',
      'Cause: identify why it breaks'
    ]
  },
  {
    task: 'Share: present findings to user',
    children: [
      'Explain: what is broken and why',
      'Propose: how you will fix it'
    ]
  },
  {
    task: 'Fix: implement the fix',
    children: [
      'Change: make the fix',
      'Verify: confirm bug is gone'
    ]
  },
  {
    task: 'Test: check for regressions',
    children: [
      'Run: ALL existing tests',
      'Check: related functionality still works'
    ]
  },
  {
    task: 'Commit: descriptive message',
    children: [
      'Stage: review changes',
      'Commit: what was broken, why, how fixed'
    ]
  }
];

/** Quick Win workflow: Scope → Align → Fix → Verify → Commit */
export const QUICKWIN_WORKFLOW: WorkflowStep[] = [
  {
    task: 'Scope: identify the problem and draft solution',
    children: [
      'Problem: what exactly needs fixing?',
      'Solution: how will you fix it?'
    ]
  },
  {
    task: 'Align: confirm approach with user before starting',
    children: [
      'Share: explain the problem and proposed fix to user',
      'Confirm: get user approval to proceed'
    ]
  },
  {
    task: 'Fix: implement the change',
    children: [
      'Implement: make the fix',
      'Test: verify it works'
    ]
  },
  {
    task: 'Verify: show user, confirm they are happy',
    children: [
      'Demo: show user the fix',
      'Confirm: user approves the result'
    ]
  },
  {
    task: 'Commit: commit with descriptive message',
    children: [
      'Stage: review changes',
      'Commit: push with clear description of what was fixed and why'
    ]
  }
];

/** Valid workflow types */
export type WorkflowType = 'remove' | 'refactor' | 'audit' | 'debug' | 'quickwin';

/** Get workflow steps by type - default handles FE/BE/full-stack via Assess checkpoints */
export function getWorkflowByType(type?: string, _areaCode?: string): WorkflowStep[] {
  switch (type) {
    case 'remove': return REMOVE_WORKFLOW;
    case 'refactor': return REFACTOR_WORKFLOW;
    case 'audit': return AUDIT_WORKFLOW;
    case 'debug': return DEBUG_WORKFLOW;
    case 'quickwin': return QUICKWIN_WORKFLOW;
    default: return DEFAULT_WORKFLOW_STEPS;
  }
}
