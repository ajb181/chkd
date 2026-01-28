# Story: FE.7 - Allow to set tags and priority when creating a story and its tasks

**Story ID:** FE.7
**Area:** Frontend
**Status:** In Progress
**Started:** 2026-01-22

---

## User Story

> As a user, I want to be able to set tags and priority when creating a story and its tasks so that I can better organize and prioritize my work.

---

## Current State (Exploration Findings)

### Priority - Already Exists ✓

**Data Model:**
- `Priority` type: `1 | 2 | 3 | null` (P1=High, P2=Medium, P3=Low, null=Backlog)
- Located in: `src/lib/server/spec/parser.ts:4`
- Part of `SpecItem` interface with property `priority: Priority`

**Parser (src/lib/server/spec/parser.ts:217-223):**
- Extracts `[P1]`, `[P2]`, `[P3]` tags from item titles
- Regex: `/^\[P([123])\]\s*/i`
- Removes tag from display title after extraction
- Example: `- [ ] [P1] **SD.1 Feature** - Desc` → priority=1, title="SD.1 Feature"

**Writer (src/lib/server/spec/writer.ts:707-739):**
- `setPriority(specPath, itemId, priority)` function exists
- Adds/removes `[P1]`, `[P2]`, `[P3]` tags from spec file
- Removes existing tag: `/(\s*-\s+\[[ xX~\-!]\]\s+)\[P[123]\]\s*/`
- Inserts new tag after checkbox: `$1[P${priority}] `

**API Endpoint (src/routes/api/spec/priority/+server.ts):**
- `POST /api/spec/priority`
- Parameters: `{ repoPath, itemId, priority }`
- Validates priority must be 1, 2, 3, or null
- Returns: `{ success, data: { itemId, priority, message } }`

**Spec Format:**
```markdown
- [ ] [P1] **SD.1 Feature Name** - Description
- [ ] [P2] **FE.2 Another Feature** - Description
- [ ] **BE.3 Backlog Item** - No priority tag = backlog
```

### Tags - Don't Exist Yet ✗

**Missing:**
- No `tags` property in data model
- No tag parsing in parser
- No tag writing in writer
- No tags API endpoint
- No tags input in UI

---

## Current FeatureCapture UI Flow

**File:** `src/lib/components/FeatureCapture.svelte`

**Wizard Steps:**
1. **Discuss** - Enter title and initial description
2. **Analyze** - AI checks for duplicates, suggests improvements
3. **Place** - Select area (SD, FE, BE, FUT)
4. **Review** - Edit title, story, and tasks
5. **Add** - Confirm and add to spec

**Current Limitations:**
- NO priority input anywhere in the wizard
- NO tags input anywhere in the wizard
- Calls `addFeature(repoPath, title, areaCode, description, customTasks)`
- API endpoint `/api/spec/add` doesn't accept priority or tags

**Known Parameters for /api/spec/add (line 8-11):**
```javascript
const KNOWN_PARAMS = [
  'repoPath', 'title', 'description', 'areaCode', 'phaseNumber',
  'withWorkflow', 'tasks', 'customTasks', 'dryRun', 'confirmLarge'
];
```

---

## Design Proposal

### Tags Format in SPEC.md

**Proposed Format:**
```markdown
- [ ] [P1] **SD.1 Feature Name** #frontend #ui #urgent - Description
- [ ] [P2] **FE.2 Another** #backend #api - Description
- [ ] **BE.3 No Priority** #refactor - Description (backlog)
```

**Parsing Rules:**
- Tags appear after title, before description dash
- Hashtag format: `#tagname`
- Multiple tags allowed: `#tag1 #tag2 #tag3`
- Tag names: lowercase, alphanumeric + hyphen/underscore
- Extracted and stored as array: `tags: ['frontend', 'ui', 'urgent']`

**Alternative Format (if hashtags conflict with markdown):**
```markdown
- [ ] [P1] **SD.1 Feature** [frontend][ui][urgent] - Description
```

### Data Model Changes

**Add to SpecItem interface (src/lib/server/spec/parser.ts):**
```typescript
export interface SpecItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  status: ItemStatus;
  priority: Priority;
  tags?: string[];  // NEW: array of tag names
  children: SpecItem[];
  line: number;
  story?: string;
}
```

### API Changes

