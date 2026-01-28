# MCP Maximized: Design Document for Claude Workflow Control

## Vision

Transform chkd from a CLI-based workflow tool into a **bidirectional guidance system**:

1. **User → Claude**: Shape how Claude works through context, nudges, and checkpoints
2. **Claude → User**: Help users get value from the system, suggest actions, surface insights

Not rigid rules - natural collaboration where both parties help each other use the system well.

---

## Part 0: The Bidirectional Relationship

### Current State (One-Way)

Today chkd is mostly **user → Claude**:
- User sets up spec
- User runs commands
- Claude follows instructions in CLAUDE.md
- Claude uses CLI to update status

The user does all the "system work" - Claude just follows along.

### The Opportunity (Two-Way)

```
┌─────────────────────────────────────────────────────────────┐
│                    BIDIRECTIONAL FLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  USER → CLAUDE                    CLAUDE → USER             │
│  ┌─────────────────────┐         ┌─────────────────────┐   │
│  │ • Set up spec       │         │ • Suggest next task │   │
│  │ • Define features   │         │ • Surface patterns  │   │
│  │ • Queue messages    │         │ • Remind forgotten  │   │
│  │ • Verify fixes      │         │ • Guide workflows   │   │
│  │ • Approve phases    │         │ • Explain commands  │   │
│  └─────────────────────┘         │ • Capture to spec   │   │
│                                  │ • Show progress     │   │
│                                  │ • Flag risks        │   │
│                                  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### What "Claude Helps User" Looks Like

**1. Suggest What's Next**
```
User: "what should I work on?"
Claude: [reads chkd_status] "SD.2 is ready and unblocked.
        SD.3 depends on it. I'd suggest SD.2 next."
```

**2. Surface Patterns**
```
Claude: "I notice 3 of the last 5 bugs were in the auth module.
        Want me to add a tech debt item to refactor it?"
```

**3. Guide Workflows**
```
User: "there's a bug with login"
Claude: "Let me log that: `chkd bug 'login issue'`.
        Want to fix it now with `/bugfix` or continue current work?"
```

**4. Capture Work to Spec**
```
User: "actually let's also add password reset"
Claude: "I'll add that to the spec: `chkd add 'Password reset flow'`.
        Should it go in the current milestone or future?"
```

**5. Proactive Progress Updates**
```
Claude: "We've completed 4/6 sub-items on SD.2.
        Two remaining: 'Add validation' and 'Error handling'.
        Ready to continue?"
```

**6. Remind About Forgotten Items**
```
Claude: "Before we wrap up - there's still a quick win from
        yesterday: 'Update error messages'. Want to knock it out?"
```

### MCP Enables This

With MCP, Claude has **native access to system state**:
- Read conscience → know what's happening
- Call tools → take actions naturally
- Access resources → see full context

Without MCP, Claude has to:
- Parse CLI text output
- Hope user runs the right commands
- Rely on CLAUDE.md instructions (easily forgotten)

---

## Part 0.5: The Anchor System (Core Concept)

### The Problem: Who's In Control?

Currently, Claude is in control of what it's "supposed" to be doing:
- Claude starts a session
- Claude decides what to work on
- UI just displays what Claude reports

**This feels out of control.** Claude races off, doesn't check in enough, drifts from the plan.

### The Solution: UI-Driven Anchors

**Move task control to the app.** User sets the ANCHOR - the source of truth for what should be happening.

```
CURRENT (Claude-driven):
User tells Claude → Claude starts session → UI displays → hope for the best

