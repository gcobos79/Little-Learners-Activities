#!/usr/bin/env python3
"""Give every published version a build number, so browsers never keep showing an old copy.

- index.html: adds ?v=<build> to the stylesheet and every script (a new name = a fresh download).
- js/config.js: LL.config.build = '<build>' (the version the page is running).
- version.json: {"build": "<build>"} (the newest version on the server; the app checks it and
  reloads itself when it differs, at a safe moment).

Run it before each commit:  python3 tools/stamp_version.py
"""
import json, pathlib, re, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
build = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")

idx = ROOT / "index.html"
html = idx.read_text(encoding="utf-8")
html = re.sub(r'(<link rel="stylesheet" href="css/[^"?]+)(?:\?v=[^"]*)?(">)', rf'\g<1>?v={build}\2', html)
html = re.sub(r'(<script src="js/[^"?]+)(?:\?v=[^"]*)?("></script>)', rf'\g<1>?v={build}\2', html)
idx.write_text(html, encoding="utf-8")

cfg = ROOT / "js" / "config.js"
c = cfg.read_text(encoding="utf-8")
if re.search(r"^\s*build: '[^']*',", c, re.M):
    c = re.sub(r"^(\s*)build: '[^']*',", rf"\g<1>build: '{build}',", c, flags=re.M)
else:
    c = c.replace("  version: ", f"  // Set by tools/stamp_version.py on every publish.\n  build: '{build}',\n  version: ", 1)
cfg.write_text(c, encoding="utf-8")

(ROOT / "version.json").write_text(json.dumps({"build": build}) + "\n", encoding="utf-8")
print("build", build)