**Update /api/spec/add endpoint:**
```typescript
const KNOWN_PARAMS = [
  'repoPath', 'title', 'description', 'areaCode', 'phaseNumber',
  'withWorkflow', 'tasks', 'customTasks', 'dryRun', 'confirmLarge',
  'priority',  // NEW
  'tags'       // NEW
];
```

**New endpoint: /api/spec/tags:**
```typescript
POST /api/spec/tags
{
  repoPath: string;
  itemId: string;
  tags: string[];  // array of tag names
}
→ { success, data: { itemId, tags, message } }
```

### UI Changes - FeatureCapture.svelte

**Add to wizard state (after line 73):**
```javascript
let selectedPriority: Priority = null;  // null = backlog
let selectedTags: string[] = [];
```

**Update "Review" step to include:**
1. **Priority selector** - Dropdown or button group:
   - Options: Backlog (default), P1 (High), P2 (Medium), P3 (Low)
   - Visual indicators: color-coded badges

2. **Tags input** - Tag chips with text input:
   - Common tags shown as suggestions (extracted from existing spec)
   - Can add custom tags
   - Visual: chips that can be removed

**Update addFeature API call (line 225):**
```javascript
const res = await addFeature(
  repoPath,
  title.trim(),
  areaCode,
  fullDescription || undefined,
  customTasks,
  selectedPriority,  // NEW
  selectedTags       // NEW
);
```

---

## Implementation Tasks

### Task 1: Add tags to data model and parser

**Files to modify:**
- `src/lib/server/spec/parser.ts`

**Changes:**
1. Add `tags?: string[]` to `SpecItem` interface
2. In `parse()` method, after extracting priority (line 217-223):
   - Add regex to extract hashtags: `/#(\w+(?:[-_]\w+)*)/g`
   - Store in item.tags array
   - Remove hashtags from display title
3. Test parsing with sample spec items containing tags

**Testing:**
- Create test spec with: `- [ ] [P1] **Test** #foo #bar-baz - Desc`
- Verify parsed item has: `priority: 1, tags: ['foo', 'bar-baz']`
- Verify title doesn't contain hashtags

### Task 2: Add setTags function to writer

**Files to modify:**
- `src/lib/server/spec/writer.ts`

**Changes:**
1. Add function `setTags(specPath: string, itemId: string, tags: string[]): Promise<void>`
2. Implementation:
   - Read spec, find item by ID
   - Remove existing hashtags from line
   - If tags.length > 0, insert new hashtags after title (before description dash)
   - Format: ` #tag1 #tag2 #tag3 `
   - Write back to file
3. Handle edge cases:
   - Item with no description dash
   - Item with children (only modify parent line)
   - Empty tags array (remove all hashtags)

**Testing:**
- Test adding tags to item without tags
- Test replacing existing tags
- Test removing all tags (empty array)
- Test with items that have no description

### Task 3: Create /api/spec/tags endpoint

**Files to create:**
- `src/routes/api/spec/tags/+server.ts`

**Implementation:**
```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setTags } from '$lib/server/spec/writer';
import path from 'path';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { repoPath, itemId, tags } = body;

    if (!repoPath) {
      return json({ success: false, error: 'repoPath is required' }, { status: 400 });
    }

    if (!itemId) {
      return json({ success: false, error: 'itemId is required' }, { status: 400 });
    }

    // Validate tags: must be array of strings
    if (tags !== undefined && !Array.isArray(tags)) {
      return json({ success: false, error: 'tags must be an array' }, { status: 400 });
    }

    // Validate tag format: alphanumeric + hyphen/underscore
    const validTags = tags || [];
    const invalidTag = validTags.find((t: any) =>
      typeof t !== 'string' || !/^[\w][\w-]*$/.test(t)
    );

    if (invalidTag) {
      return json({
        success: false,
        error: `Invalid tag: "${invalidTag}". Tags must be alphanumeric with optional hyphens/underscores.`
      }, { status: 400 });
    }

    const specPath = path.join(repoPath, 'docs', 'SPEC.md');
    await setTags(specPath, itemId, validTags);

    return json({
      success: true,
      data: {
        itemId,
        tags: validTags,
        message: validTags.length > 0
          ? `Set tags: ${validTags.join(', ')}`
          : 'Removed all tags'
      }
    });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
};
```

