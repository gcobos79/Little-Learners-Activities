#!/usr/bin/env python3
"""Bundle index.html + css/ + js/ into one self-contained HTML file.

The single file is handy for opening the app straight from a computer or a USB
stick (double-click it in Chrome), the same way earlier versions were used.

Usage:  python3 tools/build_single_file.py [output.html]
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> None:
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "versions" / "little-learners-activities-v126.html"
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    def css(m: re.Match) -> str:
        return "<style>\n" + (ROOT / m.group(1)).read_text(encoding="utf-8") + "\n</style>"

    def js(m: re.Match) -> str:
        code = (ROOT / m.group(1)).read_text(encoding="utf-8")
        # A literal "</script" inside the code would end the tag early.
        code = code.replace("</script", "<\\/script")
        return "<script>\n/* " + m.group(1) + " */\n" + code + "\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="([^"?]+)(?:\?[^"]*)?">', css, html)
    html = re.sub(r'<script src="([^"?]+)(?:\?[^"]*)?"></script>', js, html)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"Wrote {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
