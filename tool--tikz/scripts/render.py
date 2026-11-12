#!/usr/bin/env python3
"""Render TikZ by launching this skill's MCP server over stdio."""

import argparse
import asyncio
import base64
import os
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
VENV_PYTHON = SKILL_DIR / "venv" / "bin" / "python"
SERVER = SKILL_DIR / "tikz_mcp_server.py"


def _server_env() -> dict[str, str]:
    env = os.environ.copy()
    home = env.get("HOME", str(Path.home()))
    tex_bins = [
        str(Path(home) / "Library" / "TinyTeX" / "bin" / "universal-darwin"),
        "/Library/TeX/texbin",
        "/opt/homebrew/bin",
        "/usr/local/bin",
    ]
    env["PATH"] = ":".join(tex_bins + [env.get("PATH", "/usr/bin:/bin")])
    env["HOME"] = home
    return env


async def render(tikz_code: str, out: Path) -> None:
    from mcp import ClientSession
    from mcp.client.stdio import StdioServerParameters, stdio_client

    params = StdioServerParameters(
        command=str(VENV_PYTHON),
        args=[str(SERVER)],
        env=_server_env(),
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool("render_tikz", {"tikz_code": tikz_code})
            wrote = False
            for block in result.content:
                text = getattr(block, "text", None)
                if text:
                    print(text)
                data = getattr(block, "data", None)
                if data:
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(base64.b64decode(data))
                    print(f"wrote {out} ({out.stat().st_size} bytes)")
                    wrote = True
            if not wrote:
                raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render TikZ to PNG via the skill MCP server.")
    parser.add_argument("--out", required=True, help="PNG path to write")
    parser.add_argument("--file", help="TikZ/LaTeX file. Omit to read stdin.")
    args = parser.parse_args()
    if not VENV_PYTHON.is_file() or not SERVER.is_file():
        print("tikz: run scripts/ensure.sh first", file=sys.stderr)
        raise SystemExit(1)
    code = Path(args.file).read_text(encoding="utf-8") if args.file else sys.stdin.read()
    if not code.strip():
        print("tikz: empty TikZ", file=sys.stderr)
        raise SystemExit(1)
    asyncio.run(render(code, Path(args.out).expanduser().resolve()))


if __name__ == "__main__":
    main()
