# AI Prompt Studio - Design Document

## Overview

Add a comprehensive AI Prompt Studio to chkd, allowing users to view, edit, version, and test all LLM prompts used in the system. Based on the proven architecture from Strateo.

## Goals

1. **Transparency** - Users can see exactly what prompts are sent to the LLM
2. **Customization** - Full control over prompt content, not just tone/prefix
3. **Version Control** - Track all changes with rollback capability
4. **Testing** - Validate prompts before deploying to production
5. **Audit Trail** - Know who changed what and when

---

## Current State (chkd)

### Prompts Location
All prompts are hardcoded in:
- `/src/cli/llm.ts` - CLI-side prompts (mergeClaudeMd, repairSpec, expandStory, etc.)
- `/src/routes/api/spec/expand/+server.ts` - Feature expansion prompt
- `/src/routes/api/spec/repair/+server.ts` - Spec repair prompt

### Current Personalization
- `llm_tone` setting (default/formal/casual/concise)
- `llm_custom_prefix` setting (prepended to prompts)

### Problems
- Prompts hidden in code - users can't see them
- Changes require code deployment
- No version history
- No way to test prompts
- No rollback if a prompt change breaks things

---

## Proposed Architecture

### Database Schema

```sql
-- Prompt Templates (current active prompts)
CREATE TABLE prompt_templates (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,        -- e.g., 'feature-expansion', 'spec-repair'
  name TEXT NOT NULL,               -- 'Feature Expansion'
  description TEXT,                 -- 'Expands feature ideas into structured specs'
  category TEXT NOT NULL,           -- 'spec', 'bug', 'workflow', 'chat'
  system_prompt TEXT NOT NULL,      -- The actual prompt
  context_template TEXT,            -- Optional: template for injecting context
  variables TEXT,                   -- JSON: available variables like {{title}}, {{area}}
  version INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  updated_by TEXT
);

-- Version History (immutable audit trail)
CREATE TABLE prompt_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES prompt_templates(id),
  version INTEGER NOT NULL,
  system_prompt TEXT NOT NULL,
  context_template TEXT,
  change_note TEXT,                 -- 'Made response more concise'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  UNIQUE(template_id, version)
);
```

### Prompt Slugs (Initial Set)

| Slug | Category | Description |
|------|----------|-------------|
| `feature-expansion` | spec | Expands feature ideas into structured specs |
| `spec-repair` | spec | Reformats SPEC.md to correct format |
| `story-expand` | spec | Determines if story needs workflow tasks |
| `workflow-generation` | spec | Generates smart workflow steps for features |
| `bug-processing` | bug | Transforms raw bug reports into structured bugs |
| `quickwin-processing` | workflow | Cleans up quick win descriptions |
| `claudemd-merge` | workflow | Merges CLAUDE.md with chkd template |

### API Endpoints

```
GET    /api/prompts              - List all prompts with metadata
GET    /api/prompts/:slug        - Get prompt with version history
PATCH  /api/prompts/:slug        - Update prompt (creates new version)
POST   /api/prompts/:slug/test   - Test prompt with sample input
POST   /api/prompts/:slug/revert - Revert to specific version
```

### UI Components

#### 1. Prompts List Page (`/settings/prompts`)

```
┌─────────────────────────────────────────────────────────────┐
│ AI Prompts                                         [+ New]  │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Feature Expansion                              v3  ✓    │ │
│ │ Expands feature ideas into structured specs            │ │
│ │ Updated 2 hours ago by Alex                            │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Spec Repair                                    v1  ✓    │ │
│ │ Reformats SPEC.md to correct format                    │ │
│ │ Updated 3 days ago by System                           │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

#### 2. Prompt Editor Page (`/settings/prompts/:slug`)

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back    Feature Expansion                    [Test] [Save]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ System Prompt                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ You help prepare feature ideas for a software spec.    │ │
│ │                                                         │ │
│ │ Your job:                                               │ │
│ │ 1. POLISH the title: Fix spelling/grammar...           │ │
│ │ 2. PRESERVE context: If the title is long...           │ │
│ │ ...                                                     │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Available Variables: {{title}}, {{areaCode}}, {{specContext}}│
│                                                             │
│ Change Note (optional)                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Made task generation more concise                      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Version History                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ v3 (current) - 2 hours ago by Alex                     │ │
│ │ "Made task generation more concise"                    │ │
│ │                                              [Restore] │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ v2 - Yesterday by Alex                                 │ │
│ │ "Added 8-step workflow philosophy"                     │ │
│ │                                              [Restore] │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ v1 - 3 days ago by System                              │ │
│ │ "Initial prompt"                                       │ │
│ │                                              [Restore] │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 3. Prompt Test Modal

```
┌─────────────────────────────────────────────────────────────┐
│ Test Prompt: Feature Expansion                        [X]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Test Input                                                  │
│ Title: [add user authentication with oauth                ]│
│ Area:  [BE ▾]                                              │
│                                                             │
│                                        [Run Test]           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Result                                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ {                                                       │ │
│ │   "polishedTitle": "User Authentication with OAuth",   │ │
│ │   "story": "As a user, I want to authenticate...",     │ │
│ │   "suggestedArea": "BE",                               │ │
│ │   "tasks": [                                           │ │
│ │     "Explore: research OAuth providers",               │ │
│ │     "Design: auth flow + endpoint contracts",          │ │
│ │     ...                                                │ │
│ │   ]                                                    │ │
│ │ }                                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Tokens: 1,234 | Latency: 2.3s | Cost: $0.003               │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Database & API (Backend)
- [ ] Add prompt_templates and prompt_versions tables
- [ ] Create seed script to migrate hardcoded prompts to DB
- [ ] Implement getPrompt() with caching
- [ ] Create CRUD API endpoints
- [ ] Update existing code to fetch prompts from DB

### Phase 2: Prompts List UI
- [ ] Create /settings/prompts page
- [ ] List all prompts with metadata
- [ ] Show version number, status, last updated

### Phase 3: Prompt Editor
- [ ] Create /settings/prompts/[slug] page
- [ ] Textarea for editing system prompt
- [ ] Change note input
- [ ] Save with version increment
- [ ] Version history sidebar
- [ ] Restore previous version

### Phase 4: Testing & Polish
- [ ] Add prompt test endpoint
- [ ] Test modal with sample inputs
- [ ] Show token count, latency, cost
- [ ] Variable documentation/autocomplete
- [ ] Diff view between versions

---

## Technical Considerations

### Caching Strategy
- Cache prompts for 5 minutes (like Strateo)
- Clear cache on save
- Provide manual cache clear for debugging

### Migration Path
1. Create tables
2. Seed with current hardcoded prompts
3. Update code to use getPrompt(slug)
4. Keep hardcoded as fallback initially
5. Remove fallbacks once stable

### Security
- Prompt editing requires authenticated user
- Track who made each change
- Consider "approved" vs "draft" states for enterprise

### Performance
- Prompts are small text - DB queries fast
- Cache prevents repeated queries
- No impact on LLM response time

---

## Success Metrics

1. **Adoption** - Users viewing/editing prompts
2. **Iteration** - Average versions per prompt
3. **Stability** - Rollbacks needed (lower = better prompts)
4. **Satisfaction** - User feedback on AI responses

---

## Open Questions

1. Should prompts be per-repo or global?
2. Allow custom prompts beyond the standard set?
3. Prompt sharing/export between chkd instances?
4. A/B testing of prompts?

---

## References

- Strateo AI Studio implementation
- Anthropic prompt engineering guide
- LangChain prompt templates
