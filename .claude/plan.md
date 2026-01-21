# Plan: Quick Wins & Bugs Card Updates

## Part 1: Pin Cards to Right + Show Repo Name

### Current State
- Repo cards, Bugs card, and Quick Wins card all in single flex row
- All cards scroll together horizontally
- No repo name shown on Bugs/Quick Wins cards

### Desired Layout
```
┌────────────────────────────────────────────────────────────────────────┐
│ [+ Add] [Strateo] [chkd] [chkd-v2] [finort] →  ││ 🐛 Bugs    ⚡ Quick   │
│         ← scrollable repo cards →              ││   chkd-v2    Wins     │
│                                                ││     6      chkd-v2  3 │
└────────────────────────────────────────────────────────────────────────┘
                                                  ↑
                                            pinned right
```

### Changes

**1. HTML Structure** - Wrap repo cards in scrollable div, Bugs+QuickWins in pinned div

**2. Add Repo Name** - Show `currentRepo.name` under "Bugs" and "Quick Wins" titles

**3. CSS** - Left side scrolls, right side pinned with `flex-shrink: 0`

---

## Part 2: Quick Wins → Markdown File Storage

### Current State
- Quick Wins stored in SQLite database (`quick_wins` table)
- Same pattern as Bugs

### Desired State
- Quick Wins stored in `docs/QUICKWINS.md` in each repo
- Version controlled with the project
- Parsed/written like SPEC.md

### File Format
```markdown
# Quick Wins

- [ ] Fix the button alignment on mobile
- [ ] Add loading spinner to save button
- [x] Update favicon
- [ ] Compress hero image
```

### Changes Needed

**1. Delete database approach:**
- Remove `src/lib/server/quickwins/index.ts`
- Remove `quick_wins` table from schema (or leave, won't hurt)

**2. Create markdown parser/writer:**
- `src/lib/server/quickwins/parser.ts` - Parse QUICKWINS.md
- `src/lib/server/quickwins/writer.ts` - Write changes back

**3. Update API endpoints:**
- `GET /api/quickwins` - Read from markdown file
- `POST /api/quickwins` - Add line to markdown
- `PATCH /api/quickwins` - Toggle checkbox
- `DELETE /api/quickwins` - Remove line

**4. Update API client** - No changes needed (same interface)

**5. Update UI** - No changes needed (same interface)

---

## Files to Edit
- `src/routes/+page.svelte` (layout + CSS)
- `src/lib/server/quickwins/index.ts` → replace with parser.ts + writer.ts
- `src/routes/api/quickwins/+server.ts` (use file instead of DB)

## Files to Create
- `docs/QUICKWINS.md` (template in each repo)
