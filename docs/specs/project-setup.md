# Project Setup System - Design Spec

> Checklist for building the complete project onboarding system.

---

## Overview

Three commands needed:
1. **`chkd init`** - Set up new (greenfield) project
2. **`chkd upgrade`** - Update existing project with latest templates
3. **`/discover`** - Analyze existing (brownfield) codebase

---

## 1. Master Templates Location

**Decision needed:** Where do master templates live?

### Option A: Inside chkd-v2 codebase
```
chkd-v2/
└── templates/
    ├── docs/
    │   ├── SPEC.md.template
    │   └── GUIDE.md
    ├── CLAUDE.md.template
    └── skills/
        ├── chkd/SKILL.md
        ├── bugfix/SKILL.md
        ├── story/SKILL.md
        ├── spec-check/SKILL.md
        ├── discover/SKILL.md
        └── idea/SKILL.md
```
- **Pro:** Single source of truth, version controlled with chkd
- **Con:** Need to rebuild/redeploy to update templates

### Option B: Separate templates repo
- **Pro:** Can update templates without rebuilding chkd
- **Con:** Another thing to manage

**Recommendation:** Option A - keep it simple, templates in chkd-v2

---

## 2. `chkd init` Checklist

### Creates these files:
- [ ] `docs/SPEC.md` - From template, with project name inserted
- [ ] `docs/GUIDE.md` - Copy as-is (the how-to guide)
- [ ] `CLAUDE.md` - From template, with project name + placeholders
- [ ] `.claude/skills/chkd/SKILL.md`
- [ ] `.claude/skills/bugfix/SKILL.md`
- [ ] `.claude/skills/story/SKILL.md`
- [ ] `.claude/skills/spec-check/SKILL.md`
- [ ] `.claude/skills/discover/SKILL.md`
- [ ] `.claude/skills/idea/SKILL.md`

### Also does:
- [ ] Checks it's a git repo (or offers to run `git init`)
- [ ] Registers with chkd API
- [ ] Shows "next steps" after init

### Flags:
- [ ] `--force` - Overwrite existing files
- [ ] `--no-register` - Skip API registration
- [ ] `--minimal` - Only SPEC.md and CLAUDE.md (no skills)

### Output:
```
$ chkd init "My Project"

  Initializing chkd in /path/to/project...

  Created:
    ✓ docs/SPEC.md
    ✓ docs/GUIDE.md
    ✓ CLAUDE.md
    ✓ .claude/skills/chkd/
    ✓ .claude/skills/bugfix/
    ✓ .claude/skills/story/
    ✓ .claude/skills/spec-check/
    ✓ .claude/skills/discover/
    ✓ .claude/skills/idea/

  Registered with chkd.

  Next steps:
    1. Edit docs/SPEC.md to add your features
    2. Edit CLAUDE.md to describe your project
    3. Run: chkd start <item>

  Read docs/GUIDE.md for the full workflow.
```

---

## 3. `chkd upgrade` Checklist

### What it does:
- [ ] Compares local files with master templates
- [ ] Shows what would change (diff)
- [ ] Asks for confirmation
- [ ] Updates files (with backup)

### Files to upgrade:
- [ ] `docs/GUIDE.md` - Always safe to replace
- [ ] `.claude/skills/*` - Always safe to replace
- [ ] `CLAUDE.md` - NEVER auto-replace (user content)
- [ ] `docs/SPEC.md` - NEVER auto-replace (user content)

### Flags:
- [ ] `--dry-run` - Show what would change without doing it
- [ ] `--force` - Skip confirmation
- [ ] `--skills-only` - Only update skills

### Output:
```
$ chkd upgrade

  Checking for updates...

  Would update:
    ↑ docs/GUIDE.md (15 lines changed)
    ↑ .claude/skills/chkd/SKILL.md (new version)
    ↑ .claude/skills/story/SKILL.md (new version)
    + .claude/skills/idea/SKILL.md (new skill)

  Skipping (user content):
    · CLAUDE.md
    · docs/SPEC.md

  Proceed? [y/N] y

  ✓ Updated 3 files, added 1 new skill

  Backups saved to .chkd-backup/
```

