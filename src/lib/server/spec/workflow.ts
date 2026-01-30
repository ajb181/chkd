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
 * Philosophy: Get user feedback BEFORE investing in real implementation.
 * Each phase has fixed sub-tasks that force human+AI checkpoints.
 */
export const DEFAULT_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    task: 'Explore: research problem, check existing code/patterns & files',
    children: ['Research: investigate codebase, problem space, and any discovery docs', 'Questions: consider if clarification needed - ask user if unclear', 'Share: inform user of findings before continuing']
  },
  {
    task: 'Design: plan approach + define endpoint contracts',
    children: ['Draft: create initial design/approach', 'Review: show user, iterate if needed']
  },
  {
    task: 'Prototype: build UI with mock data, stub backend',
    children: ['Build: create the prototype', 'Verify: compare to spec/wireframe, iterate if gaps']
  },
  {
    task: 'Feedback: user reviews and approves UX',
    children: ['Demo: show user the prototype', 'Iterate: make changes based on feedback']
  },
  {
    task: 'Implement: connect real backend logic',
    children: ['Build: implement real logic', 'Verify: test functionality works']
  },
  {
    task: 'Polish: error states, edge cases, second-order effects',
    children: ['Consider: wider impact, what else could this affect', 'Review: inspect the work thoroughly', 'Confirm: verify against discovery assumptions if any, show user findings, get approval']
  },
  {
    task: 'Document: update docs, guides, and CLAUDE.md if needed',
    children: ['Write: update relevant documentation', 'Review: confirm docs match implementation']
  },
  {
    task: 'Commit: commit code to git with descriptive message',
    children: ['Stage: review changes, stage files', 'Commit: summary line (what), body (why + assumptions), push to remote']
  }
];

// Area-specific Polish steps
const FE_POLISH_STEP: WorkflowStep = {
  task: 'Polish: error states, edge cases, second-order effects',
  children: ['Consider: wider impact - loading states, empty states, error displays', 'Review: open browser, visually check UI renders correctly', 'Confirm: verify against discovery assumptions if any, show user findings, get approval']
};

const BE_POLISH_STEP: WorkflowStep = {
  task: 'Polish: error states, edge cases, second-order effects',
  children: ['Consider: wider impact - error handling, input validation, edge cases', 'Review: trace through scenarios, check error paths work', 'Confirm: verify against discovery assumptions if any, show user findings, get approval']
};

/** Get area-appropriate Polish step */
function getPolishStep(areaCode?: string): WorkflowStep {
  if (areaCode === 'SD' || areaCode === 'FE') return FE_POLISH_STEP;
  if (areaCode === 'BE') return BE_POLISH_STEP;
  return DEFAULT_WORKFLOW_STEPS[5]; // Generic
}

// Type-specific workflows - reduced phases for different task types

/** Remove workflow: Explore → Implement → Commit (skip UI/feedback phases) */
export const REMOVE_WORKFLOW: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  DEFAULT_WORKFLOW_STEPS[4], // Implement
  DEFAULT_WORKFLOW_STEPS[7], // Commit
];

/** Backend workflow: Explore → Design → Implement → Polish → Commit (skip Prototype/Feedback) */
export const BACKEND_WORKFLOW: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  DEFAULT_WORKFLOW_STEPS[1], // Design
  DEFAULT_WORKFLOW_STEPS[4], // Implement
  DEFAULT_WORKFLOW_STEPS[5], // Polish
  DEFAULT_WORKFLOW_STEPS[7], // Commit
];

/** Refactor workflow: Explore → Implement → Polish → Commit */
export const REFACTOR_WORKFLOW: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  DEFAULT_WORKFLOW_STEPS[4], // Implement
  DEFAULT_WORKFLOW_STEPS[5], // Polish
  DEFAULT_WORKFLOW_STEPS[7], // Commit
];

/** Audit workflow: Explore → Feedback → Document → Commit (research + discuss findings) */
export const AUDIT_WORKFLOW: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  DEFAULT_WORKFLOW_STEPS[3], // Feedback (discuss findings)
  DEFAULT_WORKFLOW_STEPS[6], // Document
  DEFAULT_WORKFLOW_STEPS[7], // Commit
];

