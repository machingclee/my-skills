#!/usr/bin/env python3

import asyncio
import subprocess
import tempfile
import base64
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.server.models import InitializationOptions
import mcp.server.stdio
import mcp.types as types
from mcp.server import NotificationOptions, Server

logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger(__name__)


class TikZMCPServer:
    def __init__(self):
        self.server = Server("tikz-renderer")
        self.server_name = "tikz-renderer"
        self.server_version = "0.1.0"
    
    def compile_tikz_to_image(self, tikz_code: str) -> str:
        try:
            subprocess.run(["xelatex", "--version"], check=True, capture_output=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            raise RuntimeError("xelatex not found. Please install TeX Live or MiKTeX.")
        
        try:
            subprocess.run(["convert", "--version"], check=True, capture_output=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            raise RuntimeError("ImageMagick convert not found. Please install ImageMagick.")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            tex_file = Path(temp_dir) / "diagram.tex"
            
            if '\\documentclass' in tikz_code:
                latex_content = tikz_code
            else:
                latex_content = f"""\\documentclass[border=2pt]{{standalone}}
\\usepackage{{xeCJK}}
\\usepackage{{fontspec}}
\\usepackage{{tikz}}
\\usepackage{{pgfplots}}
\\usepackage{{amsmath}}
\\usepackage{{amssymb}}
\\usepackage{{xcolor}}
\\usetikzlibrary{{shapes,arrows,positioning,calc,decorations.pathreplacing,patterns,fit,backgrounds,mindmap,trees,arrows.meta,angles,quotes}}
\\pgfplotsset{{compat=1.18}}

\\begin{{document}}
{tikz_code}
\\end{{document}}
"""
            
            tex_file.write_text(latex_content, encoding='utf-8')
            
            try:
                result = subprocess.run([
                    "xelatex", 
                    "-interaction=nonstopmode",
                    "-output-directory", temp_dir,
                    str(tex_file)
                ], check=True, capture_output=True, text=True, cwd=temp_dir)
            except subprocess.CalledProcessError as e:
                log_file = Path(temp_dir) / "diagram.log"
                error_details = ""
                if log_file.exists():
                    log_content = log_file.read_text(encoding='utf-8', errors='ignore')
                    lines = log_content.split('\n')
                    
                    error_section = False
                    error_lines = []
                    context_lines = []
                    
                    for i, line in enumerate(lines):
                        line_clean = line.strip()
                        
                        if any(keyword in line.lower() for keyword in ['! ', 'error:', 'undefined', 'missing']):
                            error_section = True
                            error_lines.append(line_clean)
                            for j in range(max(0, i-2), i):
                                if lines[j].strip() and lines[j].strip() not in context_lines:
                                    context_lines.append(lines[j].strip())
                            continue
                        
                        if error_section:
                            if line_clean:
                                if line.startswith('l.') or 'line' in line.lower():
                                    error_lines.append(line_clean)
                                elif any(char in line for char in ['^', '?']):
                                    error_lines.append(line_clean)
                                elif line_clean.startswith('\\') or '\\' in line_clean:
                                    error_lines.append(line_clean)
                                elif len(error_lines) < 10:
                                    error_lines.append(line_clean)
                            else:
                                if len(error_lines) > 0:
                                    break
                    
                    if context_lines or error_lines:
                        all_lines = context_lines + ['--- Error Details ---'] + error_lines
                        error_details = '\n'.join(all_lines[:20]) 
                    else:
                        last_lines = [line for line in lines[-50:] if line.strip()]
                        error_details = '\n'.join(last_lines[-15:])
                        
                    if not error_details:
                        error_details = e.stderr or "LaTeX compilation failed with unknown error"
                else:
                    error_details = e.stderr or "LaTeX compilation failed - no log file generated"
                    
                raise RuntimeError(f"LaTeX compilation failed:\n\n{error_details}")
            
            pdf_file = Path(temp_dir) / "diagram.pdf"
            if not pdf_file.exists():
                raise RuntimeError("PDF file was not generated")
            
            png_file = Path(temp_dir) / "diagram.png"
            try:
                subprocess.run([
                    "convert", 
                    "-density", "300",
                    "-quality", "90",
                    str(pdf_file),
                    str(png_file)
                ], check=True, capture_output=True)
            except subprocess.CalledProcessError as e:
                raise RuntimeError(f"Image conversion failed: {e}")
            
            if not png_file.exists():
                raise RuntimeError("PNG file was not generated")
            
            with open(png_file, "rb") as f:
                image_data = base64.b64encode(f.read()).decode('utf-8')
                return image_data
    
    def setup_handlers(self):
        
        @self.server.list_tools()
        async def handle_list_tools() -> List[types.Tool]:
            return [
                types.Tool(
                    name="render_tikz",
                    description="Render TikZ code to high-quality PNG image. Supports TikZ diagrams, mathematical plots, flowcharts, and technical illustrations.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "tikz_code": {
                                "type": "string",
                                "description": "TikZ/LaTeX code to render. Can include \\begin{tikzpicture}...\\end{tikzpicture} or full LaTeX document with \\documentclass."
                            }
                        },
                        "required": ["tikz_code"]
                    }
                )
            ]
        
        @self.server.call_tool()
        async def handle_call_tool(
            name: str, arguments: Optional[Dict[str, Any]] = None
        ) -> List[types.TextContent | types.ImageContent]:
            
            if arguments is None:
                arguments = {}
                
            
            if name == "render_tikz":
                tikz_code = arguments.get("tikz_code")
                
                if not tikz_code or not isinstance(tikz_code, str):
                    return [
                        types.TextContent(
                            type="text",
                            text="Error: Valid TikZ code is required"
                        )
                    ]
                
                try:
                    image_base64 = self.compile_tikz_to_image(tikz_code)
                    
                    return [
                        types.TextContent(
                            type="text",
                            text="TikZ diagram rendered successfully"
                        ),
                        types.ImageContent(
                            type="image",
                            data=image_base64,
                            mimeType="image/png"
                        )
                    ]
                    
                except Exception as e:
                    error_msg = str(e)
                    return [
                        types.TextContent(
                            type="text",
                            text=f"Compilation Error: {error_msg}"
                        )
                    ]
            
            else:
                return [
                    types.TextContent(
                        type="text",
                        text=f"Unknown tool: {name}. Available tools: render_tikz"
                    )
                ]


async def main():
    
    try:
        tikz_server = TikZMCPServer()
        tikz_server.setup_handlers()
        
        options = InitializationOptions(
            server_name=tikz_server.server_name,
            server_version=tikz_server.server_version,
            capabilities=tikz_server.server.get_capabilities(
                notification_options=NotificationOptions(),
                experimental_capabilities={}
            )
        )
        
        
        async with mcp.server.stdio.stdio_server() as streams:
            await tikz_server.server.run(
                streams[0], streams[1], options
            )
            
    except KeyboardInterrupt:
        pass
    except Exception as e:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())