**Testing:**
- POST with valid tags
- POST with empty array (remove tags)
- POST with invalid tag names
- POST with missing parameters

### Task 4: Update /api/spec/add to accept priority and tags

**Files to modify:**
- `src/routes/api/spec/add/+server.ts`

**Changes:**
1. Add 'priority' and 'tags' to KNOWN_PARAMS (line 8-11)
2. Extract from request body (after line 28):
   ```typescript
   const {
     repoPath,
     title,
     description,
     areaCode,
     phaseNumber,
     withWorkflow = true,
     tasks,
     customTasks: customTasksAlt,
     dryRun = false,
     confirmLarge = false,
     priority = null,  // NEW
     tags = []         // NEW
   } = body;
   ```
3. Validate priority (must be 1, 2, 3, or null)
4. Validate tags (must be array of valid strings)
5. After calling addFeatureWithWorkflow or addItemToArea:
   - If priority !== null, call setPriority(specPath, result.itemId, priority)
   - If tags.length > 0, call setTags(specPath, result.itemId, tags)
6. Update response to include priority and tags

**Testing:**
- Add feature with priority only
- Add feature with tags only
- Add feature with both priority and tags
- Add feature with neither (backlog, no tags)
- Verify spec file has correct format

### Task 5: Update frontend API client

**Files to modify:**
- `src/lib/api.ts`

**Changes:**
1. Update `addFeature()` function signature:
   ```typescript
   export async function addFeature(
     repoPath: string,
     title: string,
     areaCode: string,
     description?: string,
     tasks?: string[],
     priority?: 1 | 2 | 3 | null,  // NEW
     tags?: string[]                // NEW
   ): Promise<ApiResponse<any>>
   ```
2. Include priority and tags in POST body
3. Add new function `setTags()`:
   ```typescript
   export async function setTags(
     repoPath: string,
     itemId: string,
     tags: string[]
   ): Promise<ApiResponse<any>> {
     const res = await fetch('/api/spec/tags', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ repoPath, itemId, tags })
     });
     return res.json();
   }
   ```

### Task 6: Add priority selector to FeatureCapture UI

**Files to modify:**
- `src/lib/components/FeatureCapture.svelte`

**Changes:**

1. **Add state variables (after line 73):**
   ```javascript
   let selectedPriority: Priority = null;  // null = backlog
   ```

2. **Update auto-save (line 76):**
   ```javascript
   $: if (title || description || userStory || selectedAreaCode || selectedPriority) saveDraft();
   ```

3. **Update draft save/load functions:**
   - Add `selectedPriority` to draft object in `saveDraft()`
   - Restore `selectedPriority` in `loadDraft()`

4. **Add priority selector to "Review" step (after line 540):**
   ```svelte
   <div class="form-group">
     <label for="priority">Priority</label>
     <div class="priority-selector">
       <button
         class="priority-btn"
         class:selected={selectedPriority === null}
         on:click={() => selectedPriority = null}
       >
         Backlog
       </button>
       <button
         class="priority-btn p1"
         class:selected={selectedPriority === 1}
         on:click={() => selectedPriority = 1}
       >
         P1 - High
       </button>
       <button
         class="priority-btn p2"
         class:selected={selectedPriority === 2}
         on:click={() => selectedPriority = 2}
       >
         P2 - Medium
       </button>
       <button
         class="priority-btn p3"
         class:selected={selectedPriority === 3}
         on:click={() => selectedPriority = 3}
       >
         P3 - Low
       </button>
     </div>
   </div>
   ```

5. **Add CSS for priority selector (in style section):**
   ```css
   .priority-selector {
     display: flex;
     gap: var(--space-xs);
   }

   .priority-btn {
     flex: 1;
     padding: var(--space-sm) var(--space-md);
     background: var(--bg-secondary);
     border: 2px solid var(--border);
     border-radius: var(--radius-md);
     cursor: pointer;
     font-size: 13px;
     color: var(--text-muted);
     transition: all 0.2s;
   }

   .priority-btn:hover {
     background: var(--bg-tertiary);
     border-color: var(--text-muted);
   }

   .priority-btn.selected {
     background: var(--primary-bg);
     border-color: var(--primary);
     color: var(--primary);
     font-weight: 500;
   }

   .priority-btn.p1.selected {
     background: var(--error-bg);
     border-color: var(--error);
     color: var(--error);
   }

   .priority-btn.p2.selected {
     background: var(--warning-bg, #fef3cd);
     border-color: var(--warning);
     color: var(--warning);
   }

   .priority-btn.p3.selected {
     background: var(--success-bg);
     border-color: var(--success);
     color: var(--success);
   }
   ```

