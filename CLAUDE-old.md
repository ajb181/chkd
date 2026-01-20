# CLAUDE.md - chkd-v2

## Project Overview

chkd-v2 is a [describe your project here].

## Source of Truth

- `docs/SPEC.md` - Feature checklist and requirements
- `docs/GUIDE.md` - How to use chkd workflow
- This file - Project-specific instructions for Claude

## Development Commands

```bash
# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Architecture

[Describe your folder structure and key patterns]

```
src/
├── components/    # UI components
├── lib/           # Shared utilities
├── routes/        # Pages/routes
└── ...
```

## Key Files

| File | Purpose |
|------|---------|
| src/ | Main source code |

## Conventions

### Code Style
- [Your coding conventions here]

### Naming
- Files: `kebab-case.ts`
- Components: `PascalCase`
- Functions: `camelCase`

### Patterns
- [Key patterns to follow]

## Working with chkd

1. Check current task: `chkd status`
2. Start a task: `chkd start <item>`
3. Mark complete: `chkd tick`
4. Finish task: `chkd done`

See `docs/GUIDE.md` for the full workflow.
