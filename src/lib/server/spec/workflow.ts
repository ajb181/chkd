/**
 * Workflow templates for new features
 *
 * These are pure functions that return workflow step arrays.
 * No file I/O or parser dependencies.
 */

import type { WorkflowStep } from '$lib/types';

/**
 * Streamlined workflow steps for new features (11 checkpoints)
 *
 * Philosophy:
 * - Get user feedback BEFORE investing in real implementation
 * - Minimal checkpoints that enforce human+AI collaboration
 * - FE/SD: 11 checkpoints, BE: 9 checkpoints (no Prototype)
 */
export const DEFAULT_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    task: 'Explore: research problem and existing code',
    children: [
      'Research: investigate codebase, find reusable patterns',
      'Share: discuss findings with user, clarify if unclear'
    ]
  },
  {
    task: 'Design: plan the approach',
    children: [
      'Draft: create approach (reference existing patterns)',
      'Review: show user, WAIT FOR EXPLICIT APPROVAL before proceeding'
    ]
  },
  {
    task: 'Prototype: define contracts and build UI',
    children: [
      'Contract: define API/function signatures',
      'Build: create UI with mock data, verify it works'
    ]
  },
  {
    task: 'Implement: build and test',
    children: [
      'Build: implement the feature/fix',
      'Test: verify, run tests, DEMO TO USER, GET APPROVAL before continuing'
    ]
  },
  {
    task: 'Review: independent code review',
    children: [
      'Review: run /review skill, GET PASSED RESULT, GET USER APPROVAL, call ReviewDone(itemId, summary)'
    ]
  },
  {
    task: 'Finish: commit and document',
    children: [
      'Commit: stage, commit, push',
      'Document: create/update documentation and guides if required'
    ]
  }
];

/**
 * Backend workflow (9 checkpoints) - skips Prototype phase
 */
export const BE_WORKFLOW_STEPS: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  DEFAULT_WORKFLOW_STEPS[1], // Design
  // Skip Prototype (index 2)
  DEFAULT_WORKFLOW_STEPS[3], // Implement
  DEFAULT_WORKFLOW_STEPS[4], // Polish
  DEFAULT_WORKFLOW_STEPS[5], // Finish
];

/**
 * Bug/Debug workflow (8 checkpoints) - focused on investigation and fix
 */
export const BUG_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    task: 'Investigate: understand and reproduce the bug',
    children: [
      'Reproduce: replicate the bug, document exact steps to trigger it',
      'Root cause: find why it happens (logs, stack traces, bisect)'
    ]
  },
  {
    task: 'Fix: implement the solution',
    children: [
      'Implement: fix the root cause',
      'Test: check fix works, look for regressions'
    ]
  },
  {
    task: 'Review: ensure fix is solid',
    children: [
      'Test: run tests, check for side effects',
      'Review: run /review skill, GET PASSED RESULT, GET USER APPROVAL, call ReviewDone(itemId, summary)'
    ]
  },
  {
    task: 'Finish: commit and document',
    children: [
      'Commit: stage, commit with bug reference',
      'Document: update docs if behavior changed'
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
    task: 'Confirm: write plan and get user approval',
    children: [
      'Plan file: write detailed refactor plan to docs/refactor-{name}.md',
      'Checklist: list each change as checkbox item in the plan',
      'Share: show plan file to user',
      'Approve: get explicit go-ahead before any changes'
    ]
  },
  {
    task: 'Refactor: make the changes',
    children: [
      'Change: restructure the code, tick each item in plan file as done',
      'Preserve: keep behavior exactly the same'
    ]
  },
  {
    task: 'Verify: ensure refactor is solid',
    children: [
      'Test: ALL tests again (unit + e2e), same behavior',
      'Review: run /review skill, GET PASSED RESULT, GET USER APPROVAL, call ReviewDone(itemId, summary)'
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
    task: 'Verify: review and confirm',
    children: [
      'Review: run /review skill, GET PASSED RESULT, GET USER APPROVAL, call ReviewDone(itemId, summary)',
      'Demo: show user the fix, WAIT FOR EXPLICIT APPROVAL'
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
export type WorkflowType = 'remove' | 'refactor' | 'audit' | 'quickwin';

/** Get workflow steps by type and area code */
export function getWorkflowByType(type?: string, areaCode?: string): WorkflowStep[] {
  switch (type) {
    case 'remove': return REMOVE_WORKFLOW;
    case 'refactor': return REFACTOR_WORKFLOW;
    case 'audit': return AUDIT_WORKFLOW;
    case 'quickwin': return QUICKWIN_WORKFLOW;
    default:
      // Area-specific workflows
      if (areaCode === 'BE') return BE_WORKFLOW_STEPS;
      if (areaCode === 'BUG') return BUG_WORKFLOW_STEPS;
      return DEFAULT_WORKFLOW_STEPS;
  }
}
