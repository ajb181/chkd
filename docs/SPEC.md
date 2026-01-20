# chkd v2 Specification

> Organized by **system area** rather than build phase.
> The spec is both the todo list and the map of what exists.

---

## Overview

**chkd** is a development workflow system that makes AI-assisted development structured and consistent.

**Core idea**: Plan in one place (UI), build in another (terminal). The spec is the source of truth.

---

## Site Design

> How chkd looks and feels. Pages, layouts, user flows.

### Pages

#### Guide (`/guide`)
How to use chkd - workflow explanation, commands, troubleshooting.

**Status**: Docs exist, UI page needed
- [x] **SD.1 Guide Documentation** - docs/GUIDE.md created
- [ ] **SD.2 Guide Page** - Svelte page at /guide route
  - [ ] Workflow diagram
  - [ ] Session lifecycle visual
  - [ ] Quick reference cards
  - [ ] Troubleshooting section

#### Command Center (`/`)
The main workspace. Shows current task, story list, progress.

**Status**: Not started
- [ ] **SD.3 Command Center Layout** - Main page structure
  - [ ] Current task card (pinned at top)
  - [ ] Story list sidebar
  - [ ] Story detail panel
  - [ ] Progress overview

#### Settings (`/settings`)
Configure repos and preferences.

**Status**: Not started
- [ ] **SD.4 Settings Page** - Basic settings
  - [ ] Repository path configuration
  - [ ] Theme toggle (dark/light)

### Design System

- [ ] **SD.5 CSS Variables** - Color system, spacing, typography
- [ ] **SD.6 Component Styles** - Buttons, cards, inputs
- [x] **SD.7 Dark Mode** - Full dark theme support
- [x] **SD.8 Queue List for Off-Task Items** - Capture todos during active session, surface on tick with instructions for Claude to add to internal todo
  - [x] Queue input in task card (visible during active session)
  - [x] Queued item count badge
  - [x] Remove items before tick
  - [x] POST /api/session/queue - Add item
  - [x] GET /api/session/queue - List items
  - [x] DELETE /api/session/queue/:id - Remove item
  - [x] Update tick response to include queued items + instructions
  - [x] Auto-clear queue after surfacing
- [ ] [P1] **SD.9 Update the specfile template to have note stopping claude directly editing it.** - Force the use of the endpoints for spec update.  Also should look at claude file genreally and give a better overview of chkd and the calls to make - noting in the ci calls


> As a user, I want to have a specfile template that prevents me from directly editing it, so that I can ensure consistency and avoid unintentional changes.
  - [ ] Explore: understand problem, search existing functions
  - [ ] Design: flow diagram if needed
  - [ ] Prototype: backend with test data + frontend calling it
  - [ ] Feedback: user reviews prototype
  - [ ] Implement: replace test data with real logic
  - [ ] Polish: iterate based on usage
- [x] **SD.9 Test Queue Feature** - Dummy task for testing the queue feature
- [ ] **SD.10 Test Queue Feature** - Dummy task for testing queue
  - [ ] Explore: understand problem, search existing functions
  - [ ] Design: flow diagram if needed
  - [ ] Prototype: backend with test data + frontend calling it
  - [ ] Feedback: user reviews prototype
  - [ ] Implement: replace test data with real logic
  - [ ] Polish: iterate based on usage

---

## Frontend

> Svelte components, stores, client-side logic.

### Core Components

#### CurrentTaskCard
Shows active task status, progress, actions.

**Status**: Not started
- [ ] **FE.1 CurrentTaskCard Component**
  - [ ] Status badge (idle/building/testing/complete)
  - [ ] Progress bar
  - [ ] Task name and description
  - [ ] Time elapsed

#### StoryList
Collapsible list of areas and stories.

**Status**: Not started
- [ ] **FE.2 StoryList Component**
  - [ ] Area grouping (expandable)
  - [ ] Story selection
  - [ ] Progress percentages
  - [ ] Status indicators

#### StoryDetail
Full story view with checklist.

**Status**: Not started
- [ ] **FE.3 StoryDetail Component**
  - [ ] User story display
  - [ ] Checklist rendering
  - [ ] Item status toggling
  - [ ] Description/notes

#### FeatureCapture
Add new features to the spec.

**Status**: Not started
- [ ] **FE.4 FeatureCapture Component**
  - [ ] Feature title input
  - [ ] Area selection (Site Design / Frontend / Backend)
  - [ ] Workflow template auto-added
  - [ ] Duplicate detection

### State Management

- [ ] **FE.5 Stores** - Svelte stores for app state
  - [ ] Session state
  - [ ] Spec data
  - [ ] UI preferences

### Client API

- [ ] **FE.6 API Client** - Functions to call backend
  - [ ] Fetch wrapper with error handling
  - [ ] Type-safe responses
- [ ] [P1] **FE.7 Update the top Session ui to show other sessions in deveopment from other projects if many working at the same time.** - If I'm coding several different projects no matter what project file I'm looking at an easy way to toggle on and showing a summarised version of what that's up to as I go around the project but if I'm the master project then I'm looking at is still the main visible one at the time

> As a developer, I want to see other sessions in development from other projects if many are working at the same time, so that I can better collaborate and understand the overall context.
  - [ ] Explore: understand problem, search existing functions
  - [ ] Design: flow diagram if needed
  - [ ] Prototype: backend with test data + frontend calling it
  - [ ] Feedback: user reviews prototype
  - [ ] Implement: replace test data with real logic
  - [ ] Polish: iterate based on usage

