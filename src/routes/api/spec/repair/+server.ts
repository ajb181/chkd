import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SpecParser } from '$lib/server/spec/parser';
import { promises as fs } from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

// API key - set via CHKD_API_KEY env var or fallback
const API_KEY = process.env.CHKD_API_KEY || process.env.ANTHROPIC_API_KEY;

async function repairSpec(specContent: string): Promise<string> {
  if (!API_KEY) {
    throw new Error('No API key found. Set CHKD_API_KEY or ANTHROPIC_API_KEY environment variable.');
  }

  const client = new Anthropic({ apiKey: API_KEY });

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

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    temperature: 0.1,
    messages: [{ role: 'user', content: systemPrompt + '\n\n' + userPrompt }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }
  return textBlock.text;
}

// POST /api/spec/repair - Repair SPEC.md using AI
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!API_KEY) {
      return json({ success: false, error: 'No API key configured. Set CHKD_API_KEY or ANTHROPIC_API_KEY.' }, { status: 500 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    const backupPath = path.join(repoPath, 'docs', 'SPEC-backup.md');

    // Check if file exists
    let specContent: string;
    try {
      specContent = await fs.readFile(specPath, 'utf-8');
    } catch {
      return json({ success: false, error: 'No docs/SPEC.md found' }, { status: 404 });
    }

    // Create backup
    await fs.writeFile(backupPath, specContent, 'utf-8');

    // Repair using AI
    const repairedContent = await repairSpec(specContent);

    // Write repaired content
    await fs.writeFile(specPath, repairedContent, 'utf-8');

    // Parse and get stats
    const parser = new SpecParser();
    const parsed = parser.parse(repairedContent);

    return json({
      success: true,
      data: {
        totalItems: parsed.totalItems,
        areaCount: parsed.phases?.length || 0,
        progress: parsed.progress,
        backupPath: 'docs/SPEC-backup.md'
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
