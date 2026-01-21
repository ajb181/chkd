## Working with chkd

### Keep the UI Engaged (IMPORTANT!)

**Before writing any code, ask yourself:** Am I in a session?

- **Working on a spec task?** → Use `/chkd SD.1` (starts session automatically)
- **Doing ad-hoc work not in spec?** → Run `chkd impromptu "what I'm doing"` FIRST
- **Debugging something?** → Run `chkd debug "what I'm investigating"` FIRST

**The UI should NEVER show "IDLE" while you're coding.**

### CLI Commands
```bash
# Status - ALWAYS run first
chkd status              # See progress & current task
chkd progress            # See current task's sub-items

# Sessions
chkd impromptu "desc"    # Start ad-hoc work session
chkd debug "desc"        # Start debug session
chkd done                # End session

# Building (tick as you go!)
chkd working "item"      # Signal you're starting an item
chkd tick "item"         # Mark item complete

# Bugs & Quick Wins
chkd bug "description"   # Quick-create a bug
chkd win "title"         # Add a quick win
chkd bugs                # List open bugs

# Help
chkd help                # Full command reference
```

### Skills (in Claude Code)
- `/chkd SD.1` - Build a specific task from the spec
- `/story` - Refine specs, plan features
- `/bugfix` - Fix bugs with minimal changes (research first!)
- `/commit` - Safe commit workflow

### Source of Truth
- `docs/SPEC.md` - Feature checklist (SD.1, FE.1, BE.1 format)
- `docs/GUIDE.md` - How to use chkd workflow
