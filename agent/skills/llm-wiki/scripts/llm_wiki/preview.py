"""Produce a standalone, escaped local view of a curated Wiki page."""

from html import escape
from pathlib import Path, PurePosixPath

from . import graph
from .health import read_document


def render(root: Path, path: str) -> str:
    relative = PurePosixPath(path)
    if (
        len(relative.parts) < 2
        or relative.parts[0] != "wiki"
        or relative.suffix != ".md"
    ):
        raise ValueError("Preview requires one curated Markdown page under wiki/")
    page = read_document(root, relative.as_posix(), start=1, end=200)
    links = graph.inspect(root, node=f"file:{relative.as_posix()}", hops=2)
    rows = "".join(
        f"<tr><td>{escape(edge['src'])}</td><td>{escape(edge['kind'])}</td>"
        f"<td>{escape(edge['dst'])}</td><td>{escape(edge['source_path'])}:{edge['source_line']}</td></tr>"
        for edge in links["edges"]
        if edge["kind"] in {"links", "source"}
    )
    lines = "".join(
        f'<span id="L{number}"><a href="#L{number}">{number}</a> {escape(line)}</span>\n'
        for number, line in enumerate(page["text"].splitlines(), 1)
    )
    name = escape(relative.as_posix())
    range_label = f"{page['end_line']} / {page['total_lines']} lines"
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'">
<title>LLM Wiki · {name}</title><style>
body {{ font: 16px system-ui; margin: 2rem; color-scheme: light dark; }}
pre {{ white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }}
pre a {{ text-decoration: none; }} :target {{ background: Highlight; color: HighlightText; }}
table {{ border-collapse: collapse; }} th, td {{ border: 1px solid GrayText; padding: .4rem; text-align: left; }}
</style></head><body><h1>{name}</h1><p>{range_label}</p><pre>{lines}</pre>
<h2>Links and source provenance</h2><table><thead><tr><th>From</th><th>Kind</th><th>To</th><th>Evidence</th></tr>
</thead><tbody>{rows}</tbody></table></body></html>"""