6. **Update handleAdd() to pass priority (line 211):**
   ```javascript
   const res = await addFeature(
     repoPath,
     title.trim(),
     areaCode,
     fullDescription || undefined,
     customTasks,
     selectedPriority  // NEW
   );
   ```

7. **Update clearDraft() to reset priority:**
   - Reset `selectedPriority = null` when draft is cleared

**Testing:**
- Select each priority level
- Verify visual feedback (selected state)
- Verify draft persists priority across hot reloads
- Add feature and check spec has correct [P1]/[P2]/[P3] tag

### Task 7: Add tags input to FeatureCapture UI

**Files to modify:**
- `src/lib/components/FeatureCapture.svelte`

**Changes:**

1. **Add state variables:**
   ```javascript
   let selectedTags: string[] = [];
   let tagInputText = '';
   ```

2. **Update auto-save to include tags**

3. **Update draft save/load to include tags**

4. **Add tags input to "Review" step (after priority selector):**
   ```svelte
   <div class="form-group">
     <label for="tags">Tags (optional)</label>
     <div class="tags-input-wrapper">
       <div class="tags-chips">
         {#each selectedTags as tag, i}
           <span class="tag-chip">
             #{tag}
             <button
               class="tag-remove"
               on:click={() => selectedTags = selectedTags.filter((_, idx) => idx !== i)}
               title="Remove tag"
             >
               ×
             </button>
           </span>
         {/each}
         <input
           type="text"
           bind:value={tagInputText}
           placeholder="Add tag..."
           class="tag-input"
           on:keydown={(e) => {
             if (e.key === 'Enter') {
               e.preventDefault();
               addTag();
             } else if (e.key === 'Backspace' && tagInputText === '' && selectedTags.length > 0) {
               selectedTags = selectedTags.slice(0, -1);
             }
           }}
         />
       </div>
     </div>
     <div class="tag-suggestions">
       <span class="suggestion-label">Common:</span>
       {#each ['frontend', 'backend', 'ui', 'api', 'refactor', 'urgent'] as suggestion}
         {#if !selectedTags.includes(suggestion)}
           <button
             class="tag-suggestion"
             on:click={() => addSuggestedTag(suggestion)}
           >
             #{suggestion}
           </button>
         {/if}
       {/each}
     </div>
   </div>
   ```

5. **Add helper functions:**
   ```javascript
   function addTag() {
     const tag = tagInputText.trim().toLowerCase().replace(/^#/, '');
     if (tag && /^[\w][\w-]*$/.test(tag) && !selectedTags.includes(tag)) {
       selectedTags = [...selectedTags, tag];
       tagInputText = '';
     }
   }

   function addSuggestedTag(tag: string) {
     if (!selectedTags.includes(tag)) {
       selectedTags = [...selectedTags, tag];
     }
   }
   ```

6. **Add CSS for tags input:**
   ```css
   .tags-input-wrapper {
     border: 1px solid var(--border);
     border-radius: var(--radius-md);
     background: var(--bg);
     padding: var(--space-xs);
     min-height: 42px;
   }

   .tags-chips {
     display: flex;
     flex-wrap: wrap;
     gap: var(--space-xs);
     align-items: center;
   }

   .tag-chip {
     display: inline-flex;
     align-items: center;
     gap: var(--space-xs);
     background: var(--primary-bg);
     color: var(--primary);
     padding: 4px 8px;
     border-radius: var(--radius-sm);
     font-size: 12px;
     font-weight: 500;
   }

   .tag-remove {
     background: none;
     border: none;
     color: var(--primary);
     font-size: 16px;
     line-height: 1;
     cursor: pointer;
     padding: 0;
     margin-left: 2px;
   }

   .tag-remove:hover {
     color: var(--error);
   }

   .tag-input {
     flex: 1;
     min-width: 100px;
     border: none;
     background: transparent;
     padding: 4px;
     font-size: 13px;
     color: var(--text);
     outline: none;
   }

   .tag-suggestions {
     display: flex;
     flex-wrap: wrap;
     gap: var(--space-xs);
     margin-top: var(--space-xs);
     padding-top: var(--space-xs);
     border-top: 1px solid var(--border);
     align-items: center;
   }

   .suggestion-label {
     font-size: 11px;
     color: var(--text-muted);
     margin-right: var(--space-xs);
   }

   .tag-suggestion {
     background: var(--bg-secondary);
     border: 1px solid var(--border);
     color: var(--text-muted);
     padding: 2px 6px;
     border-radius: var(--radius-sm);
     font-size: 11px;
     cursor: pointer;
     transition: all 0.15s;
   }

   .tag-suggestion:hover {
     background: var(--primary-bg);
     border-color: var(--primary);
     color: var(--primary);
   }
   ```

