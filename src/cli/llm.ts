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
   - "Source of Truth" section pointing to docs/SPEC.md, docs/GUIDE.md
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
 * Repair and reformat a SPEC.md file to follow the correct chkd format
 */
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

export async function repairSpec(specContent: string): Promise<string> {
  const systemPrompt = `You are a spec formatter for chkd (a spec-driven development workflow).

Your task: Reformat the given SPEC.md content to follow the correct chkd format.

REQUIRED FORMAT:
\`\`\`markdown
# Project Name Specification

> Brief project description

---

## Area: SD (Site Design)

> Pages, layouts, user experience.

- [ ] **SD.1 Feature Name** - Description
  - [ ] Sub-task here
  - [ ] Another sub-task
- [x] **SD.2 Completed Feature** - Already done

---

## Area: FE (Frontend)

> Components, state management, client-side logic.

- [ ] **FE.1 Component Name** - Description

---

## Area: BE (Backend)

> APIs, services, database, server logic.

- [ ] **BE.1 Endpoint Name** - Description

---

## Area: FUT (Future)

> Planned features and ideas for later.

- [ ] **FUT.1 Future Idea** - Description
\`\`\`

RULES:
1. Area headers MUST be: \`## Area: XX (Full Name)\` where XX is the code
2. Standard area codes: SD (Site Design), FE (Frontend), BE (Backend), FUT (Future)
3. You may create custom area codes if content doesn't fit standard areas
4. Item format MUST be: \`- [ ] **XX.N Title** - Description\`
   - XX = area code (SD, FE, BE, FUT, or custom)
   - N = sequential number within area (1, 2, 3...)
5. Sub-items are indented with 2 spaces: \`  - [ ] Sub-task\`
6. Preserve completion status: [ ] unchecked, [x] checked, [~] in-progress
7. NEVER add new items - only reorganize and reformat what's there
8. NEVER remove items - all existing content must be preserved
9. Preserve descriptions and meaning - just fix formatting
10. Add \`---\` separators between areas
11. Add area description blockquotes under each header
12. Output ONLY the reformatted markdown, no explanations

If the content is already well-formatted, make minimal changes.`;

  const userPrompt = `## CURRENT SPEC.md:
\`\`\`markdown
${specContent}
\`\`\`

Reformat this SPEC.md to follow the correct chkd format. Output only the reformatted markdown:`;

  return await prompt(systemPrompt + '\n\n' + userPrompt, {
    maxTokens: 16384,
    temperature: 0.1
  });
}