PROPOSED (UI-driven):
User sets anchor in UI → MCP knows anchor → Claude works → MCP validates → nudges back
```

### How Anchors Work

```
┌─────────────────────────────────────────────────────────────┐
│                      WEB UI                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🎯 ANCHOR: SD.3 User Authentication    [Change]     │   │
│  │    Status: ON TRACK ✓                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Expected work:                                             │
│  ⬜ Add login form ← Claude should be here                  │
│  ⬜ Session handling                                        │
│  ⬜ Token storage                                           │
│                                                             │
│  [Queue message to Claude: _______________] [Send]          │
└─────────────────────────────────────────────────────────────┘
```

**User clicks spec item → becomes the ANCHOR**
- MCP knows: "Claude should be working on SD.3"
- Every Claude action is validated against this anchor
- Off-track work is flagged, not blocked

### Control Split: 60% App, 40% CLI

| Control Surface | Use Case | % of Time |
|-----------------|----------|-----------|
| **Web UI** | Set anchors, monitor progress, queue messages | 60-70% |
| **CLI** | Quick commands, automation, terminal workflow | 30-40% |

Both work together - CLI can still start sessions, but UI anchor takes precedence.

---

## Part 0.6: Co-Development Mediation

### MCP as Mediator

MCP doesn't just track - it **mediates** between user and Claude:

```
┌─────────────────────────────────────────────────────────────┐
│         USER                          CLAUDE                │
│           │                              │                  │
│           │    ┌──────────────────┐      │                  │
│           └───►│   MCP MEDIATOR   │◄─────┘                  │
│                │                  │                         │
│                │ • Anchor (task)  │                         │
│                │ • Workflow mode  │                         │
│                │ • Check-ins      │                         │
│                │ • Off-track      │                         │
│                │   detection      │                         │
│                └──────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### Both Parties Can Be Off-Track

| Who | Off-track signal | MCP response |
|-----|------------------|--------------|
| Claude | Working on unrelated code | "Return to anchor SD.3 or pivot" |
| Claude | Racing ahead without checking in | "Pause - verify with user" |
| User | Asking for unrelated work | "This doesn't match anchor. Open impromptu?" |
| User | Going down rabbit hole | "20min investigating. Log findings? Start debug session?" |

### Check-In Enforcement

Claude tends to race off without enough user interaction. MCP enforces check-ins:

```
Time-based:
- 10min without user interaction → "Check in - what have you found?"
- 20min on same sub-item → "Still working on X? Update user."

Event-based:
- Sub-item completed → "Verify with user before moving on"
- Big code change → "Explain approach to user first"
- Bug found → "Log it and return to anchor, or pivot?"
```

### Smart Session Suggestions

When work doesn't match the anchor:

```
User: "Fix that navbar bug"
MCP detects: Unrelated to anchor SD.3

Suggestions:
1. "Log with chkd_bug() and continue SD.3?"
2. "Pause SD.3 and open debug session?"
3. "Add to quick wins for later?"
4. "Pivot anchor to navbar work?"
```

### Workflow Enforcement

Different modes have different rules:

```
DEBUG MODE:
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Research │───►│ Propose  │───►│ Minimal  │───►│ Verify   │
│ FIRST    │    │ to user  │    │ fix only │    │ with user│
└──────────┘    └──────────┘    └──────────┘    └──────────┘
MCP enforces: "Have you researched?" "User approved?" "Minimal change?"

QUICK WIN MODE:
┌──────────┐    ┌──────────┐
│ Do it    │───►│ Done     │
│ quickly  │    │ move on  │
└──────────┘    └──────────┘
MCP enforces: "Taking too long - still a quick win?"

FEATURE MODE:
┌─────────┐    ┌──────┐    ┌───────┐    ┌────────┐
│ EXPLORE │───►│ PLAN │───►│ BUILD │───►│ VERIFY │
└─────────┘    └──────┘    └───────┘    └────────┘
MCP enforces: Phase-appropriate actions only
```

---

## Part 1: Understanding MCP Capabilities

### What MCP Offers

| Capability | What It Does | Our Opportunity |
|------------|--------------|-----------------|
| **Tools** | Synchronous actions Claude can invoke | Workflow actions (tick, bug, pulse) with embedded guidance |
| **Resources** | Data Claude can read on demand | "Conscience" - always-available context that shapes behavior |
| **Prompts** | Pre-defined prompt templates | Phase-specific prompts (explore, build, verify) |
| **Sampling** | Server can request LLM completions | Server-initiated quality checks |
| **Elicitation** | Structured user input collection | Approval gates, checkpoint confirmations |

### The Key Insight

MCP isn't just about giving Claude actions - it's about **shaping Claude's decision-making context**. Every tool response, every resource read, every prompt template is an opportunity to nudge Claude toward quality behavior.

---

## Part 2: Work Categorization (Flexible, Not Rigid)

### The Problem with Rigid Categories

Developers don't think "I'm starting FE.3.2" - they think "I need to fix this thing" or "let me add that feature." Forcing everything into a strict hierarchy creates friction.

### Our Approach: Organic Categories