/** Debug workflow: Explore → Verify → Implement → Commit (investigate + confirm fix approach + fix) */
export const DEBUG_WORKFLOW: WorkflowStep[] = [
  DEFAULT_WORKFLOW_STEPS[0], // Explore
  {
    task: 'Verify: confirm findings and fix approach with user',
    children: ['Share: present findings to user', 'Confirm: get user approval on fix approach']
  },
  DEFAULT_WORKFLOW_STEPS[4], // Implement
  DEFAULT_WORKFLOW_STEPS[7], // Commit
];

/** Frontend workflow: Explore → Design → Build (with mocks) → Test → Polish → Commit
 *  Philosophy: Build UI first with mock data but correct function signatures.
 *  Backend is a separate item. Wire-up happens after both exist.
 */
export const FRONTEND_WORKFLOW: WorkflowStep[] = [
  {
    task: 'Explore: research problem, check existing code/patterns',
    children: ['Research: investigate codebase and problem space', 'Share: inform user of findings']
  },
  {
    task: 'Design: plan approach + define function/API contracts',
    children: ['Draft: component structure, props, function signatures', 'Review: confirm approach with user']
  },
  {
    task: 'Build: create UI with mock data, correct function signatures',
    children: ['Implement: build components with TypeScript interfaces', 'Mock: stub API calls with realistic fake data']
  },
  {
    task: 'Test: verify UI works correctly with mocks',
    children: ['Manual: click through all states in browser', 'Verify: loading, empty, error states all render']
  },
  FE_POLISH_STEP,
  {
    task: 'Commit: commit code with descriptive message',
    children: ['Stage: review changes', 'Commit: push to remote']
  }
];

/** Valid workflow types */
export type WorkflowType = 'remove' | 'backend' | 'refactor' | 'audit' | 'debug' | 'frontend';

/** Get workflow steps by type and area */
export function getWorkflowByType(type?: string, areaCode?: string): WorkflowStep[] {
  const polish = getPolishStep(areaCode);

  switch (type) {
    case 'remove': return REMOVE_WORKFLOW;
    case 'frontend': return FRONTEND_WORKFLOW;
    case 'backend':
      // Backend always uses BE Polish
      return [
        DEFAULT_WORKFLOW_STEPS[0], // Explore
        DEFAULT_WORKFLOW_STEPS[1], // Design
        DEFAULT_WORKFLOW_STEPS[4], // Implement
        BE_POLISH_STEP,
        DEFAULT_WORKFLOW_STEPS[7], // Commit
      ];
    case 'refactor':
      // Refactor uses area-aware Polish
      return [
        DEFAULT_WORKFLOW_STEPS[0], // Explore
        DEFAULT_WORKFLOW_STEPS[4], // Implement
        polish,
        DEFAULT_WORKFLOW_STEPS[7], // Commit
      ];
    case 'audit': return AUDIT_WORKFLOW;
    case 'debug': return DEBUG_WORKFLOW;
    default:
      // Area-aware defaults: FE gets frontend workflow, BE gets backend workflow
      if (areaCode === 'FE' || areaCode === 'SD') return FRONTEND_WORKFLOW;
      if (areaCode === 'BE') return [
        DEFAULT_WORKFLOW_STEPS[0], // Explore
        DEFAULT_WORKFLOW_STEPS[1], // Design
        DEFAULT_WORKFLOW_STEPS[4], // Implement
        BE_POLISH_STEP,
        DEFAULT_WORKFLOW_STEPS[7], // Commit
      ];
      // Generic fallback
      return [
        DEFAULT_WORKFLOW_STEPS[0], // Explore
        DEFAULT_WORKFLOW_STEPS[1], // Design
        DEFAULT_WORKFLOW_STEPS[4], // Implement
        polish,
        DEFAULT_WORKFLOW_STEPS[7], // Commit
      ];
  }
}
