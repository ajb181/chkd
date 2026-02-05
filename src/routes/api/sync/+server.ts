import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRepoByPath, createRepo } from '$lib/server/db/queries';
import fs from 'fs';
import path from 'path';

// POST /api/sync - Sync project files from templates
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    const projectName = path.basename(repoPath);
    const results: string[] = [];

    // 1. Check/register project
    let repo = getRepoByPath(repoPath);
    if (!repo) {
      repo = createRepo(repoPath, projectName, 'main');
      results.push('✅ Project registered');
    } else {
      results.push('✓ Project registered');
    }

    // 2. Find templates directory (relative to this file's location in build)
    // In dev, templates are at project root
    const possibleTemplatePaths = [
      path.join(process.cwd(), 'templates'),
      path.join(process.cwd(), '..', 'templates'),
      '/Users/mdntxpress/software-projects/chkd/templates'
    ];
    
    let templatesDir = '';
    for (const p of possibleTemplatePaths) {
      if (fs.existsSync(path.join(p, 'CLAUDE-chkd-section.md'))) {
        templatesDir = p;
        break;
      }
    }

    if (!templatesDir) {
      return json({ success: false, error: 'Templates directory not found' }, { status: 500 });
    }

    // 3. CLAUDE.md - merge chkd section
    const claudePath = path.join(repoPath, 'CLAUDE.md');
    const sectionPath = path.join(templatesDir, 'CLAUDE-chkd-section.md');
    const fullTemplatePath = path.join(templatesDir, 'CLAUDE.md.template');

    try {
      const chkdSection = fs.readFileSync(sectionPath, 'utf-8');
      let claudeExists = false;
      let existingContent = '';

      try {
        existingContent = fs.readFileSync(claudePath, 'utf-8');
        claudeExists = true;
      } catch {}

      const startMarker = '<!-- chkd:start -->';
      const endMarker = '<!-- chkd:end -->';

      if (claudeExists) {
        if (existingContent.includes(startMarker) && existingContent.includes(endMarker)) {
          const before = existingContent.substring(0, existingContent.indexOf(startMarker));
          const after = existingContent.substring(existingContent.indexOf(endMarker) + endMarker.length);
          fs.writeFileSync(claudePath, before + chkdSection + after);
          results.push('✅ CLAUDE.md section updated');
        } else {
          // Find old section header and replace, or append
          const lines = existingContent.split('\n');
          const sectionIdx = lines.findIndex(l => l.includes('## Working with chkd'));
          
          if (sectionIdx >= 0) {
            let endIdx = lines.findIndex((l, i) => i > sectionIdx && l.startsWith('## '));
            if (endIdx === -1) endIdx = lines.length;
            const before = lines.slice(0, sectionIdx);
            const after = lines.slice(endIdx);
            fs.writeFileSync(claudePath, [...before, chkdSection, ...after].join('\n'));
            results.push('✅ CLAUDE.md section replaced');
          } else {
            // Append after title
            let insertIndex = 0;
            if (lines[0]?.startsWith('# ')) {
              insertIndex = 1;
              while (insertIndex < lines.length && lines[insertIndex].trim() === '') insertIndex++;
            }
            lines.splice(insertIndex, 0, '', chkdSection, '');
            fs.writeFileSync(claudePath, lines.join('\n'));
            results.push('✅ CLAUDE.md section added');
          }
        }
      } else {
        let template = fs.readFileSync(fullTemplatePath, 'utf-8');
        template = template.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
        fs.writeFileSync(claudePath, template);
        results.push('✅ CLAUDE.md created');
      }
    } catch (err) {
      results.push(`⚠️ CLAUDE.md error: ${err}`);
    }

    // 4. docs/ files
    const docsPath = path.join(repoPath, 'docs');
    const templateDocsPath = path.join(templatesDir, 'docs');

    try {
      fs.mkdirSync(docsPath, { recursive: true });
      const docFiles = ['GUIDE.md', 'PHILOSOPHY.md', 'FILING.md', 'WORKFLOW.md', 'AGENT-GOVERNANCE.md'];
      let copiedCount = 0;

      for (const file of docFiles) {
        try {
          const content = fs.readFileSync(path.join(templateDocsPath, file), 'utf-8');
          fs.writeFileSync(path.join(docsPath, file), content);
          copiedCount++;
        } catch {}
      }
      results.push(`✅ docs/ synced (${copiedCount} files)`);
    } catch (err) {
      results.push(`⚠️ docs/ error: ${err}`);
    }

    // 5. .claude/skills/ - sync skills from templates (delete old, copy new)
    const skillsPath = path.join(repoPath, '.claude', 'skills');
    const templateSkillsPath = path.join(templatesDir, 'skills');

    try {
      if (fs.existsSync(templateSkillsPath)) {
        fs.mkdirSync(skillsPath, { recursive: true });

        const templateSkillDirs = fs.readdirSync(templateSkillsPath, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);

        // Delete skills that aren't in templates
        let deletedCount = 0;
        if (fs.existsSync(skillsPath)) {
          const existingSkillDirs = fs.readdirSync(skillsPath, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);

          for (const existingSkill of existingSkillDirs) {
            if (!templateSkillDirs.includes(existingSkill)) {
              fs.rmSync(path.join(skillsPath, existingSkill), { recursive: true });
              deletedCount++;
            }
          }
        }

        // Copy skills from templates
        let copiedCount = 0;
        for (const skillDir of templateSkillDirs) {
          const srcDir = path.join(templateSkillsPath, skillDir);
          const destDir = path.join(skillsPath, skillDir);
          fs.mkdirSync(destDir, { recursive: true });

          const files = fs.readdirSync(srcDir);
          for (const file of files) {
            const content = fs.readFileSync(path.join(srcDir, file), 'utf-8');
            fs.writeFileSync(path.join(destDir, file), content);
          }
          copiedCount++;
        }

        const deleteMsg = deletedCount > 0 ? `, ${deletedCount} removed` : '';
        results.push(`✅ skills/ synced (${copiedCount} skills${deleteMsg})`);
      }
    } catch (err) {
      results.push(`⚠️ skills/ error: ${err}`);
    }

    // 6. .gitignore
    const gitignorePath = path.join(repoPath, '.gitignore');
    const chkdIgnoreBlock = `
# chkd managed files (synced from templates, not committed)
CLAUDE.md
docs/GUIDE.md
docs/PHILOSOPHY.md
docs/FILING.md
docs/WORKFLOW.md
docs/AGENT-GOVERNANCE.md
.claude/skills/`;

    try {
      let gitignoreContent = '';
      try { gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8'); } catch {}
      
      if (!gitignoreContent.includes('# chkd managed files')) {
        fs.appendFileSync(gitignorePath, chkdIgnoreBlock + '\n');
        results.push('✅ .gitignore updated');
      } else {
        results.push('✓ .gitignore configured');
      }
    } catch (err) {
      results.push(`⚠️ .gitignore error: ${err}`);
    }

    return json({
      success: true,
      data: {
        project: projectName,
        results
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