```
┌─────────────────────────────────────────────────────────────┐
│                     WORK IN CHKD                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PLANNED WORK (Spec-driven)          REACTIVE WORK          │
│  ┌─────────────────────┐            ┌─────────────────────┐ │
│  │ Features (SD.1, etc)│            │ Bugs                │ │
│  │ - Has phases        │            │ - Two-gate flow     │ │
│  │ - Has sub-items     │            │ - Align → Verify    │ │
│  │ - Quality workflow  │            │                     │ │
│  └─────────────────────┘            │ Quick Wins          │ │
│                                     │ - Small improvements│ │
│                                     │ - No ceremony       │ │
│                                     └─────────────────────┘ │
│                                                             │
│  AD-HOC WORK (Still tracked!)                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Impromptu - "I'm doing something not in the spec"       ││
│  │ Debug     - "I'm investigating something"               ││
│  │ → Still visible in UI, still trackable, just flexible   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### The Rule: Always Be In Something

The UI should **never show IDLE while Claude is working**. But we don't force everything into spec items:

- Working on spec task? → Session auto-starts with task
- Random fix? → `chkd impromptu "fixing the thing"`
- Investigating? → `chkd debug "why is X happening"`

**This captures real workflow without forcing artificial structure.**

---

## Part 3: The Conscience Pattern

### What Is It?

A **resource** (not a tool) that Claude can read at any time, containing:

1. **Session State** - What am I working on? What phase? What's the queue?
2. **Habit Reminders** - Contextual nudges based on current state
3. **Behavioral Guidance** - What should I be doing right now?

### Why a Resource?

- Tools are for actions, resources are for context
- Claude can read it proactively or we can suggest reading it
- It's always current - reflects live session state
- Doesn't require Claude to "do" anything to get guidance

### Conscience Content Structure

```typescript
interface Conscience {
  // Current State
  session: {
    type: 'feature' | 'bug' | 'impromptu' | 'debug' | null;
    id: string | null;
    phase: 'explore' | 'plan' | 'build' | 'verify' | null;
    startedAt: Date;
  };

  // What needs attention
  queue: QueueItem[];  // Messages from user

  // Phase-specific guidance
  currentGuidance: string[];  // What to do NOW

  // Habit reminders (always present)
  habits: string[];
}
```

### Example Conscience Output

```markdown
## Current Session
Working on: SD.3 User Authentication
Phase: BUILD
Duration: 23 minutes

## Queue (1 message)
- "don't forget to handle the edge case where token is expired"

## Right Now
You're in BUILD phase. Focus on:
- Implement one sub-item at a time
- Run `chkd tick "sub-item"` after each completion
- Don't batch ticks - keep progress visible

## Habits
- See a bug? Log it with `chkd bug`, don't derail
- Before editing code, read it first
- Check queue regularly with `chkd pulse`
```

---

## Part 4: Phase-Based Feature Development

### The Phases

Features go through phases. Each phase has different goals and guardrails.

```
EXPLORE → PLAN → BUILD → VERIFY
```

| Phase | Goal | Claude Should | Claude Should NOT |
|-------|------|---------------|-------------------|
| **EXPLORE** | Understand the code | Read files, search, ask questions | Write any code |
| **PLAN** | Design the approach | Outline steps, identify risks, flag complexity | Start implementing |
| **BUILD** | Implement | Write code, tick sub-items, stay focused | Investigate tangents |
| **VERIFY** | Confirm it works | Test, check edge cases, get user approval | Add new features |

### How MCP Enforces This

**Tool Response Nudges:**
```typescript
// In BUILD phase, tick tool responds with:
{
  success: true,
  message: "Marked 'Add login form' complete",
  nudge: "You're in BUILD phase. What's the next sub-item?"
}

// In EXPLORE phase, if Claude tries to tick:
{
  success: false,
  error: "Can't tick during EXPLORE phase",
  hint: "You're still exploring. Use `chkd plan` when ready to move to PLAN phase."
}
```

**Resource Guidance:**
The conscience resource changes based on phase:
- EXPLORE: "Focus on understanding. What files will you touch?"
- PLAN: "What's your approach? Have you flagged any complexity?"
- BUILD: "One sub-item at a time. Tick as you go."
- VERIFY: "Does it work? Have you tested edge cases?"

---

## Part 5: Two-Gate Bug Flow

### The Problem

Bugs get closed prematurely. Claude thinks it's fixed, user hasn't verified.

### The Solution: Two Human Checkpoints

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  CREATE  │────▶│  ALIGN   │────▶│   FIX    │────▶│ RESOLVE  │
│ chkd bug │     │  bugfix  │     │ chkd fix │     │ resolve  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                 │                │
                      ▼                 ▼                ▼
                 "Do we agree      "Fix ready,      "User verified,
                  on the bug?"     please verify"    now close"
```

