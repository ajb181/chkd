# CLI Command Quality Checklist

Use this checklist when creating or editing CLI commands.

---

## Command Function Quality

### 1. Input Handling
- [ ] Validates required arguments
- [ ] Shows usage if argument missing: `Usage: chkd <cmd> "arg"`
- [ ] Handles empty strings gracefully
- [ ] Parses flags correctly (--flag, --flag value)

### 2. API Calls
- [ ] Uses the `api()` helper function
- [ ] Handles connection errors (chkd not running)
- [ ] Checks `res.success` before accessing `res.data`
- [ ] Shows helpful error with hint when available

### 3. Output Formatting
- [ ] Uses 2-space indent for all output
- [ ] Starts with newline, ends with newline
- [ ] Uses consistent emoji indicators:
  - ✓ Success
  - ❌ Error
  - ⚠ Warning
  - · Informational note
  - ⏳ In progress/loading
  - 🔨 Working on something
  - 🚀 Started
  - 📁 Repository/file
  - 📋 List
  - 🐛 Bugs
- [ ] Uses separators (─────) for visual sections
- [ ] Shows "next steps" or hints when useful

### 4. Error Messages
- [ ] Shows what went wrong
- [ ] Shows hint for how to fix (if available from API)
- [ ] Shows suggestion for alternative action
- [ ] Doesn't expose internal errors to user

---

## Help Text Quality

Every command needs a help entry in `showCommandHelp()`:

### Structure
```
  chkd <command> [args] [--flags]
  ─────────────────────────────────────────────────────────────

  One-line description of what it does.

  ARGUMENTS:
    <arg>    Description (required/optional)

  OPTIONS:
    --flag   What the flag does (default: value)

  WHAT IT DOES:
    - Bullet point 1
    - Bullet point 2

  WHEN TO USE:
    - Use case 1
    - Use case 2

  EXAMPLES:
    chkd command "example 1"
    chkd command "example 2" --flag

  OUTPUT EXAMPLE:
    Show what output looks like

  NEXT STEPS:
    - What to do after running this command

  TIP: Helpful tip for getting the most out of this command.
```

### Required Sections
- [ ] Command signature with args and flags
- [ ] One-line description
- [ ] ARGUMENTS (if any)
- [ ] EXAMPLES (at least 2)
- [ ] WHEN TO USE (at least 2 use cases)

### Optional Sections (include when helpful)
- [ ] OPTIONS (if flags exist)
- [ ] WHAT IT DOES (for complex commands)
- [ ] OUTPUT EXAMPLE
- [ ] NEXT STEPS
- [ ] TIP
- [ ] SEE ALSO

---

## CLI.md Documentation Quality

Every command needs an entry in `docs/CLI.md`:

### Structure
```markdown
### `chkd command [args]`

One-line description.

```bash
chkd command "example"
```

**Options:**
- `--flag` - What it does

**What it does:**
- Point 1
- Point 2

**When to use:**
- Use case 1
- Use case 2
```

### Required Elements
- [ ] Command with signature
- [ ] One-line description
- [ ] Code example
- [ ] When to use section

---

## Main Function Integration

### Switch Statement
- [ ] Command added to switch in `main()`
- [ ] Passes correct arguments
- [ ] Handles flags properly

### Help Command
- [ ] Added to `help()` function's command list
- [ ] Grouped with related commands
- [ ] One-line description matches

---

## Testing Checklist

Before marking complete:

```bash
# 1. Basic functionality
chkd <command>                    # No args (should show usage or work)
chkd <command> "valid arg"        # Normal case
chkd <command> "invalid arg"      # Should show helpful error

# 2. Help
chkd help                         # Command should appear in list
chkd help <command>               # Should show detailed help

# 3. Edge cases
chkd <command> ""                 # Empty string
chkd <command> --unknown-flag     # Unknown flag
```

---

## Example: Creating a New Command

### 1. Add the function (after other similar commands)

```typescript
async function myCommand(arg: string) {
  if (!arg) {
    console.log(`\n  Usage: chkd mycommand "argument"\n`);
    return;
  }

  const cwd = process.cwd();
  const res = await api('/api/endpoint', {
    method: 'POST',
    body: JSON.stringify({ repoPath: cwd, value: arg }),
  });

  if (!res.success) {
    console.log(`\n  ❌ ${res.error}`);
    if (res.hint) {
      console.log(`  💡 ${res.hint}`);
    }
    console.log('');
    return;
  }

  console.log(`\n  ✓ ${res.data.message}\n`);
}
```

### 2. Add help text

```typescript
mycommand: `
  chkd mycommand "argument"
  ─────────────────────────────────────────────────────────────

  Description of what this command does.

  ARGUMENTS:
    "argument"    What the argument is for (required)

  WHEN TO USE:
    - Use case 1
    - Use case 2

  EXAMPLES:
    chkd mycommand "example 1"
    chkd mycommand "example 2"

  TIP: Helpful tip here.
`,
```

### 3. Add to switch statement

```typescript
case 'mycommand':
  await myCommand(arg);
  break;
```

### 4. Add to help() list

```typescript
  SECTION NAME

    mycommand "arg"     Description of command
```

### 5. Update CLI.md

Add documentation in the appropriate section.

---

## Anti-Patterns to Avoid

1. **Don't expose raw errors**
   ```typescript
   // Bad
   console.log(`Error: ${error}`);

   // Good
   console.log(`\n  ❌ ${res.error || 'Something went wrong'}\n`);
   ```

2. **Don't forget newlines**
   ```typescript
   // Bad - hard to read
   console.log(`Done`);

   // Good - properly spaced
   console.log(`\n  ✓ Done\n`);
   ```

3. **Don't skip validation**
   ```typescript
   // Bad
   const res = await api('/api/thing', { body: { value: arg } });

   // Good
   if (!arg) {
     console.log(`\n  Usage: chkd thing "value"\n`);
     return;
   }
   ```

4. **Don't forget hints**
   ```typescript
   // Bad
   console.log(`\n  ❌ Not found\n`);

   // Good
   console.log(`\n  ❌ Not found`);
   console.log(`  💡 Try 'chkd list' to see available items\n`);
   ```
