import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SpecParser } from '$lib/server/spec/parser';
import { promises as fs } from 'fs';
import path from 'path';

// GET /api/spec/validate - Validate SPEC.md format
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repoPath = url.searchParams.get('repoPath');
    const fix = url.searchParams.get('fix') === 'true';

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');

    // Check if file exists
    try {
      await fs.access(specPath);
    } catch {
      return json({ success: false, error: 'No docs/SPEC.md found' }, { status: 404 });
    }

    const content = await fs.readFile(specPath, 'utf-8');
    const parser = new SpecParser();
    const result = parser.validate(content);

    const fixed: string[] = [];

    // Auto-fix if requested
    if (fix && result.issues.length > 0) {
      let newContent = content;
      const lines = newContent.split('\n');

      for (const issue of result.issues) {
        // Fix: Empty checkbox (add space)
        if (issue.message.includes('Empty checkbox') && issue.line) {
          const lineIdx = issue.line - 1;
          if (lines[lineIdx]) {
            lines[lineIdx] = lines[lineIdx].replace(/\[\]/, '[ ]');
            fixed.push(`Line ${issue.line}: Fixed empty checkbox`);
          }
        }

        // Fix: Inconsistent checkbox marker
        if (issue.message.includes('checkbox marker') && issue.line) {
          const lineIdx = issue.line - 1;
          if (lines[lineIdx]) {
            lines[lineIdx] = lines[lineIdx]
              .replace(/\[X\]/, '[x]')
              .replace(/\[-\]/, '[~]');
            fixed.push(`Line ${issue.line}: Normalized checkbox marker`);
          }
        }
      }

      if (fixed.length > 0) {
        newContent = lines.join('\n');
        await fs.writeFile(specPath, newContent, 'utf-8');
      }
    }

    // Re-validate after fixes
    const finalContent = fix && fixed.length > 0
      ? await fs.readFile(specPath, 'utf-8')
      : content;
    const finalResult = parser.validate(finalContent);

    return json({
      success: true,
      data: {
        valid: finalResult.valid,
        issues: finalResult.issues.map(i => ({
          type: i.type,
          message: i.message,
          line: i.line,
          fixable: i.message.includes('checkbox') // Mark fixable issues
        })),
        fixed,
        stats: {
          areasFound: finalResult.areasFound,
          phasesFound: finalResult.phasesFound,
          itemsFound: finalResult.itemsFound,
          emptyAreas: finalResult.emptyAreas
        }
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
