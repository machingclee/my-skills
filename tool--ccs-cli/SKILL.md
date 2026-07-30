---
name: tool--ccs-cli
description: >-
  Maintain and extend the user's personal `ccs` (CC Switch CLI) and related
  `gm` (Grok Monitor) tools under ~/.local/bin. Use when the user asks to
  modify ccs, change the ccs menu, add options to ccs, update the CC Switch
  terminal picker, alter provider switching, wire new tools into ccs, or
  change gm/grok-usage quota CLI behavior.
---

# CCS CLI Maintenance

This skill is the durable record for the user's personal terminal tools:

| Tool | Path | Role |
| --- | --- | --- |
| `ccs` | `~/.local/bin/ccs` | Interactive + scripted Claude provider switcher for CC Switch, plus tool actions |
| `gm` | `~/.local/bin/gm` | Grok weekly/monthly quota without TUI |
| `ds` | `~/.local/bin/ds` | DeepSeek prepaid API balance |
| `grok-usage` | `~/.local/bin/grok-usage` | Thin shim that execs `gm` |

Always edit the live files under `~/.local/bin/`. Do not recreate them from scratch unless the user asks for a rewrite.

## When to Use

Invoke this skill when the user says anything like:

- "change ccs", "modify ccs", "update ccs"
- "add another option to ccs menu"
- "ccs should also …"
- "wire X into ccs"
- "change how provider switch works"
- "update gm / grok monitor / weekly quota CLI"
- "CC Switch CLI" / "provider picker CLI"

If the user only wants to *use* `ccs` or `gm`, do not load this skill; just run the command or explain usage.

## Required Workflow for Any Modification

Follow these steps every time:

### 1. Read the current tools

```bash
Read ~/.local/bin/ccs
# if quota behavior is involved:
Read ~/.local/bin/gm
```

Do not rely only on this skill text. The files are source of truth; this skill is the map.

### 2. Confirm the requested change

Restate the change briefly (menu item, switch behavior, new subcommand, UX). If ambiguous between:

- **menu action** (run a tool, no provider switch), vs
- **provider switch** (write Claude settings), vs
- **new subcommand** (`ccs something`),

ask one short clarifying question.

### 3. Implement in place

Edit `~/.local/bin/ccs` and/or `~/.local/bin/gm` with the smallest coherent change. Keep progressive enhancement and non-TTY safety (see below).

### 4. Smoke-test

At minimum:

```bash
ccs help
ccs list
ccs status
# if menu/actions changed:
printf 'N\n' | ccs pick    # numbered path; N = new item index if applicable
# if provider switch changed:
ccs status
# if gm related:
ccs gm
# or:
gm weekly
```

Restore the user's preferred provider if a test switch moved them away (usually `ccs grok`).

### 5. Report

Tell the user:

- what changed
- exact commands to try
- whether Claude Code must be restarted (yes for provider switches)

## Current Architecture (`ccs`)

### Purpose

CC Switch GUI stores Claude providers in SQLite and applies them by writing `~/.claude/settings.json`. Official CC Switch has no stable shell CLI for switch. `ccs` reimplements the apply step and adds an interactive menu.

### Data sources

| Path | Use |
| --- | --- |
| `~/.cc-switch/cc-switch.db` | providers table (`app_type='claude'`), `settings.common_config_claude` |
| `~/.cc-switch/settings.json` | `currentProviderClaude` id |
| `~/.claude/settings.json` | live Claude Code user settings (written on switch) |
| `~/.cc-switch/backups/claude_settings_*.json` | pre-switch backups |

### Apply algorithm (must preserve)

1. Load `common_config_claude` JSON from DB `settings` table
2. Load provider `settings_config` JSON
3. Deep-merge (especially `env` key-wise merge)
4. Backup existing `~/.claude/settings.json`
5. Atomic write merged JSON to `~/.claude/settings.json`
6. Set `providers.is_current` for that Claude provider
7. Set `currentProviderClaude` in CC Switch settings.json

Never clobber common hooks/plugins when switching providers. Always merge.

### Command surface (keep stable unless user asks otherwise)

