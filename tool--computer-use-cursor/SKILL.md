---
name: tool--computer-use-cursor
description: >-
  Start the Cursor computer-use worker named my-mac on this Mac so a cloud
  agent can see and click the signed-in desktop. Use when the user asks to
  start computer use, launch the my-mac worker, or start a computer-use
  agent. Always use ~/.local/bin/cursor-agent, never the `agent` command
  (that is the Grok CLI). If authentication is required, tell the user to
  run ~/.local/bin/cursor-agent login, never `agent login`. After the
  worker launch command finishes, open https://cursor.com/agents in the
  browser.
---

# Cursor computer-use worker

When the user asks to launch this worker, run this command:

```bash
~/.local/bin/cursor-agent worker --computer-use --name "my-mac" start
```

Run it in the background and leave it running after the turn ends.

`~/.grok/bin` is ahead of `~/.local/bin` on PATH. `agent` is Grok (`grok 1.0.77`), not Cursor. Always use `~/.local/bin/cursor-agent`.

The worker error says `agent login` because Cursor's usual command name is `agent`. On this Mac that name is Grok, so `agent login` logs into Grok and does not authenticate the worker. If the launch output says authentication is required, tell the user to run this themselves:

```bash
~/.local/bin/cursor-agent login
```

Do not check whether a worker is already running. Do not edit files, rebuild, or click the menu bar. Report the command output.

When you are done launching the worker, launch the browser at https://cursor.com/agents:

```bash
open "https://cursor.com/agents"
```
