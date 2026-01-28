# MCP Tool Guidance Overhaul

## Philosophy

chkd exists to help Claude and humans work together effectively. The MCP tools are Claude's interface to the system - every tool response is a chance to reinforce good habits, provide context, and guide behavior.

**Core Principles:**
1. **Human-AI Collaboration** - User stays in control, Claude stays accountable
2. **Prevent Drift** - Keep focus on planned work, capture distractions
3. **Slow Down** - Understand before acting, research before coding
4. **Nothing Lost** - Log everything, fix later
5. **Checkpoints** - Regular alignment with the user

**What Good Tool Guidance Does:**
- Sets the right MINDSET for the task
- Provides clear PROCESS to follow
- Reminds of DISCIPLINE (what NOT to do)
- Offers CHECKPOINTS for user alignment
- Shows TRANSITIONS to other modes

---

## Tool Categories & Current State

### 1. SESSION MANAGEMENT
Controls Claude's work state. Critical for keeping UI engaged.

| Tool | Purpose | Current Guidance | Needs |
|------|---------|------------------|-------|
| `chkd_status` | See current state | Good - shows progress, nudges | Add: mindset reminder based on mode |
| `chkd_impromptu` | Start ad-hoc work | Minimal - just says "session started" | Add: what impromptu means, discipline |
| `chkd_debug` | Start investigation | ✅ DONE - full methodology | - |
| `chkd_done` | End session | Minimal | Add: reflection prompt, what's next |
| `chkd_checkin` | 15-min check-in | Basic questions | Add: structure, what to report |
| `chkd_pulse` | Quick status update | Minimal | Add: what makes a good pulse |
| `chkd_pivot` | Change focus explicitly | Minimal | Add: when to pivot vs push through |

### 2. BUG WORKFLOW
The full lifecycle of finding, fixing, and verifying bugs.

| Tool | Purpose | Current Guidance | Needs |
|------|---------|------------------|-------|
| `chkd_bug` | Log a bug | Good - reminds to continue | Add: what makes a good bug report |
| `chkd_bugfix` | Start fixing | ✅ DONE - full methodology | - |
| `chkd_fix` | Signal ready | Minimal | Add: checklist before declaring ready |
| `chkd_resolve` | Close after verify | Minimal | Add: what counts as verified |
| `chkd_bugs` | List bugs | Basic list | Add: triage guidance |

### 3. TASK WORKFLOW
Building features from the spec.

| Tool | Purpose | Current Guidance | Needs |
|------|---------|------------------|-------|
| `chkd_working` | Signal starting item | Minimal | Add: explore-first reminder |
| `chkd_tick` | Mark complete | Minimal | Add: completion checklist |
| `chkd_suggest` | What to work on | Good analysis | Add: decision framework |
| `chkd_also` | Log off-task work | Minimal | Add: when to use, examples |

### 4. SPEC MANAGEMENT
Adding and organizing work items.

| Tool | Purpose | Current Guidance | Needs |
|------|---------|------------------|-------|
| `chkd_add` | Add feature | Basic | Add: what makes a good feature |
| `chkd_add_child` | Add sub-task | Basic | Add: task breakdown guidance |
| `chkd_add_task` | Add to current | Basic | Same as above |
| `chkd_tag` | Organize items | Basic | Fine as-is |

### 5. QUICK WINS
Small improvements to capture and do later.

| Tool | Purpose | Current Guidance | Needs |
|------|---------|------------------|-------|
| `chkd_win` | Add quick win | Minimal | Add: what qualifies as quick win |
| `chkd_wins` | List wins | Basic | Add: when to tackle wins |
| `chkd_won` | Mark done | Minimal | Fine as-is |

### 6. MULTI-WORKER SYSTEM
Parallel Claude workers on separate tasks.

| Tool | Purpose | Current Guidance | Needs |
|------|---------|------------------|-------|
| `chkd_spawn_worker` | Create worker | Technical | Add: when to parallelize |
| `chkd_workers` | List workers | Basic | Add: what to look for |
| `chkd_worker_heartbeat` | Worker check-in | Technical | Add: worker discipline |
| `chkd_worker_complete` | Worker done | Technical | Add: completion criteria |
| `chkd_worker_status` | Check status | Technical | Fine as-is |
| `chkd_merge_worker` | Merge work | Technical | Add: review-first reminder |
| `chkd_pause/resume/stop` | Control workers | Technical | Fine as-is |
| `chkd_dead_workers` | Find stuck | Technical | Fine as-is |

### 7. RESEARCH TOOLS
Understanding the codebase before making changes.

| Tool | Purpose | Current Guidance | Needs |
|------|---------|------------------|-------|
| `chkd_research_codebase` | Overview | Basic | Add: what to look for |
| `chkd_research_patterns` | Find patterns | Basic | Add: why patterns matter |
| `chkd_research_dependencies` | Impact analysis | Basic | Add: when to use |
| `chkd_research_summary` | Share findings | Structured | Add: good summary example |

### 8. STORY TOOLS
Planning features before building.

| Tool | Purpose | Current Guidance | Needs |
|------|---------|------------------|-------|
| `chkd_story_create` | Create story | Structured | Add: good story criteria |
| `chkd_story_breakdown` | Break into tasks | Structured | Add: sizing guidance |
| `chkd_story_present` | Get approval | Structured | Fine as-is |

