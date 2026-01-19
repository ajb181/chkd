# chkd v0.2.0 Spec

> Development quality control - spec-driven workflow

## Vision

Simple. One process. CLI that teaches.

### Phase 1: Core Infrastructure 🚧 🚧

> As a developer, I want a simple local server that handles spec management

- [x] **1.1 SvelteKit Setup** - Basic project structure with adapter-node
- [ ] **1.2 Database Layer** - SQLite for repos, sessions, bugs
- [ ] **1.3 Spec Parser** - Parse SPEC.md into structured data
- [ ] **1.4 Spec Writer** - Modify SPEC.md (toggle items, add items)
- [x] **1.5 Health Endpoint** - GET /api/health returns status
- [ ] **Dark Mode Support** - Add dark/light theme toggle
  - [ ] Explore: understand problem, search existing functions
  - [ ] Design: flow diagram if needed
  - [ ] Prototype: backend with test data + frontend calling it
  - [ ] Feedback: user reviews prototype
  - [ ] Implement: replace test data with real logic
  - [ ] Polish: iterate based on usage

### Phase 2: CLI Interface 📋

> As a developer, I want a CLI that teaches me the workflow

- [ ] **2.1 Status Command** - Show current task and progress
- [ ] **2.2 Start Command** - Begin working on a task
- [ ] **2.3 Tick Command** - Mark items complete
- [ ] **2.4 Done Command** - Complete current task
- [ ] **2.5 Workflow Command** - Show the development workflow

### Phase 3: Workflow Integration 📋

> As a developer, I want new features to follow the workflow template

- [ ] **3.1 Feature Template** - Pre-populate with Explore/Design/Prototype/Feedback/Implement/Polish
- [ ] **3.2 Skills Update** - Update Claude Code skills with new endpoints