7. **Update handleAdd() to pass tags:**
   ```javascript
   const res = await addFeature(
     repoPath,
     title.trim(),
     areaCode,
     fullDescription || undefined,
     customTasks,
     selectedPriority,
     selectedTags  // NEW
   );
   ```

8. **Update clearDraft() to reset tags:**
   - Reset `selectedTags = []` and `tagInputText = ''`

**Testing:**
- Add tags manually
- Add tags from suggestions
- Remove tags by clicking X
- Remove last tag with backspace
- Verify tags persist in draft
- Add feature and check spec has correct hashtags

### Task 8: Integration testing

**Test scenarios:**

1. **Create feature with priority and tags:**
   - Open FeatureCapture
   - Enter title: "User authentication"
   - Select area: FE
   - Set priority: P1
   - Add tags: #auth #security
   - Submit
   - Verify spec: `- [ ] [P1] **FE.X User authentication** #auth #security - ...`

2. **Create feature with priority only:**
   - Set priority: P2
   - No tags
   - Verify spec: `- [ ] [P2] **FE.X Title** - ...`

3. **Create feature with tags only:**
   - Priority: Backlog (null)
   - Tags: #ui #refactor
   - Verify spec: `- [ ] **FE.X Title** #ui #refactor - ...`

4. **Create feature with neither:**
   - Priority: Backlog
   - No tags
   - Verify spec: `- [ ] **FE.X Title** - ...`

5. **Draft persistence:**
   - Start creating feature
   - Set priority and tags
   - Trigger hot reload (edit component file)
   - Verify priority and tags restored

6. **Tag validation:**
   - Try invalid tag: "tag with spaces" → rejected
   - Try valid tag: "tag-with-hyphens" → accepted
   - Try duplicate tag → ignored

7. **Parser roundtrip:**
   - Add feature with priority and tags via UI
   - Read spec with parser
   - Verify parsed item has correct priority and tags arrays
   - Verify title doesn't contain priority or tag markers

### Task 9: Update existing UI to show priority and tags

**Files to modify:**
- `src/routes/+page.svelte` (main page showing spec items)

**Changes:**

1. **Display priority badge on items:**
   - Show colored badge: P1 (red), P2 (yellow), P3 (green)
   - No badge for backlog items

2. **Display tags as chips:**
   - Show hashtag chips below item title
   - Limit to 3 visible, show "+N more" if needed
   - Click to filter by tag (future enhancement)

3. **Add filter/sort by priority:**
   - Group items by priority (P1, P2, P3, Backlog)
   - Or add dropdown to filter by priority

**Note:** This task can be done after core functionality works

### Task 10: Polish and edge cases

**Edge cases to handle:**

1. **Special characters in tags:**
   - Prevent: spaces, #, @, !, etc.
   - Allow: alphanumeric, hyphen, underscore

2. **Tag name collisions:**
   - Normalize to lowercase
   - Prevent duplicates

3. **Priority changes:**
   - Can change priority after creation
   - Update spec file correctly

4. **Tags changes:**
   - Can add/remove tags after creation
   - Update spec file correctly

5. **Long tag names:**
   - Limit tag length (e.g., 20 characters)
   - Truncate in UI if needed

6. **Many tags:**
   - Limit number of tags per item (e.g., 10)
   - UI shows overflow gracefully

**Error handling:**

1. **Parser failures:**
   - Malformed hashtags in spec
   - Invalid priority tags
   - Graceful degradation (skip invalid tags)