### 9. REVIEW TOOLS
Code review for worker output.

| Tool | Purpose | Current Guidance | Needs |
|------|---------|------------------|-------|
| `chkd_review_diff` | See changes | Technical | Add: what to look for |
| `chkd_review_quality` | Evaluate code | Structured | Add: quality criteria |
| `chkd_review_criteria` | Check acceptance | Structured | Fine as-is |
| `chkd_review_feedback` | Send feedback | Structured | Add: good feedback guide |
| `chkd_review_approve` | Approve merge | Structured | Add: approval checklist |

### 10. DOCUMENTATION TOOLS
Generating docs after features.

| Tool | Purpose | Current Guidance | Needs |
|------|---------|------------------|-------|
| All docs_* tools | Generate docs | Structured output | Fine as-is (output-focused) |

### 11. IDEAS MANAGEMENT
Stakeholder feature requests.

| Tool | Purpose | Current Guidance | Needs |
|------|---------|------------------|-------|
| `chkd_ideas_list` | See ideas | Basic | Fine as-is |
| `chkd_ideas_review` | Review idea | Structured | Fine as-is |
| `chkd_ideas_approve/reject` | Decide | Basic | Add: decision criteria |

### 12. UTILITIES
Maintenance and admin tools.

| Tool | Purpose | Current Guidance | Needs |
|------|---------|------------------|-------|
| `chkd_upgrade_mcp` | Version check | Technical | Fine as-is |
| `chkd_transfer` | Move items | Technical | Fine as-is |
| `chkd_spec_check/repair` | Fix spec | Technical | Fine as-is |

---

## Priority Tiers

### Tier 1: HIGH IMPACT (Session & Core Workflow)
These tools are used constantly. Poor guidance here compounds.

1. **`chkd_impromptu`** - Needs full "ad-hoc work" methodology
2. **`chkd_working`** - Needs "explore-first" reminder before building
3. **`chkd_tick`** - Needs completion discipline
4. **`chkd_done`** - Needs reflection/transition guidance
5. **`chkd_checkin`** - Needs structured check-in format
6. **`chkd_pulse`** - Needs "good pulse" guidance

### Tier 2: MEDIUM IMPACT (Bug & Task Flow)
Used regularly, shapes behavior.

7. **`chkd_fix`** - Needs "ready to verify" checklist
8. **`chkd_resolve`** - Needs verification criteria
9. **`chkd_suggest`** - Needs decision framework
10. **`chkd_pivot`** - Needs pivot vs push-through guidance
11. **`chkd_also`** - Needs clear examples

### Tier 3: LOWER PRIORITY (Specialized Tools)
Used less often, more technical.

- Worker tools - mostly fine, technical output
- Research tools - could use more context
- Story/Review tools - structured, mostly fine
- Docs/Ideas tools - output-focused, fine as-is

---

## Proposed Guidance Patterns

### Session Start Tools (impromptu, working)
```
[MODE] HEADER
═══════════════════════════════════════
Context: {what you're doing}

MINDSET: {appropriate mindset for this mode}
───────────────────────────────────────

BEFORE YOU START:
• {pre-work checklist}

DISCIPLINE:
• {what to do}
• {what NOT to do}

CHECKPOINTS:
□ {user alignment points}

WHEN DONE: {transition command}
```

### Progress Tools (tick, done, fix)
```
✓ {action completed}

BEFORE MOVING ON:
□ {completion checklist item}
□ {completion checklist item}

NEXT: {what to do next}
```

### Check-in Tools (checkin, pulse)
```
📋 CHECK-IN
───────────────────────────────────────
Report to user:
• What you've done
• What you're doing now
• Any blockers or questions
• Estimated progress

GOOD CHECK-IN EXAMPLE:
"{example}"
```

---

## Implementation Order

1. `chkd_impromptu` - Most used session starter after debug/bugfix
2. `chkd_working` - Critical "explore first" reminder
3. `chkd_checkin` - Shapes ongoing communication
4. `chkd_tick` - Completion discipline
5. `chkd_done` - Session closure
6. `chkd_pulse` - Quick updates
7. `chkd_fix` / `chkd_resolve` - Bug closure
8. `chkd_pivot` - Focus management
9. `chkd_suggest` - Decision support
10. `chkd_also` - Off-task logging

---

## Questions to Resolve

1. **How verbose?** Debug/bugfix are quite long. Should all tools be this detailed, or just critical ones?

2. **Consistency vs context?** Should every tool follow the same template, or adapt to purpose?

3. **Training vs reference?** Are these messages meant to teach Claude (first time) or remind (ongoing)?

**Recommendation:**
- Tier 1 tools: Full methodology (like debug/bugfix)
- Tier 2 tools: Key reminders + checklist
- Tier 3 tools: Keep technical/minimal

---

## Success Criteria

After this overhaul:
1. Claude using any entry point gets consistent guidance
2. Every session start reinforces the right mindset
3. Every completion reinforces quality checks
4. User alignment is prompted at natural checkpoints
5. Scope discipline is reinforced throughout
