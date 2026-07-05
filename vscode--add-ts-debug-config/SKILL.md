---
name: vscode--add-ts-debug-config
description: >-
  Add a VS Code launch.json configuration that lets you debug any TypeScript
  file by pressing F5. Uses `node` with `--import tsx` as the runtime so `.ts`
  files run directly with zero build step. Creates `.vscode/launch.json` if it
  doesn't exist, or adds the configuration to an existing one. Use when the user
  wants to debug TypeScript in VS Code, set up F5 for .ts files, add a tsx
  launch config, or configure VS Code debugging for a Node/TypeScript project.
---

# VS Code TypeScript Debug Config (tsx)

Adds a VS Code `launch.json` configuration that debugs the currently open `.ts`
file via `tsx`. Press F5 on any TypeScript file and the debugger attaches with
breakpoints, step-through, and variable inspection — no build step.

## What it does

- Creates `.vscode/launch.json` if it doesn't exist
- Adds a `"Debug tsx (current file)"` configuration if one isn't already present
- Uses `node` with `--import tsx` runtime arg to transpile TypeScript on the fly
- `${file}` means the config debugs whatever `.ts` file is focused in the editor

## The configuration

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug tsx (current file)",
      "type": "node",
      "request": "launch",
      "program": "${file}",
      "runtimeArgs": ["--import", "tsx"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "env": {
        // Add environment variables needed at runtime, e.g.:
        // "PORT": "3000",
        // "DATABASE_URL": "postgresql://localhost:5432/mydb"
      },
      "skipFiles": ["<node_internals>/**", "node_modules/**"]
    }
  ]
}
```

## Prerequisites

The project must have `tsx` installed (dev dependency):

```bash
npm install --save-dev tsx
```

## How to apply

1. Check if `.vscode/launch.json` already exists.
2. If it exists and already has a tsx config, do nothing.
3. If it exists but has no tsx config, merge the configuration into the
   `configurations` array.
4. If `.vscode/launch.json` doesn't exist, create `.vscode/` and write the full
   file.
5. If the project doesn't have `tsx` installed, install it as a dev dependency
   first.