2. **Writer failures:**
   - File write errors
   - Concurrent modifications
   - Rollback on failure

3. **API errors:**
   - Network failures
   - Validation errors
   - Clear error messages to user

---

## Open Questions

**For User Decision:**

1. **Tags input style:**
   - ✓ IMPLEMENTED: Tag chips with manual input + common suggestions
   - Alternative A: Autocomplete from existing tags in spec
   - Alternative B: Multi-select dropdown

2. **Tag format in spec:**
   - Proposed: `#tagname` (hashtag format)
   - Alternative: `[tagname]` (square brackets)
   - Question: Any conflicts with existing markdown?

3. **Tag categories:**
   - Should we support tag categories? (e.g., `type:bug`, `area:frontend`)
   - Or keep simple single-word tags?

4. **Priority UI placement:**
   - Proposed: In "Review" step
   - Alternative: Separate step between "Place" and "Review"
   - Alternative: In "Add" summary step

5. **Tag suggestions:**
   - Hardcoded common tags: `['frontend', 'backend', 'ui', 'api', 'refactor', 'urgent']`
   - Or extract from existing spec dynamically?

---

## Success Criteria

- ✅ Can set priority (P1/P2/P3/Backlog) when creating feature
- ✅ Can add multiple tags when creating feature
- ✅ Priority shows as `[P1]` tag in spec file
- ✅ Tags show as `#tag1 #tag2` in spec file
- ✅ Parser correctly extracts priority and tags from spec
- ✅ Draft persists priority and tags across hot reloads
- ✅ Can create feature with any combination (priority only, tags only, both, neither)
- ✅ Invalid tags are rejected with clear error
- ✅ UI is intuitive and visually clear

---

## Implementation Plan

**Phase 1 - Backend (Tasks 1-4):**
1. Add tags to data model and parser
2. Add setTags function to writer
3. Create /api/spec/tags endpoint
4. Update /api/spec/add to accept priority and tags

**Phase 2 - Frontend API (Task 5):**
5. Update frontend API client

**Phase 3 - UI (Tasks 6-7):**
6. Add priority selector to FeatureCapture UI
7. Add tags input to FeatureCapture UI

**Phase 4 - Testing & Polish (Tasks 8-10):**
8. Integration testing
9. Update existing UI to show priority and tags
10. Polish and edge cases

**Estimated Effort:**
- Phase 1: 2-3 hours
- Phase 2: 30 minutes
- Phase 3: 2-3 hours
- Phase 4: 2-4 hours
- **Total: 7-11 hours**

---

## Notes

- Priority feature already exists in backend, just needs UI
- Tags are new and need full implementation
- Should maintain backward compatibility with existing specs
- Tag format (#hashtag) chosen to be visually distinct from priority [P1]
- Common tag suggestions hardcoded initially, can be dynamic later
- Draft persistence important for good UX during development

---

## Related Files

**Backend:**
- `src/lib/server/spec/parser.ts` - Parse spec file
- `src/lib/server/spec/writer.ts` - Write spec file
- `src/routes/api/spec/add/+server.ts` - Add feature endpoint
- `src/routes/api/spec/priority/+server.ts` - Set priority endpoint
- `src/routes/api/spec/tags/+server.ts` - NEW: Set tags endpoint

**Frontend:**
- `src/lib/components/FeatureCapture.svelte` - Feature creation wizard
- `src/lib/api.ts` - API client
- `src/routes/+page.svelte` - Main page (display priority/tags)

**Types:**
- `src/lib/types.ts` - Shared types
- `src/lib/server/spec/parser.ts` - SpecItem interface

---

## Completion Checklist

- [ ] Task 1: Add tags to data model and parser
- [ ] Task 2: Add setTags function to writer
- [ ] Task 3: Create /api/spec/tags endpoint
- [ ] Task 4: Update /api/spec/add to accept priority and tags
- [ ] Task 5: Update frontend API client
- [ ] Task 6: Add priority selector to FeatureCapture UI
- [ ] Task 7: Add tags input to FeatureCapture UI
- [ ] Task 8: Integration testing
- [ ] Task 9: Update existing UI to show priority and tags
- [ ] Task 10: Polish and edge cases

---

**Last Updated:** 2026-01-22
**Status:** Ready to implement
