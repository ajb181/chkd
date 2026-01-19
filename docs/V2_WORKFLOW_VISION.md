# chkd v2 - Workflow Vision

> Captured from design discussion. Implement in v2 build.

---

## Core Philosophy

**Keep it simple.** Avoid over-engineering. Best practices over cleverness.

---

## 1. Feature Workflow Template

Every feature added via UI should pre-populate with these workflow steps:

```
- [ ] Explore: understand problem, search existing functions, validate checklist
- [ ] Design: flow diagram showing data flow / before-after state
- [ ] Prototype: backend endpoints with test data + frontend calling them
- [ ] Feedback: user reviews working prototype
- [ ] Implement: replace test data with real logic
- [ ] Polish: iterate based on usage
```

### Step Details

**Explore**
- Understand the problem space
- Search for existing functions that might already do this
- Validate/edit/remove checklist items before starting
- Catch duplications here, not after code is written

**Design**
- Create flow diagram when appropriate (data flows, state changes)
- Before/after diagrams for state changes
- Sequence diagrams for multi-step flows
- Not every feature needs one - use judgment

**Prototype**
- Design backend structure first
- Create backend endpoints with test data
- Frontend calls real endpoints (not demo data in frontend)
- This forces you to see existing API patterns
- Test data can become actual test fixtures later

**Feedback**
- User reviews working prototype
- Catches design issues before full implementation
- Refactoring happens here, before scope grows

**Implement**
- Replace test data with real logic
- Frontend code doesn't need to change
- Clean code because requirements are now clear

**Polish**
- Iterate based on actual usage
- Add finishing touches

---

## 2. Backend-First with Test Data

**Old approach:**
```
Frontend (demo data) → build backend → rewire frontend
```

**New approach:**
```
Backend (test data) → Frontend calls real endpoints → Replace test data with logic
```

**Benefits:**
- API design happens early (catches issues)
- You see existing functions when designing backend
- Frontend code stays stable
- Test data becomes test fixtures

---

## 3. Flow Diagrams

Include visual diagrams when appropriate:

- **When to use:** Features with data flow or state changes
- **Types:**
  - Before/after state diagrams
  - Data flow diagrams
  - Sequence diagrams for multi-step flows
- **Where:** Can be ASCII in the spec itself or separate file
- **Not required:** Simple features don't need diagrams

---

## 4. Polish Language for /chkd Skill

Add to the build skill:

> "While implementing checklist items, add professional polish - loading states, error handling, micro-interactions - without needing explicit permission. These aren't scope changes, they're quality."

**Intent:** Claude can be creative on the "how" while staying on-plan for the "what".

---

## 5. Catching Duplications

**No new tooling needed.** The workflow catches it:

1. **Explore phase** - "Search for existing functions that might already do this"
2. **Design phase** - When designing backend structure, you see existing patterns
3. **Prototype phase** - Can't design where data comes from without looking at what exists

**Simple rule for /chkd skill:**
> "Before creating a new utility function, grep for similar patterns. If something close exists, extend it rather than duplicate."

---

## 6. Debugging Skill (Future)

Make debugging more formal:

1. **Open debug session** - Load skill, create debug file
2. **Write as you go** - Document findings in the debug file
3. **Close with learnings** - Capture what was learned
4. **Update overview** - Check if we need to prevent same mistake

**Output:** List of debug sessions with learnings, fed back into overall knowledge.

---

## 7. Iteration & Rework

There will always be rework, refinement, and debugging. These are functions of the workflow, not failures.

The workflow template accounts for this:
- Feedback happens before full build (catches issues early)
- Polish phase explicitly includes iteration
- Debug sessions capture learnings

---

## Implementation in v2

### UI Changes
- FeatureCapture pre-populates workflow template items
- Claude fills in feature-specific details under each step

### Skill Changes
- Add polish language to /chkd
- Add "search existing functions" guidance
- (Future) Formal debugging skill

### No New Tools
- Workflow itself catches duplications
- No heavy overhead systems

---

## Guiding Principle

> "Use your wisdom and knowledge to keep it best practices and simple."

Don't build systems to enforce good behavior. Build workflows that naturally lead to good behavior.
