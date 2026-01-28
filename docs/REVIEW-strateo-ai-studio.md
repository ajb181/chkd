# Strateo AI Studio - Review & Learnings

## Executive Summary

Strateo has a mature, production-grade AI prompt management system. This document reviews their implementation to extract learnings for chkd's AI Prompt Studio.

---

## What Strateo Built

### Core Features

| Feature | Implementation | Quality |
|---------|---------------|---------|
| Prompt Storage | PostgreSQL with Prisma ORM | Excellent |
| Version Control | Separate versions table, immutable history | Excellent |
| Admin UI | Next.js pages with rich editor | Good |
| Testing | Built-in test framework with quality checks | Excellent |
| Caching | 5-minute TTL with explicit invalidation | Good |
| Audit Trail | User tracking on all changes | Excellent |

### Database Design

**Strengths:**
- Clean separation: `PromptTemplate` (current) vs `PromptVersion` (history)
- Immutable versions - history never modified
- Change notes for documentation
- User tracking (createdBy, updatedBy)
- Unique constraint prevents duplicate versions

**Schema Highlights:**
```prisma
model PromptTemplate {
  slug           String   @unique
  name           String
  description    String?
  systemPrompt   String   @db.Text
  contextTemplate String? @db.Text
  version        Int      @default(1)
  isActive       Boolean  @default(true)
  versions       PromptVersion[]
}

model PromptVersion {
  templateId   String
  version      Int
  systemPrompt String   @db.Text
  changeNote   String?
  @@unique([templateId, version])
}
```

### Prompt Fetching

**Key Pattern:**
```typescript
// No fallback - database is source of truth
export async function getPrompt(slug: string) {
  // Check cache first (5 min TTL)
  if (cache.has(slug) && !cache.isExpired(slug)) {
    return cache.get(slug);
  }

  // Fetch from DB - error if not found
  const prompt = await prisma.promptTemplate.findUnique({
    where: { slug, isActive: true }
  });

  if (!prompt) throw new Error(`Prompt not found: ${slug}`);

  cache.set(slug, prompt);
  return prompt;
}
```

**Why no fallback?**
- Forces prompts to be managed in DB
- Prevents code/DB drift
- Makes missing prompts obvious (fail fast)

### Version History UI

**What they show:**
- Version number with "Current" badge
- Timestamp
- Who made the change
- Change note
- First 500 chars preview
- "Restore this version" button

**User Flow:**
1. Click version to expand
2. See full prompt text
3. Click restore → creates NEW version with old content
4. Never modifies history

### Prompt Testing

**Test Framework:**
```typescript
POST /api/admin/prompts/test
{
  slug: "strategy-creation",
  testCases: [
    { input: "...", expectedOutput: "..." }
  ]
}

Response:
{
  passRate: 0.85,
  results: [...],
  qualityChecks: {
    brevity: "pass",
    focus: "pass",
    smeRelevance: "warning"
  }
}
```

**Quality Checks:**
- Brevity - Is response concise?
- Focus - Does it stay on topic?
- SME-friendly - Appropriate for non-technical users?

---

## What Works Well

### 1. Database as Source of Truth
- No prompts in code
- Single place to manage
- Version control automatic

### 2. Immutable History
- Can always rollback
- Full audit trail
- Never lose a working prompt

### 3. Immediate Cache Invalidation
```typescript
// After save
clearPromptCache(slug);
// Changes take effect immediately
```

### 4. Change Notes
- Documents WHY changes were made
- Helps future debugging
- "Made responses more concise" vs guessing

### 5. User Attribution
- Know who broke things
- Accountability
- Can ask "why did you change this?"

---

## What Could Be Better

### 1. No Diff View
- Can't easily compare versions
- Have to read both fully
- **chkd opportunity:** Add side-by-side diff

### 2. No A/B Testing
- Can't test new prompts on subset of users
- All-or-nothing deployment
- **chkd opportunity:** "Draft" vs "Active" states

### 3. Limited Variables
- Variables documented but not enforced
- Easy to use wrong variable name
- **chkd opportunity:** Variable autocomplete, validation

### 4. No Prompt Composition
- Each prompt standalone
- Can't inherit from base prompt
- **chkd opportunity:** Prompt fragments/includes

### 5. Testing is Manual
- Must click "Test" button
- No automated regression
- **chkd opportunity:** Test on save, CI integration

---

## Learnings for chkd

### Must Have (from Strateo)
1. Database storage with versioning
2. Immutable version history
3. Change notes
4. Immediate cache invalidation
5. User attribution
6. Restore functionality

### Nice to Have (improvements)
1. Side-by-side diff view
2. Variable autocomplete
3. Draft/Active states
4. Token count & cost preview
5. Automated testing

### Skip for Now
1. A/B testing (complex)
2. Prompt composition (over-engineering)
3. CI integration (future)

---

## Architecture Comparison

| Aspect | Strateo | chkd (Proposed) |
|--------|---------|-----------------|
| Database | PostgreSQL + Prisma | SQLite + raw SQL |
| Framework | Next.js | SvelteKit |
| Cache | In-memory Map | In-memory Map |
| API | REST | REST |
| Auth | Super-admin only | Simple (single user) |
| Prompts | 15+ prompts | 7 prompts initially |

### Simplifications for chkd

**Strateo has:**
- Multi-tenant (organization scoping)
- Role-based access control
- Complex knowledge caching

**chkd can skip:**
- Single user, no auth complexity
- No org scoping needed
- Simpler cache strategy

---

## Recommended Prompt Slugs for chkd

| Slug | Source File | Purpose |
|------|-------------|---------|
| `feature-expansion` | api/spec/expand | Expand feature ideas |
| `spec-repair` | api/spec/repair | Reformat SPEC.md |
| `story-expand` | cli/llm.ts | Determine if needs workflow |
| `workflow-generation` | cli/llm.ts | Generate workflow tasks |
| `feature-request` | cli/llm.ts | Process raw feature requests |
| `bug-processing` | cli/llm.ts | Structure bug reports |
| `quickwin-processing` | cli/llm.ts | Clean up quick wins |

---

## Migration Strategy

### Phase 1: Extract Prompts
1. Identify all hardcoded prompts
2. Create slugs for each
3. Document variables used

### Phase 2: Database Setup
1. Create tables
2. Seed with current prompts
3. Add getPrompt() function

### Phase 3: Code Migration
1. Replace hardcoded prompts with getPrompt()
2. Keep fallback temporarily
3. Test thoroughly

### Phase 4: UI
1. Build prompts list page
2. Build prompt editor
3. Add version history

### Phase 5: Polish
1. Remove fallbacks
2. Add testing
3. Add diff view

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bad prompt breaks features | High | Keep fallback during migration |
| DB corruption loses prompts | High | Regular backups, seed script |
| Cache stale after save | Medium | Explicit cache clear |
| User confusion with versions | Low | Clear UI, "Current" badge |

---

## Conclusion

Strateo's implementation is solid and well-tested in production. For chkd, we can adopt the core patterns (versioning, caching, audit trail) while simplifying auth and multi-tenancy. The main additions we should make are diff view and better variable handling.

Estimated effort: 2-3 days for basic implementation, +1 day for polish.
