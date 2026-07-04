---
name: tool--skills-add
description: >-
  Install an agent skill from a GitHub repository globally into Claude Code.
  Always lists available skills first for confirmation before installing.
  Use when the user asks to add, install, or pull a skill with npx skills add.
---

# Npx Skills Add

Install an agent skill from a GitHub repo globally into Claude Code. This skill always runs `--list` first so the user can confirm what they are getting before the actual install.

## When to Use

- The user says "add a skill", "install a skill", "pull a skill", or "npx skills add"
- The user provides a GitHub URL or `owner/repo` shorthand along with a skill name
- The user asks to install something from the vercel-labs/skills ecosystem

## Required Inputs

Two pieces of information are needed. Ask for whichever is missing:

1. **Source** — a GitHub URL, `owner/repo` shorthand, or local path pointing to a skills repository
2. **Skill name** — the specific skill to install (or `'*'` for all skills in the repo)

## Workflow

Follow these steps in order.

### Step 1: Collect the inputs

If the user already gave both the source and skill name, proceed to step 2. Otherwise ask for the missing piece:

- *"Which repo? Give me an owner/repo or a full GitHub URL."*
- *"Which skill do you want from that repo? Or say 'all' for everything."*

### Step 2: List available skills

Run `--list` so the user can see what the repository offers and confirm the skill exists:

```bash
npx skills add <source> --list
```

If the skill name the user wants is not in the list, warn them and ask if they want to pick a different one or proceed anyway.

### Step 3: Confirm

Show the user what will happen and ask for confirmation:

> "I'll run: `npx skills add <source> -g -a claude-code --skill <skill-name> -y`. This installs the skill globally for Claude Code with no prompts. Proceed?"

### Step 4: Install

Run the install command:

```bash
npx skills add <source> -g -a claude-code --skill <skill-name> -y
```

Flag summary:
| Flag | Meaning |
|---|---|
| `-g` | Install globally into `~/.claude/skills/` (available across all projects) |
| `-a claude-code` | Target Claude Code as the agent |
| `--skill <name>` | Install only this specific skill |
| `-y` | Skip confirmation prompts |

### Step 5: Verify

List the installed skills to confirm it landed:

```bash
npx skills ls -g
```

If the new skill appears in the list, confirm success and remind the user to restart their Claude Code session so it picks up the new skill directory.

### If the user wants to install to all agents

Replace `-a claude-code` with `--agent '*'`:

```bash
npx skills add <source> -g --agent '*' --skill <skill-name> -y
```

### If the user wants project scope

Drop the `-g` flag. The skill will install into `./.claude/skills/` in the current project instead.
2026-06-29-01-44-03.png