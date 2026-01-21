## Working with chkd

### CLI Commands
```bash
# Status - ALWAYS run first
chkd status              # See progress & current task
chkd progress            # See current task's sub-items

# Building (tick as you go!)
chkd working "item"      # Signal you're starting an item
chkd tick "item"         # Mark item complete

# Bugs
chkd bug "description"   # Quick-create a bug
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
