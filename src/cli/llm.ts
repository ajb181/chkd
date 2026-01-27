/**
 * LLM utilities for chkd CLI
 * Uses Anthropic Claude API for intelligent operations
 */

import Anthropic from '@anthropic-ai/sdk';

// API key - set via CHKD_API_KEY env var or fallback
const API_KEY = process.env.CHKD_API_KEY || process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!API_KEY) {
      throw new Error('No API key found. Set CHKD_API_KEY or ANTHROPIC_API_KEY environment variable.');
    }
    client = new Anthropic({ apiKey: API_KEY });
  }
  return client;
}

export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Send a prompt to Claude and get a response
 */
export async function prompt(
  userPrompt: string,
  options: LLMOptions = {}
): Promise<string> {
  const {
    model = 'claude-sonnet-4-20250514',
    maxTokens = 4096,
    temperature = 0.3
  } = options;

  const response = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }
  return textBlock.text;
}

/**
 * Check if LLM is available (API key configured)
 */
export function isAvailable(): boolean {
  return !!API_KEY;
}

/**
 * Merge an existing CLAUDE.md with chkd requirements
 */
export async function mergeClaudeMd(
  existingContent: string,
  templateContent: string,
  projectName: string
): Promise<string> {
  const systemPrompt = `You are helping upgrade a project to use chkd (a spec-driven development workflow).

Your task: Merge the existing CLAUDE.md with the chkd template requirements.

RULES:
1. KEEP all valuable project-specific content (tech stack, architecture, patterns, guidelines, incident logs, etc.)
2. ADD these essential chkd sections if missing:
   - "Source of Truth" section pointing to chkd (tasks in database) and docs/GUIDE.md
   - "Working with chkd" section with the workflow commands
3. RESTRUCTURE for clarity - put chkd essentials near the top after project overview
4. REMOVE only clearly redundant placeholder text (like "[describe your project here]")
5. Output ONLY the merged markdown, no explanations

The project name is: ${projectName}`;

  const userPrompt = `## EXISTING CLAUDE.md:
\`\`\`markdown
${existingContent}
\`\`\`

## CHKD TEMPLATE (sections to add if missing):
\`\`\`markdown
${templateContent}
\`\`\`

Merge these into a single, well-organized CLAUDE.md. Output only the merged markdown:`;

  return await prompt(systemPrompt + '\n\n' + userPrompt, {
    maxTokens: 8192,
    temperature: 0.2
  });
}

/**
 * Determine if a story needs workflow tasks and generate appropriate sub-items
 */
export async function expandStory(
  title: string,
  context?: { existingAreas?: string[]; projectDescription?: string }
): Promise<{
  needsWorkflow: boolean;
  suggestedArea: string;
  description: string;
  subItems: string[];
}> {
  const systemPrompt = `You are a spec assistant for chkd (spec-driven development).

Your task: Analyze a new story/feature and determine:
1. If it needs the standard workflow sub-items (Explore, Design, Prototype, etc.)
2. What area it belongs to (SD=Site Design, FE=Frontend, BE=Backend, FUT=Future)
3. A brief description
4. Appropriate sub-items (workflow tasks OR custom tasks OR none)

WORKFLOW TASKS (use for substantial features):
- Explore: understand problem, search existing functions
- Design: flow diagram if needed
- Prototype: backend with test data + frontend calling it
- Feedback: user reviews prototype
- Implement: replace test data with real logic
- Polish: iterate based on usage

DON'T use workflow for:
- Bug fixes (use /bugfix skill instead)
- Simple config changes
- One-liner tasks
- Documentation updates

DO use workflow for:
- New features with UI + backend
- Complex refactors
- Major integrations

Respond with JSON only:
{
  "needsWorkflow": true/false,
  "suggestedArea": "SD|FE|BE|FUT",
  "description": "Brief one-line description",
  "subItems": ["Sub-item 1", "Sub-item 2"] // empty if no sub-items needed
}`;

  const userPrompt = `Story title: "${title}"
${context?.projectDescription ? `Project: ${context.projectDescription}` : ''}
${context?.existingAreas ? `Existing areas: ${context.existingAreas.join(', ')}` : ''}

Analyze and return JSON:`;

  const response = await prompt(systemPrompt + '\n\n' + userPrompt, {
    maxTokens: 1024,
    temperature: 0.2
  });

  try {
    // Extract JSON from response (might have markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback if LLM doesn't return valid JSON
    return {
      needsWorkflow: title.length > 50, // heuristic: long titles = complex
      suggestedArea: 'FE',
      description: '',
      subItems: []
    };
  }
}

