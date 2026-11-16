---
name: tool--computer-use-cursor
description: >-
  Start the Cursor computer-use worker named my-mac on this Mac so a cloud
  agent can see and click the signed-in desktop. Use when the user asks to
  start computer use, launch the my-mac worker, or have a cloud agent check
  the menu bar or tray. Always use ~/.local/bin/cursor-agent, never the `agent`
  command (that is the Grok CLI).
---

# Cursor computer-use worker

Start the long-lived worker that lets a Cursor cloud agent drive this Mac's signed-in desktop. This chat cannot see the menu bar. Do not send the check yourself.

Do not edit the tray app, do not rebuild it, and do not click the menu bar.

## Command

`~/.grok/bin` is ahead of `~/.local/bin` on PATH. `agent` is Grok (`grok 1.0.77`), not Cursor.

Always invoke Cursor by this path:

```bash
~/.local/bin/cursor-agent
```

Worker command (flags before `start`):

```bash
~/.local/bin/cursor-agent worker --computer-use --name "my-mac" start
```

## Workflow

1. If a worker named `my-mac` is already running, leave it running and tell the user.
2. Otherwise start the command above in the background and keep it running after the turn ends.
3. If it asks for login, stop and tell the user to run `cursor-agent login` themselves.
4. On the first start, macOS installs **Cursor Computer Use** (`~/.cursor/cursor-computer-use/Cursor Computer Use.app`). Tell the user to enable **Accessibility** and **Screen Recording** for **Cursor Computer Use** in System Settings → Privacy & Security. Those permissions are for that helper app. Permissions already granted to Cursor or Terminal do not apply. If macOS says to restart the app, stop the worker and start the same command again.
5. When the process is connected, stop. Tell the user to open https://cursor.com/agents, choose **my-mac** under My Machines, and paste the check prompt below.

The worker runs as the logged-in user. `--computer-use` adds pointer, keyboard, and screenshots. It does not grant admin rights.

## Check prompt

Give the user this prompt to paste on cursor.com/agents after **my-mac** is selected. If they named a different check, replace the body with that check and keep the "do not edit" rule.

```text
Check the macOS menu bar. Do not edit files, do not rebuild, and do not change settings.

The app is "Claude-Code-Proxy Token Monitor Tray". It is already running. Its menu-bar icon is a wide template image, not a Dock icon.

1. Screenshot the menu bar.
2. Find that tray icon.
3. Confirm it has exactly two columns:
   - Grok: account name, then a weekly percent and days, like "58% / 1.75d"
   - DeepSeek: a balance, or "—" if no balance is loaded
4. Confirm there is no OpenCode column and no third quota.
5. Click the icon. Screenshot the panel. Confirm the subtitle is "Grok · DeepSeek · local proxy" and the only sections are Grok and DeepSeek.
6. Close the panel.

Reply with what you saw. Attach both screenshots. If the icon is missing, the panel differs, or computer use cannot capture the screen, say exactly what failed.
```