---

## 4. `/discover` Skill Checklist

### What it does:
- [ ] Analyzes existing codebase structure
- [ ] Identifies what's already built
- [ ] Generates SPEC.md entries for existing features
- [ ] Fills in CLAUDE.md with actual architecture

### Steps:
1. [ ] Scan directory structure
2. [ ] Identify frameworks/languages used
3. [ ] Find API endpoints (routes, controllers)
4. [ ] Find UI components/pages
5. [ ] Find database models/schemas
6. [ ] Generate feature list from findings
7. [ ] Ask user to confirm/edit findings
8. [ ] Write to SPEC.md (marking existing as complete)
9. [ ] Update CLAUDE.md with architecture

### Output format in SPEC.md:
```markdown
## Backend

> Existing API functionality (discovered)

- [x] **BE.1 User Authentication** - Login, logout, sessions
- [x] **BE.2 API Endpoints** - REST API for core features
- [ ] **BE.3 [Add new features here]**
```

### Flags for discover:
- [ ] `--dry-run` - Show what would be discovered without writing
- [ ] `--append` - Add to existing SPEC.md instead of replacing

---

## 5. Template Files to Create

### docs/SPEC.md.template
```markdown
# {{PROJECT_NAME}} Specification

> Feature checklist and requirements.

---

## Site Design

> Pages, layouts, user experience.

- [ ] **SD.1 [First Page]** - Description

---

## Frontend

> Components, state, client logic.

- [ ] **FE.1 [First Component]** - Description

---

## Backend

> APIs, services, data layer.

- [ ] **BE.1 [First Endpoint]** - Description

---

## Future

> Planned features, ideas.

- [ ] **FUT.1 [Future Feature]** - Description

---

*Spec created with chkd init*
```

### CLAUDE.md.template
```markdown
# CLAUDE.md - {{PROJECT_NAME}}

## Project Overview

{{PROJECT_NAME}} is a [describe your project].

## Source of Truth

- `docs/SPEC.md` - Feature checklist
- `docs/GUIDE.md` - How to use chkd
- This file - Project-specific instructions

## Development Commands

\`\`\`bash
npm run dev      # Start development
npm test         # Run tests
npm run build    # Build for production
\`\`\`

## Architecture

[Describe key folders, patterns, conventions]

## Key Files

| File | Purpose |
|------|---------|
| src/ | Source code |

## Conventions

[Coding standards, naming conventions, patterns to follow]
```

---

## 6. Implementation Order

1. [ ] Create `/templates` folder in chkd-v2
2. [ ] Move/create all template files
3. [ ] Update `chkd init` to copy from templates
4. [ ] Build `chkd upgrade` command
5. [ ] Build `/discover` skill
6. [ ] Test with greenfield project
7. [ ] Test with brownfield project (finort)
8. [ ] Update docs/GUIDE.md with setup instructions

---

## 7. Questions to Resolve

1. **Version tracking:** How do we know which version of templates a project has?
   - Add `.chkd-version` file?
   - Check file hashes?

2. **Customization:** If user modifies a skill, how do we handle upgrades?
   - Always overwrite skills (they shouldn't modify)?
   - Merge changes?
   - Keep user version, offer to show diff?

3. **Global vs local skills:**
   - Should skills be in project `.claude/skills/` or global `~/.claude/skills/`?
   - Both? (global defaults, project overrides)

---

## 8. Success Criteria

- [ ] New user can run `chkd init` and have everything needed
- [ ] Existing user can run `chkd upgrade` to get latest templates
- [ ] Brownfield project can use `/discover` to generate initial spec
- [ ] All commands have clear help text and examples
- [ ] Guide explains the full setup process