| Invocation | Behavior |
| --- | --- |
| `ccs` | TTY: interactive menu; non-TTY: list |
| `ccs list` / `ccs ls` | list providers + tools hint |
| `ccs status` / `current` / `show` | active provider + key env |
| `ccs pick` / `menu` / `ui` / `select` | force interactive menu |
| `ccs gm` [args…] | run `gm` (passthrough args) |
| `ccs ds` [args…] | run `ds` (DeepSeek balance) |
| `ccs grok-launch` | start preferred proxy in a new Terminal (skips if already up) |
| `ccs proxy` | show which claude-code-proxy is running (patched vs homebrew) |
| `ccs proxy switch` | interactive pick + restart patched/homebrew |
| `ccs proxy patched` / `ccs proxy homebrew` | restart with that binary; saves preference |
| `ccs proxy stop` | stop listener on :18765 |
| `ccs <name\|id>` | direct provider switch (substring / id prefix) |
| `ccs help` | help |

### Interactive menu model

Menu is built by `build_menu(providers)`:

1. One entry per Claude provider (`kind: "provider"`)
2. Tool actions after providers (`kind: "action"`)

Current tool actions:

- id `action:gm` — label `Grok Monitor (gm)` — runs `gm`
- id `action:ds` — label `DeepSeek balance (ds)` — runs `ds`
- id `action:grok-launch` — label `Grok Launch` — opens a new Terminal window running `grok login` then preferred proxy `serve` (preference from `~/.config/ccs/proxy_flavor`, default patched); skips if already listening on port 18765 and prints which binary is up
- id `action:proxy` — label `Proxy binary` — show/switch patched (`~/.grok/bin`) vs Homebrew stock; restarts listener on :18765

Display marks:

- `*` current provider
- `·` tool action

Picker ladder (progressive enhancement):

1. **fzf** if on PATH and TTY
2. **curses** arrow UI if TTY
3. **numbered** menu fallback
4. Bare `ccs` without TTY → list only (do not hang)

Important UX rule: if fzf is present and the user cancels (Esc), do not open a second menu. Return cancel.

### Key functions (orientation)

| Function | Role |
| --- | --- |
| `list_providers` | read SQLite Claude providers |
| `build_menu` | providers + actions |
| `resolve_provider` | name/id matching for direct mode |
| `deep_merge` / `apply_provider` | safe settings write |
| `cmd_switch_provider` | user-facing switch + tips |
| `cmd_run_gm` / `find_gm` | locate and exec gm |
| `run_menu_item` | dispatch provider vs action |
| `pick_with_fzf` / `pick_with_curses` / `pick_with_numbers` | UIs |
| `interactive_pick` / `cmd_interactive` | orchestration |
| `main` | argv dispatch |

## Current Architecture (`gm`)

### Purpose

Print Grok subscription weekly/monthly usage without opening Grok TUI or website.

### Endpoints

- Weekly: `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits`
- Monthly: `GET https://cli-chat-proxy.grok.com/v1/billing`

### Auth token sources (order)

1. `~/.grok/auth.json` (official Grok CLI / `grok login`) — field `key` on each issuer entry
2. Fallback: `~/.config/claude-code-proxy/grok/auth.json` — field `access`

### Commands

```text
gm
gm weekly
gm monthly
gm json
gm help
```

Headers should keep Grok client identity (`x-grok-client-identifier: xai-grok-cli`, etc.).

## Current Architecture (`ds`)

### Purpose

Print DeepSeek prepaid API balance (not weekly % — pay-as-you-go credits).

### Endpoint

- `GET https://api.deepseek.com/user/balance`

### Auth key sources (order)

1. `DEEPSEEK_API_KEY` / `DEEPSEEK_TOKEN` env
2. CC Switch Claude provider whose name/base contains `deepseek` (`ANTHROPIC_AUTH_TOKEN` etc.)
3. `~/.claude/settings.json` when base URL is DeepSeek

### Commands

```text
ds
ds json
ds help
ccs ds
```

## How to Apply Common Modifications

### A. Add a new interactive menu action (most common)

Example: "add option to open proxy logs" or "add option to run X".

1. Add a constant near `ACTION_GM`, e.g. `ACTION_FOO = "action:foo"`
2. Append an entry in `build_menu()`:

```python
menu.append({
    "kind": "action",
    "id": ACTION_FOO,
    "name": "Human Label",
    "is_current": False,
    "detail": "short description  ·  what it runs",
    "provider": None,
    "action": "foo",
})
```

3. Implement `cmd_run_foo()` (or inline safe subprocess)
4. Extend `run_menu_item()` to handle `action == "foo"`
5. Optionally add direct argv in `main()`: `ccs foo`
6. Update `usage()`, `cmd_list()` Tools section, and this skill's menu list if the action becomes permanent

Actions must not pretend to be providers. Do not write Claude settings unless the user explicitly wants a provider-like profile.

### B. Change provider switch behavior

Edit `apply_provider` / `deep_merge` / post-switch tips carefully.

After any apply-path change, test:

```bash
ccs deepseek
# verify ~/.claude/settings.json env
ccs grok
# verify restored + common keys like CLAUDE_CODE_EFFORT_LEVEL still present
```

### C. Add or change direct subcommands

Extend `main()` dispatch. Prefer bare words (`ccs gm`, `ccs list`) over dashed flags to match user preference.

### D. Change picker UX only

Touch only `pick_with_*`, `format_menu_line`, `interactive_pick`. Keep item model stable (`kind`, `id`, `name`, `detail`, …).

### E. Change Grok quota display or sources

Edit `~/.local/bin/gm`. Keep `ccs gm` working via `find_gm()` (PATH or `~/.local/bin/gm`).

### F. Support another CC Switch app type (Codex, etc.)

Today `APP_TYPE = "claude"` is fixed. If extending:

- parameterize app type
- default remains Claude
- do not break bare `ccs` Claude workflow

## Hard Constraints

1. **Do not hang non-TTY** bare `ccs` — list and exit.
2. **Do not drop common Claude config** on switch — merge.
3. **Backup before writing** `~/.claude/settings.json`.
4. **Atomic writes** (temp file + replace).
5. **Never print full secrets** in status output (mask tokens).
6. **Remind restart** after provider switch.
7. **Keep direct mode** (`ccs grok`) working forever.
8. Prefer **stdlib + optional fzf**; avoid new heavy dependencies unless user asks.
9. User prefers **no dashed flags** in the happy path (`ccs gm weekly`, not only `--weekly`).
10. After editing, leave tools executable: `chmod +x ~/.local/bin/ccs ~/.local/bin/gm`

## Related Context (do not invent)

User's typical stack:

- Claude Code with `ANTHROPIC_BASE_URL` often pointing at `http://127.0.0.1:18765` (claude-code-proxy)
- CC Switch app at `/Applications/CC Switch.app`
- Providers commonly include Grok (local proxy) and DeepSeek
- Grok quota via `gm` / Grok Build `/usage` / grok.com Settings

Blog notes (optional reading, not required for edits):

- `.../src/mds/articles/tech/552-claude-code-proxy-grok-usage-monitor.md`
- `.../src/mds/articles/tech/553-interactive-cli-picker-progressive-enhancement.md`

## User Modification Template

When the user invokes this skill with a change request, interpret messages in this shape:

```text
/tool--ccs-cli
Desired change:
- ...
Acceptance:
- ...
```

If they only write free-form text after loading the skill, treat that text as the desired modification and follow the workflow above.

## Quick Usage Reminder (for the user)

```bash
ccs                 # menu: providers + Grok Monitor + Grok Launch + Proxy binary
ccs list
ccs status          # includes which proxy binary is running
ccs grok
ccs deepseek
ccs gm
ccs gm weekly
ccs ds
ds
ccs grok-launch     # start preferred proxy in new terminal (skips if running)
ccs proxy           # show patched vs homebrew (path, pid, version)
ccs proxy switch    # pick and restart
ccs proxy patched   # restart with ~/.grok/bin (recommended for Grok)
ccs proxy homebrew  # restart with stock brew (120s timeout warning)
gm weekly           # same quota tool directly
```

## After You Change Behavior Permanently

If a modification becomes part of the long-term design (new permanent menu action, new subcommand family, multi-app support), update **this** `SKILL.md` in the same PR/edit so the next session still has an accurate map. Do not leave the skill stale.