### Gate 1: Alignment (bugfix)
- Claude and user discuss what the bug actually means
- User confirms understanding before work begins
- Prevents "fixing" the wrong thing

### Gate 2: Verification (fix → resolve)
- Claude signals fix is ready with `chkd fix`
- User tests/verifies
- Only then does user say to `chkd resolve`

### MCP Implementation

```typescript
// chkd_bugfix tool
{
  success: true,
  message: "Starting work on bug: Auth fails on mobile",
  checkpoint: {
    type: "alignment",
    question: "Before proceeding: Do you and the user agree on what this bug means and what 'fixed' looks like?",
    action: "Confirm understanding with user, then proceed to investigate"
  }
}

// chkd_fix tool
{
  success: true,
  message: "Bug marked as fixed (pending verification)",
  checkpoint: {
    type: "verification",
    question: "The fix is ready. User needs to verify before closing.",
    action: "Ask user to test, then use `chkd resolve` after confirmation"
  }
}
```

---

## Part 6: Quality Mechanisms

### 1. Nudges in Every Response

Every tool response is an opportunity:

```typescript
function addNudge(response: ToolResponse, sessionState: Session): ToolResponse {
  const nudges = [];

  // Check queue
  if (sessionState.queue.length > 0) {
    nudges.push(`📬 ${sessionState.queue.length} message(s) in queue - run 'chkd pulse' to check`);
  }

  // Phase reminders
  if (sessionState.phase === 'build' && Date.now() - sessionState.lastTick > 10 * 60 * 1000) {
    nudges.push("⏰ Been a while since last tick. Making progress on sub-items?");
  }

  // Focus reminders
  if (sessionState.type === 'feature' && response.action === 'bug_created') {
    nudges.push("🎯 Bug logged. Return to your feature - don't derail!");
  }

  return { ...response, nudges };
}
```

### 2. The Queue System

Async communication between user and Claude:

- User types in web UI → goes to queue
- Claude checks with `chkd pulse` → sees messages
- No blocking, no context switching for minor notes

**Queue is surfaced in:**
- Conscience resource (always visible)
- Tool response nudges ("you have messages")
- Status output

### 3. Complexity Flags

During EXPLORE, Claude should flag:
- Files that are too long (500+ lines)
- Messy code that needs refactoring
- Missing tests
- Unclear patterns

**Tool support:**
```typescript
// chkd_flag tool
{
  type: "complexity",
  file: "src/auth/handler.ts",
  issue: "600 lines, mixed concerns",
  suggestion: "Consider splitting before adding features"
}
```

User decides: refactor first or proceed anyway.

---

## Part 7: MCP Server Architecture

### Tools (Actions)

| Tool | Purpose | Returns |
|------|---------|---------|
| `chkd_status` | Get current state | Session, progress, next task |
| `chkd_working` | Signal starting sub-item | Confirmation + phase guidance |
| `chkd_tick` | Complete sub-item | Progress update + next step nudge |
| `chkd_bug` | Log a bug | Confirmation + focus reminder |
| `chkd_bugfix` | Start bug work | Alignment checkpoint |
| `chkd_fix` | Signal fix ready | Verification checkpoint |
| `chkd_resolve` | Close verified bug | Confirmation |
| `chkd_pulse` | Check queue | Messages + habits |
| `chkd_also` | Add to queue | Confirmation |
| `chkd_phase` | Change phase | New phase guidance |
| `chkd_flag` | Flag complexity | Logged for user review |
| `chkd_impromptu` | Start ad-hoc session | Session started |
| `chkd_debug` | Start debug session | Session started |
| `chkd_done` | End session | Session summary |

### Resources (Context)

| Resource | URI | Purpose |
|----------|-----|---------|
| Conscience | `chkd://conscience` | Live session state + guidance |
| Spec | `chkd://spec` | Current spec contents |
| Progress | `chkd://progress/{taskId}` | Sub-items for specific task |
| Queue | `chkd://queue` | Current queue messages |

### Prompts (Templates)

