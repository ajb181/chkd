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
