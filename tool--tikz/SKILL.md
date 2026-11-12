---
name: tool--tikz
description: >-
  Install and use the TikZ MCP server, then draw a PNG from a picture
  description. Use when the user says "draw by tikz", asks for a TikZ figure,
  or needs a geometry, flowchart, or math diagram rendered to an image.
---

# TikZ MCP

Draw a picture by compiling TikZ through the server in this skill. A phrase such as "draw by tikz a tilted rectangle with four supporting points" means: install anything missing, write the TikZ, render the PNG, and look at the PNG.

The server, the installer, and the renderer all live here:

| File | Role |
| --- | --- |
| `tikz_mcp_server.py` | MCP server. Tool name is `render_tikz`. It calls `xelatex`, then ImageMagick `convert`. |
| `scripts/ensure.sh` | Installs Python 3.10+, ImageMagick, Ghostscript, and TeX when any of them is missing, then registers `tikz-renderer` in `~/.cursor/mcp.json`. |
| `scripts/render.py` | Launches that same server over stdio and writes a PNG. |
| `requirements.txt` | Pins `mcp==1.30.0`. Newer `mcp` removes `list_tools` and the server will not start. |

## Install

Run this before the first draw in a session, and again whenever a render says a tool or a `.sty` file is missing:

```bash
bash ~/.claude/skills/tool--tikz/scripts/ensure.sh
```

The script is safe to repeat. It only installs what is absent.

Every use of this skill runs `ensure.sh`, including a draw that `render.py` could already finish. The script writes `tikz-renderer` into `~/.cursor/mcp.json` when that entry is missing, and rewrites it when it does not point at this skill's `tikz_mcp_server.py`. A Cursor reload is what makes `render_tikz` appear in the current chat.

TeX order: use `xelatex` if it is already on `PATH`, in TinyTeX, or in `/Library/TeX/texbin`. Otherwise try `brew install --cask basictex`. If BasicTeX cannot finish (it asks for an admin password), install TinyTeX under `~/Library/TinyTeX`. Then `tlmgr` installs `standalone`, `pgf`, `pgfplots`, `xcolor`, `amsmath`, `amsfonts`, `tools`, `xetex`, `fontspec`, and `xeCJK` when `kpsewhich` cannot see them.

`convert` reads PDFs through Ghostscript (`gs`). Install Ghostscript when `gs` is missing. Do not rewrite the server to call `magick`.

## Draw

1. Run `ensure.sh`. This adds the `tikz-renderer` MCP server for whoever is using the skill.
2. Turn the request into TikZ. A fragment is enough. The server wraps a fragment in a standalone `xelatex` document that already loads `tikz`, `pgfplots`, `amsmath`, `amssymb`, and `xeCJK`. Pass a full document only when the fragment wrapper is wrong; a full document must contain `\documentclass` or the server wraps it again.
3. Render:

```bash
~/.claude/skills/tool--tikz/venv/bin/python \
  ~/.claude/skills/tool--tikz/scripts/render.py \
  --out /absolute/path/out.png <<'EOF'
\begin{tikzpicture}[line cap=round, line join=round]
  \draw (0,0) -- (1,1);
\end{tikzpicture}
EOF
```

4. Read the PNG. If a label overlaps a line, or the picture is not what was asked, change the TikZ and render again. Do not stop on the first image.
5. Say the PNG path. When the picture belongs in the blog, write it to `public/assets/img/YYYY-MM-DD-HH-MM-SS.png` and reference it as `/assets/img/YYYY-MM-DD-HH-MM-SS.png`.
6. Whenever that PNG is inserted into a markdown file, put the exact TikZ that was compiled into an HTML comment immediately after the image. The comment is not rendered. Do not put the TikZ in a fenced code block, a blockquote, or any other visible block.

```markdown
![caption](/assets/img/example.png)

<!-- tikz
\begin{tikzpicture}[line cap=round, line join=round]
  \draw (0,0) -- (1,1);
\end{tikzpicture}
-->
```

The line `<!-- tikz` is only the marker. Every line after it, until `-->`, is the exact fragment passed to the renderer. Do not rewrap it, do not add `\documentclass`, and do not drop a line.

Inside a `>>` block, prefix every line of that comment with `>> `, including `<!-- tikz` and `-->`, so the block stays one block. The TikZ itself is those lines with one leading `>> ` removed.

To adjust a picture, paste that comment back. Drop the marker and the closing `-->`, strip one leading `>> ` from each line when it is there, edit the TikZ, render again, and replace the comment with the new exact source.

If this session already has the `tikz-renderer` tool `render_tikz`, that tool and `render.py` are the same server. Use `render.py` when the tool is not connected. A Cursor reload picks up `mcp.json` after `ensure.sh` changes it.

## TikZ habits

- Put math in nodes as `$p_a$`, not as plain `pa`.
- Draw arrows outside the shape they describe. A label that sits on an edge is a failed picture.
- One figure, one claim. Do not add a second panel the request did not ask for.
- Keep the fragment free of `\documentclass`, `\usepackage`, and `\begin{document}`.