| Prompt | Purpose |
|--------|---------|
| `start_feature` | Begin a spec feature with proper phases |
| `start_bugfix` | Begin bug with alignment checkpoint |
| `explore_phase` | Guidance for exploring code |
| `build_phase` | Guidance for implementing |
| `verify_phase` | Guidance for verification |

---

## Part 8: Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         USER                                │
│                          │                                  │
│            ┌─────────────┼─────────────┐                    │
│            │             │             │                    │
│            ▼             ▼             ▼                    │
│       ┌────────┐    ┌────────┐    ┌────────┐               │
│       │ Web UI │    │  CLI   │    │ Claude │               │
│       │ :3847  │    │ chkd   │    │ (MCP)  │               │
│       └────┬───┘    └────┬───┘    └────┬───┘               │
│            │             │             │                    │
│            └─────────────┼─────────────┘                    │
│                          │                                  │
│                          ▼                                  │
│                    ┌──────────┐                             │
│                    │   API    │                             │
│                    │ /api/*   │                             │
│                    └────┬─────┘                             │
│                         │                                   │
│            ┌────────────┼────────────┐                      │
│            ▼            ▼            ▼                      │
│       ┌────────┐   ┌────────┐   ┌────────┐                 │
│       │ SQLite │   │ SPEC   │   │ Queue  │                 │
│       │   DB   │   │  .md   │   │ Store  │                 │
│       └────────┘   └────────┘   └────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

**All roads lead to the same data:**
- Web UI hits API endpoints
- CLI hits same API endpoints
- MCP server hits same API endpoints (or shared logic)

**Single source of truth, multiple interfaces.**

---

## Part 9: What Makes This Different

### vs. Simple Task Trackers
- Not just "did you do it?" but "how are you doing it?"
- Phase-based guidance, not just checkboxes
- Behavioral nudges, not just status updates

### vs. Rigid Workflow Systems
- Ad-hoc work is first-class (impromptu, debug sessions)
- Phases guide, don't block
- Flexibility where it matters, structure where it helps

### vs. Pure AI Autonomy
- Human checkpoints at key moments
- User stays in the loop without micromanaging
- Queue system for async notes without interruption

---

## Part 10: Implementation Priorities

### Phase 1: Core MCP (Done ✓)
- [x] Basic tools (status, tick, bug, pulse)
- [x] Conscience resource
- [x] Server runs and connects

### Phase 2: Behavioral Guidance
- [ ] Nudges in tool responses based on state
- [ ] Phase-specific guidance in conscience
- [ ] Queue surfacing in responses

### Phase 3: Phase Enforcement
- [ ] Phase tracking in sessions
- [ ] Phase-appropriate tool responses
- [ ] Phase transition tools (explore → plan → build → verify)

### Phase 4: Advanced Features
- [ ] Complexity flagging tools
- [ ] Sampling for quality checks (server-initiated)
- [ ] Prompts for common workflows

### Phase 5: Polish
- [ ] Elicitation for structured approvals
- [ ] Session summaries
- [ ] Analytics/insights

---

## Summary

**The MCP opportunity isn't just "more tools" - it's shaping Claude's working context.**

By providing:
1. **Always-available conscience** - Claude knows where it is and what it should be doing
2. **Nudges in every response** - Gentle guidance without blocking
3. **Structured checkpoints** - Human approval where it matters
4. **Flexible work categories** - Capture real workflow without forcing structure
5. **Phase-based guidance** - Right help at the right time

We create a system where quality work is the natural outcome, not something enforced by rigid rules.

**The goal: Make it easier to do the right thing than the wrong thing.**

---

## Part 11: Feasibility Assessment

### Honest Question: Does MCP Actually Improve What We Have?

Let's compare CLI-only vs MCP approaches.

### What We Have Now (CLI)

| Capability | How It Works | Effectiveness |
|------------|--------------|---------------|
| Status check | `chkd status` → parse text | ✅ Works fine |
| Tick items | `chkd tick "item"` | ✅ Works fine |
| Log bugs | `chkd bug "desc"` | ✅ Works fine |
| Guidance | CLAUDE.md instructions | ⚠️ Easy to forget |
| Context | Run `chkd status` manually | ⚠️ Must remember to check |
| Nudges | Hint text in CLI output | ⚠️ Lost in output noise |
| User → Claude | Queue + pulse command | ✅ Works but clunky |
| Claude → User | Just... talk | ✅ Works |

**CLI Verdict**: Functional, but passive. Claude must remember to use it.

### What MCP Adds

| Capability | How It Works | Improvement |
|------------|--------------|-------------|
| Status check | Native tool call | 🔄 Same - structured data vs text |
| Tick items | Native tool call | 🔄 Same - no shell spawn |
| Log bugs | Native tool call | 🔄 Same |
| Guidance | Conscience resource | ✅ **Better** - always available |
| Context | Resource read | ✅ **Better** - proactive access |
| Nudges | Tool response data | ✅ **Better** - structured, can't miss |
| User → Claude | Resource + tool | 🔄 Same |
| Claude → User | Prompts/suggestions | ✅ **Better** - guided workflows |

### Where MCP Actually Helps

**1. The Conscience Resource** - Biggest win
- CLI: Claude must run `chkd status` and remember to parse it
- MCP: Claude reads `chkd://conscience` and gets structured state + guidance
- **Impact**: Guidance that's always there, not just when remembered

**2. Structured Nudges** - Real improvement
- CLI: Hints are text mixed with output, easy to ignore
- MCP: Nudges are structured data in every tool response
- **Impact**: Consistent behavioral guidance

**3. Proactive Context** - Enables Claude → User flow
- CLI: Claude only knows what it runs commands to check
- MCP: Claude can read resources to understand state before acting
- **Impact**: Claude can suggest, remind, guide

**4. Native Integration** - Quality of life
- CLI: Shell spawning, text parsing, error handling
- MCP: Native JSON, typed schemas, proper errors
- **Impact**: More reliable, less hacky

### Where MCP Doesn't Help

**1. Core Actions** - Same either way
- Ticking items, logging bugs, checking status
- MCP is cleaner but CLI works fine

**2. User Input** - User still types
- Queue messages, feature descriptions, bug reports
- No MCP magic here

**3. Human Checkpoints** - Still need human
- Verification, approval, alignment
- MCP can structure it better but human still decides

### The Real Question: Is It Worth Building?

**Arguments FOR MCP:**
- Conscience resource is genuinely better than CLAUDE.md + status commands
- Enables the "Claude helps user" flow that CLI can't do well
- More reliable than text parsing
- Better Claude Code integration (native tools vs bash commands)
- Foundation for advanced features (sampling, elicitation)

**Arguments AGAINST MCP:**
- CLI works fine for basic workflows
- Another thing to maintain
- Users need to configure MCP server
- Complexity for marginal gain on core features

### Verdict: Selective MCP

**Don't replace CLI with MCP** - keep CLI for:
- Quick terminal use
- CI/CD integration
- Users who don't use Claude

**Use MCP for what CLI can't do well:**
- Conscience resource (always-on guidance)
- Structured nudges (behavioral shaping)
- Claude → User suggestions (proactive help)
- Phase-based guidance (context-aware)

### Minimum Viable MCP

If we're being honest about effort vs value:

| Feature | Value | Effort | Priority |
|---------|-------|--------|----------|
| Conscience resource | High | Low | **Do first** |
| Basic tools (status, tick, bug) | Medium | Low | Do |
| Nudges in responses | High | Medium | Do |
| Phase tracking | Medium | Medium | Maybe |
| Sampling/elicitation | Low | High | Skip for now |
| Prompts | Low | Low | Nice to have |

### Recommended Approach

1. **Keep CLI as-is** - it works, don't break it
2. **Add conscience resource** - this is the real win
3. **Add basic tools** - mirrors CLI for native access
4. **Add nudges** - structured guidance in responses
5. **Skip advanced MCP features** - not worth complexity yet

The conscience resource alone justifies MCP. Everything else is gravy.

---

## Summary (Revised)

**The bidirectional opportunity:**
- User helps Claude: checkpoints, queue, spec structure
- Claude helps user: suggestions, reminders, workflow guidance

**MCP's real value:**
- Not replacing CLI (it works fine)
- The conscience resource - always-available guidance
- Enabling Claude → User proactive help
- Structured nudges that can't be ignored

**What to build:**
1. Conscience resource (high value, low effort)
2. Basic tools mirroring CLI (medium value, low effort)
3. Nudges in responses (high value, medium effort)
4. Skip advanced features until we need them

**The goal remains: Make it easier to do the right thing than the wrong thing.**

But now we're honest that MCP is a tool for specific improvements, not a magic upgrade.