/**
 * Generate smart workflow steps adapted to a specific feature
 * Takes the standard workflow template and adapts it to the feature context
 */
export async function generateSmartWorkflow(
  title: string,
  options?: {
    description?: string;
    userTasks?: string[];
    areaCode?: string;
  }
): Promise<{
  tasks: string[];
  suggestedArea?: string;
  reasoning?: string;
}> {
  const systemPrompt = `You are a workflow assistant for chkd (spec-driven development).

Your task: Adapt the standard workflow steps to be specific and actionable for the given feature.

THE WORKFLOW PHILOSOPHY:
This workflow prevents wasted effort by getting user feedback BEFORE full implementation.
Each stage has a PURPOSE - don't skip stages, adapt them to the feature.

STANDARD WORKFLOW (6 stages):
1. Explore - Research first: understand the problem, check existing code/patterns
2. Design - Plan the approach: diagram if complex, identify edge cases
3. Prototype - Build quickly with TEST DATA: working UI + backend stubs, not production-ready
4. Feedback - USER REVIEWS prototype: get sign-off before investing in real implementation
5. Implement - Replace test data with REAL LOGIC: now that approach is validated
6. Polish - Iterate based on ACTUAL USAGE: edge cases, error states, performance

KEY PRINCIPLES:
- Feedback stage is CRITICAL - it's when users validate before you invest fully
- Prototype uses test/mock data so you can iterate quickly
- Implement only happens AFTER user approves the prototype
- Every feature should have Explore (research) and Feedback (validation)
- FOR FRONTEND: design with mock data + backend endpoint contract FIRST, get user sign-off on UX before building real backend
- FOR BACKEND: stub the endpoint with test data, let frontend integrate, then implement real logic

RULES:
1. KEEP all 6 workflow stages unless truly irrelevant (e.g., pure config change)
2. ADAPT each stage description to be specific to this feature
3. MERGE user-provided tasks into appropriate stages
4. Keep descriptions SHORT (under 10 words each)
5. Simple tasks (bug fixes, config) can have fewer stages

EXAMPLES:
- "User authentication" → ["Explore: check existing auth patterns", "Design: auth flow + endpoint contract", "Prototype: login UI + mock API responses", "Feedback: user tests login UX", "Implement: real auth + session handling", "Polish: error states + remember me"]
- "Dashboard charts" → ["Explore: check charting libraries", "Design: chart types + data endpoint contract", "Prototype: charts with mock data", "Feedback: user reviews chart UX", "Implement: real data endpoints", "Polish: loading states + responsiveness"]
- "Fix button color" → ["Implement: update button color"] (simple fix, 1 step)
- "API caching" → ["Explore: identify slow endpoints", "Design: cache invalidation strategy", "Prototype: cache with test data", "Feedback: verify cache behavior", "Implement: full cache layer", "Polish: monitoring + cache warming"]

Respond with JSON only:
{
  "tasks": ["Task 1", "Task 2", ...],
  "suggestedArea": "SD|FE|BE|FUT",
  "reasoning": "Brief explanation of adaptations"
}`;

  const userPrompt = `Feature: "${title}"
${options?.description ? `Description: ${options.description}` : ''}
${options?.userTasks?.length ? `User wants these included: ${options.userTasks.join(', ')}` : ''}
${options?.areaCode ? `Area: ${options.areaCode}` : ''}

Generate adapted workflow tasks as JSON:`;

  const response = await prompt(systemPrompt + '\n\n' + userPrompt, {
    maxTokens: 1024,
    temperature: 0.3
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback - return empty to trigger default workflow
    return { tasks: [] };
  }
}

/**
 * Process a raw feature request into a well-structured story
 * Cleans up titles, generates user story, suggests area, and creates tasks
 */
export async function processFeatureRequest(
  rawInput: string,
  options?: {
    story?: string;
    areaCode?: string;
    projectContext?: string;
  }
): Promise<{
  title: string;
  story: string;
  area: string;
  tasks: string[];
  reasoning?: string;
}> {
  const systemPrompt = `You are a product assistant for chkd (spec-driven development).

Your task: Transform a raw feature request into a well-structured spec item.

INPUT: User's raw request (might be verbose, rambling, or a question)
OUTPUT: Clean, structured spec entry that PRESERVES the user's intent and context

RULES FOR TITLE:
1. 3-10 words - be specific, capture the feature
2. Start with action verb or noun
3. Remove question words ("Can we..." → describe the feature)
4. Remove filler ("I think", "maybe") but KEEP meaningful details

RULES FOR USER STORY:
1. Format: "As a [role], I want [feature] so that [benefit]"
2. PRESERVE user's original words and context where possible
3. Don't over-summarize - keep the detail that explains WHY

RULES FOR AREA:
- SD (Site Design): UI pages, layouts, UX flows, visual design
- FE (Frontend): Components, state, client-side logic
- BE (Backend): APIs, database, server logic, CLI
- FUT (Future): Ideas for later, not immediately planned

RULES FOR TASKS (flexible workflow):
Available phases - USE ONLY WHAT MAKES SENSE:
1. Explore: research problem, check existing code/patterns
2. Design: plan approach (skip for simple or backend-only tasks)
3. Prototype: build UI with mock data, stub backend (skip if no UI)
4. Feedback: user reviews and approves
5. Implement: connect real backend logic
6. Polish: error states, edge cases, performance
7. Docs: update documentation & guide (if user-facing feature)

FLEXIBILITY:
- Skip phases that don't apply (no wireframes for backend-only)
- Simple fixes might just be: Implement
- Full features might have all 7 phases
- Goal: solid controlled dev cycle, not rigid checklist

Keep each task under 10 words, specific to this feature.

EXAMPLES:

Input: "Can we add cards across the top for switching repos with info about what's being worked on"
Output:
{
  "title": "Repository Cards Navigation Strip",
  "story": "As a developer, I want repo cards across the top showing what's being worked on so that I can quickly switch between projects and see status at a glance.",
  "area": "SD",
  "tasks": ["Explore: research problem, check existing code/patterns", "Design: plan approach + define endpoint contracts", "Prototype: build UI with mock data, stub backend", "Feedback: user reviews and approves UX", "Implement: connect real backend logic", "Polish: error states, edge cases, performance"]
}

Input: "add API endpoint for user preferences"
Output:
{
  "title": "User Preferences API Endpoint",
  "story": "As a developer, I want a user preferences API endpoint so that the frontend can store and retrieve user settings.",
  "area": "BE",
  "tasks": ["Explore: check existing API patterns", "Design: endpoint contract and data schema", "Implement: build endpoint with validation", "Docs: update API documentation"]
}

Input: "fix the login button"
Output:
{
  "title": "Fix Login Button",
  "story": "As a user, I want the login button to work so that I can access my account.",
  "area": "FE",
  "tasks": ["Implement: debug and fix login button"]
}

Respond with JSON only.`;

  const userPrompt = `Raw request: "${rawInput}"
${options?.story ? `Additional context: ${options.story}` : ''}
${options?.areaCode ? `Preferred area: ${options.areaCode}` : ''}
${options?.projectContext ? `Project: ${options.projectContext}` : ''}

Transform into a well-structured spec item as JSON:`;

  const response = await prompt(systemPrompt + '\n\n' + userPrompt, {
    maxTokens: 1024,
    temperature: 0.3
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback - return cleaned up version
    const cleanTitle = rawInput
      .replace(/^(can we|could we|i want to|let's|maybe|i think)\s*/i, '')
      .replace(/\?+$/, '')
      .trim()
      .split(/\s+/)
      .slice(0, 8)
      .join(' ');

    return {
      title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
      story: '',
      area: options?.areaCode || 'FE',
      tasks: []
    };
  }
}

/**
 * Process a raw bug report into a clean, structured bug
 */
export async function processBugReport(
  rawInput: string,
  options?: {
    severityHint?: string;
  }
): Promise<{
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  isSmall: boolean;
}> {
  const systemPrompt = `You are a bug triage assistant for chkd (spec-driven development).

Your task: Transform a raw bug report into a clean, structured bug.

INPUT: User's raw bug description (might be verbose, vague, or conversational)
OUTPUT: Clean, actionable bug report

RULES FOR TITLE:
1. 3-10 words maximum
2. Describe the SYMPTOM, not the cause
3. Be specific about what's broken
4. Remove filler words

RULES FOR DESCRIPTION:
1. One sentence explaining the issue
2. Include any relevant context from the raw input
3. Keep under 50 words

RULES FOR SEVERITY:
- critical: App is unusable, data loss, security issue
- high: Major feature broken, affects many users
- medium: Feature partially broken, workaround exists
- low: Minor annoyance, cosmetic, edge case

RULES FOR isSmall:
- true: Likely <10 lines of code to fix (typos, simple logic errors, config)
- false: Requires investigation or significant changes

EXAMPLES:

Input: "the login button doesn't do anything when I click it"
Output:
{
  "title": "Login button unresponsive",
  "description": "Clicking the login button has no effect. Button appears but doesn't trigger authentication.",
  "severity": "high",
  "isSmall": false
}

Input: "theres a typo on the about page it says 'abuot'"
Output:
{
  "title": "Typo on about page",
  "description": "About page displays 'abuot' instead of 'about'.",
  "severity": "low",
  "isSmall": true
}

Input: "app crashes when you try to save with no data"
Output:
{
  "title": "Crash on empty save",
  "description": "Application crashes when save button is pressed with empty form data.",
  "severity": "high",
  "isSmall": false
}

Respond with JSON only.`;

  const userPrompt = `Raw bug report: "${rawInput}"
${options?.severityHint ? `Severity hint: ${options.severityHint}` : ''}

Transform into a structured bug report as JSON:`;

  const response = await prompt(systemPrompt + '\n\n' + userPrompt, {
    maxTokens: 512,
    temperature: 0.2
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback - return cleaned up version
    const cleanTitle = rawInput
      .replace(/^(the|there's|its|it's)\s*/i, '')
      .trim()
      .split(/\s+/)
      .slice(0, 10)
      .join(' ');

    return {
      title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
      description: rawInput,
      severity: 'medium',
      isSmall: rawInput.length < 50
    };
  }
}

/**
 * Process a raw quick win into a clean, structured task
 */
export async function processQuickWin(
  rawInput: string
): Promise<{
  title: string;
  description: string;
  effort: 'tiny' | 'small' | 'medium';
}> {
  const systemPrompt = `You are a task assistant for chkd (spec-driven development).

Your task: Transform a raw quick win idea into a clean, actionable task.

INPUT: User's raw description of a quick improvement
OUTPUT: Clean, specific quick win

RULES FOR TITLE:
1. 3-8 words maximum
2. Start with action verb (Add, Fix, Update, Improve, etc.)
3. Be specific about what will change
4. Remove filler words

RULES FOR DESCRIPTION:
1. One sentence explaining what and why
2. Keep under 30 words

RULES FOR EFFORT:
- tiny: < 5 minutes (typo fix, config change, one-liner)
- small: 5-30 minutes (simple feature, minor refactor)
- medium: 30-60 minutes (might need some thought)

EXAMPLES:

Input: "add a loading spinner somewhere so users know its working"
Output:
{
  "title": "Add loading spinner to main action",
  "description": "Show spinner during async operations so users know the app is working.",
  "effort": "small"
}

Input: "the error messages are confusing maybe make them clearer"
Output:
{
  "title": "Improve error message clarity",
  "description": "Rewrite error messages to be more user-friendly and actionable.",
  "effort": "small"
}

Input: "typo in the header"
Output:
{
  "title": "Fix header typo",
  "description": "Correct typo in the page header.",
  "effort": "tiny"
}

Respond with JSON only.`;

  const userPrompt = `Raw quick win: "${rawInput}"

Transform into a structured quick win as JSON:`;

  const response = await prompt(systemPrompt + '\n\n' + userPrompt, {
    maxTokens: 512,
    temperature: 0.2
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback
    const cleanTitle = rawInput
      .replace(/^(can we|maybe|lets|let's)\s*/i, '')
      .trim()
      .split(/\s+/)
      .slice(0, 8)
      .join(' ');

    return {
      title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
      description: rawInput,
      effort: 'small'
    };
  }
}

