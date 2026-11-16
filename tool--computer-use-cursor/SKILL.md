---
name: tool--computer-use-cursor
description: >-
  Start the Cursor computer-use worker named my-mac on this Mac so a cloud
  agent can see and click the signed-in desktop. Use when the user asks to
  start computer use, launch the my-mac worker, or start a computer-use
  agent. Always use ~/.local/bin/cursor-agent, never the `agent` command
  (that is the Grok CLI).
---

# Cursor computer-use worker

When the user asks to launch this worker, run this command and nothing else:

```bash
~/.local/bin/cursor-agent worker --computer-use --name "my-mac" start
```

Run it in the background and leave it running after the turn ends.

`~/.grok/bin` is ahead of `~/.local/bin` on PATH. `agent` is Grok, not Cursor. Always use the path above.

Do not check whether a worker is already running. Do not stop to ask for login. Do not edit files, rebuild, or click the menu bar. Report the command output.