---

## Backend

> SvelteKit server - APIs, database, services.

### Session API

Tracks current work context.

**Status**: Complete
- [x] **BE.1 Session Endpoints**
  - [x] `GET /api/session` - Current session
  - [x] `GET /api/status` - Human-friendly status
  - [x] `POST /api/session/start` - Begin task
  - [x] `POST /api/session/complete` - Mark task done
  - [x] `POST /api/session/check` - Validate if on-plan

### Spec API

Manage the specification document.

**Status**: Complete
- [x] **BE.2 Spec Endpoints**
  - [x] `GET /api/spec/full` - Parsed spec structure
  - [x] `POST /api/spec/tick` - Toggle item status
  - [x] `POST /api/spec/add` - Add new feature (with workflow template)

### Repository API

Manage repo configuration.

**Status**: Complete
- [x] **BE.3 Repo Endpoints**
  - [x] `GET /api/repos` - List repos
  - [x] `POST /api/repos` - Add repo

### Bug Queue API

Track bugs for later.

**Status**: Complete
- [x] **BE.4 Bug Endpoints**
  - [x] `GET /api/bugs` - List bugs
  - [x] `POST /api/bugs` - Add bug

### Core Services

#### Spec Parser
Parses SPEC.md into structured data.

**Status**: Complete
- [x] **BE.5 Spec Parser** - `src/lib/server/spec/parser.ts`
  - [x] Area/item extraction
  - [x] User story capture
  - [x] Progress calculation
  - [x] Format validation

#### Spec Writer
Modifies SPEC.md programmatically.

**Status**: Complete
- [x] **BE.6 Spec Writer** - `src/lib/server/spec/writer.ts`
  - [x] Mark items complete/incomplete
  - [x] Add new items
  - [x] Add workflow template sub-items
  - [x] Update status emojis (with unicode fix)

### Database

SQLite via better-sqlite3.

**Status**: Complete
- [x] **BE.7 Database Layer** - `src/lib/server/db/`
  - [x] Schema (repos, sessions, bugs)
  - [x] Query functions

### CLI

Command-line interface with workflow documentation.

**Status**: Complete
- [x] **BE.8 CLI** - `src/cli/index.ts`
  - [x] status, start, tick, done commands
  - [x] check, add, bug commands
  - [x] workflow command (shows diagram)
  - [x] help command
- [ ] **BE.9 Order detect when the instance has stopped developing and we haven't actually actively been told** - The system should automatically detect when an instance has stopped developing and notify the user, without requiring the user to actively check for this condition.

> As a user, I want to be notified when an instance has stopped developing so that I can take appropriate action.
  - [ ] Explore: understand problem, search existing functions
  - [ ] Design: flow diagram if needed
  - [ ] Prototype: backend with test data + frontend calling it
  - [ ] Feedback: user reviews prototype
  - [ ] Implement: replace test data with real logic
  - [ ] Polish: iterate based on usage

---

## Future Areas

> Not yet started. Organized by what they'll touch.

### Quality Features (v3+)
- [ ] **FUT.1 Test Generation** - Auto-generate tests on commit (port from v1)
- [ ] **FUT.2 Sceptic Check** - Validate ideas before building
- [ ] **FUT.3 Quality Gates** - Block bad code from main

### Git & Source Control (UI owns this)
- [ ] **FUT.4 Diff View** - See what changed during session
- [ ] **FUT.5 Staging UI** - Select files to commit
- [ ] **FUT.6 Commit Flow** - Pre-fill message from session, commit
- [ ] **FUT.7 Push to Remote** - Push when ready
- [ ] **FUT.8 Audit Trail** - History of commits per session

### Advanced Features
- [ ] **FUT.9 WebSocket Updates** - Real-time UI updates
- [ ] **FUT.10 Version History** - Track spec changes over time

---

## Reference

### Workflow Template

Every feature added gets these steps:
```
- [ ] Explore: understand problem, search existing functions
- [ ] Design: flow diagram if needed
- [ ] Prototype: backend with test data + frontend calling it
- [ ] Feedback: user reviews prototype
- [ ] Implement: replace test data with real logic
- [ ] Polish: iterate based on usage
```

### Spec Format Rules

- Area header: `## Area Name` or `### Sub-Area`
- Section numbers: `**XX.N Feature Name**` (e.g., BE.1, FE.2)
- Checklist: `- [ ]` or `- [x]`
- User story: Blockquote `>`
- Status line: `**Status**: Complete/In Progress/Not started`

### Design Standards

- Colors: CSS variables (`--primary`, `--success`, etc.)
- Border radius: 6px inputs, 8px buttons, 12px cards
- Spacing: 4px base (4, 8, 12, 16, 24, 32)
- Status emoji: ✅ complete, 🚧 in-progress, 📋 pending

### Code Standards

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions: `camelCase`
- API responses: `{ success, data?, error? }`

---

## Skills

Available Claude Code skills:

| Skill | Purpose |
|-------|---------|
| `/chkd` | Build mode - check session, implement tasks with polish |
| `/bugfix` | Fix bugs without feature creep - research first |
| `/story` | Develop stories - assess, question, refine specs |
| `/spec-check` | Validate SPEC.md format after editing |
