"""slop - a prose linter with pluggable rule sets."""
from __future__ import annotations

import argparse
import bisect
import json
import os
import sys
import urllib.request
from pathlib import Path

from .config import (CONFIG_NAME, find_config, load_config, merge_config,
                     resolve_rules)
from .engine import analyze, count_words, sentence_bounds
from .extract import (extract_html, extract_markdown, extractor_for,
                      to_source)

EXTS = {".md", ".markdown", ".mdown", ".mdx", ".html", ".htm",
        ".xhtml", ".txt", ".text", ".rst"}


def is_url(s: str) -> bool:
    return s.startswith(("http://", "https://"))


def read_source(target: str):
    """A URL is just a file we do not have yet: fetch it, then treat it as HTML."""
    if target == "-":
        return "<stdin>", sys.stdin.read(), "md"
    if is_url(target):
        req = urllib.request.Request(target, headers={
            "accept": "text/html,text/plain",
            "user-agent": "slop",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            ctype = resp.headers.get("content-type", "")
            charset = resp.headers.get_content_charset() or "utf-8"
            body = resp.read().decode(charset, errors="replace")
        kind = "md" if "markdown" in ctype else "html"
        return target, body, kind
    return target, Path(target).read_text(encoding="utf-8", errors="replace"), None


def line_index(src: str) -> list[int]:
    starts = [0]
    for i, ch in enumerate(src):
        if ch == "\n":
            starts.append(i + 1)
    return starts


def line_col(starts: list[int], off: int) -> tuple[int, int]:
    i = bisect.bisect_right(starts, off) - 1
    return i + 1, off - starts[i] + 1


def one_line(s: str, n: int = 100) -> str:
    c = " ".join(s.split())
    return c if len(c) <= n else c[:n - 1] + "…"


def lint_source(name, src, kind, rules, opts) -> dict:
    if src.startswith("﻿"):
        src = src[1:]
    extract = (extract_html if kind == "html" else
               extract_markdown if kind == "md" else extractor_for(name))
    text, runs = extract(src, indent_code=opts["indent_code"], skip_tables=opts["skip_tables"])
    starts = line_index(src)
    findings = []
    for m in analyze(text, rules):
        line, col = line_col(starts, to_source(runs, m.start))
        eline, ecol = line_col(starts, to_source(runs, m.end))
        ss, se = sentence_bounds(text, m.start, m.end)
        r = m.rule
        findings.append({
            "file": name, "line": line, "col": col, "endLine": eline, "endCol": ecol,
            "rule": r.id, "set": r.set, "severity": r.severity, "name": r.name,
            "why": r.description, "suggest": r.suggest or None, "count": m.count,
            "match": text[m.start:m.end], "sentence": text[ss:se],
        })
    return {"file": name, "words": count_words(text), "findings": findings}


def walk(root: str, exclude) -> list[str]:
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d != "node_modules"]
        for f in sorted(filenames):
            p = os.path.join(dirpath, f)
            if Path(f).suffix.lower() in EXTS and not any(x in p for x in exclude):
                out.append(p)
    return sorted(out)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="slop", description="Prose linting with pluggable rule sets.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""examples:
  slop README.md docs/ -r
  slop https://example.com/post
  slop --format json . | jq '.files[].findings[]'
  slop list
  slop explain note-that
  slop test-rules rules/house-style.json

Rule selection takes a set name ("llm-cliches") or a single rule id
("colon-triple"). Config is read from the nearest {CONFIG_NAME}, or from
[tool.slop] in a pyproject.toml passed with --config.""")
    p.add_argument("args", nargs="*",
                   metavar="TARGET",
                   help="a subcommand (check, list, explain, test-rules), "
                        "(fudge is an alias for test-rules), "
                        "or files, directories and URLs to lint")
    p.add_argument("--select", action="append", default=[], metavar="IDS")
    p.add_argument("--ignore", action="append", default=[], metavar="IDS")
    p.add_argument("--rules", action="append", default=[], metavar="FILE",
                   help="extra rule set JSON (repeatable)")
    p.add_argument("--all", action="store_true", help='include rules marked "default": "off"')
    p.add_argument("--format", default="human", choices=["human", "json", "tsv", "github"])
    p.add_argument("--no-context", dest="context", action="store_false")
    p.add_argument("--no-suggest", dest="suggest", action="store_false")
    p.add_argument("-q", "--quiet", action="store_true")
    p.add_argument("--max", type=int, default=None)
    p.add_argument("--max-per-1000", type=float, default=None)
    p.add_argument("--exit-zero", action="store_true")
    p.add_argument("-r", "--recursive", action="store_true")
    p.add_argument("--exclude", action="append", default=[], metavar="SUBSTR")
    p.add_argument("--no-indent-code", dest="indent_code", action="store_false")
    p.add_argument("--skip-tables", action="store_true")
    p.add_argument("--config", default=None)
    p.add_argument("--no-config", action="store_true")
    return p


def split_ids(values) -> list[str]:
    out = []
    for v in values:
        out.extend(x for x in v.replace(",", " ").split() if x)
    return out


def main(argv=None) -> int:
    # argparse cannot interleave optionals with a nargs="*" positional, so
    # `check -r .` loses the ".". Collect the strays ourselves.
    opts, extra = build_parser().parse_known_args(argv)
    bad = [e for e in extra if e.startswith("-") and e != "-"]
    if bad:
        print(f"slop: unrecognized arguments: {' '.join(bad)}", file=sys.stderr)
        return 2
    opts.args = list(opts.args) + [e for e in extra if not (e.startswith("-") and e != "-")]
    # The subcommand is optional and may appear after flags, so pull it off the
    # positional list rather than declaring it with `choices` -- otherwise
    # argparse rejects the first filename.
    opts.command = "check"
    if opts.args and opts.args[0] in ("check", "list", "explain", "test-rules", "fudge"):
        opts.command = opts.args.pop(0)

    cfg_path = None if opts.no_config else (opts.config or find_config())
    try:
        cfg = merge_config(load_config(cfg_path), {
            "select": split_ids(opts.select), "ignore": split_ids(opts.ignore),
            "rule_sets": opts.rules, "all_rules": opts.all, "exclude": opts.exclude,
            "max": opts.max, "max_per_1000": opts.max_per_1000,
            "skip_tables": opts.skip_tables, "indent_code": opts.indent_code,
        })
        rules, sets, every = resolve_rules(
            select=cfg["select"], ignore=cfg["ignore"],
            rule_sets=cfg["rule_sets"], all_rules=cfg["all_rules"])
    except ValueError as exc:
        print(f"slop: {exc}", file=sys.stderr)
        return 2

    if opts.command == "list":
        active = {r.id for r in rules}
        for s in sets:
            print(f"\n{s.name} - {s.title}")
            for r in s.rules:
                print(f"  {'on ' if r.id in active else 'off'} {r.id:22} {r.name}")
        print(f"\n{len(rules)} of {len(every)} rules active")
        return 0

    if opts.command == "explain":
        if not opts.args:
            print("slop: explain needs a rule id", file=sys.stderr)
            return 2
        rule = next((r for r in every if r.id == opts.args[0]), None)
        if rule is None:
            print(f'slop: no rule "{opts.args[0]}"', file=sys.stderr)
            return 2
        print(f"{rule.id}  {rule.name}\n  set:      {rule.set}\n  kind:     {rule.kind}\n"
              f"  severity: {rule.severity}")
        if rule.pattern:
            print(f"  pattern:  /{rule.pattern}/{rule.flags}")
        print(f"\n  {rule.description}")
        if rule.suggest:
            print(f"\n  fix: {rule.suggest}")
        for label, key in (("flags", "hit"), ("allows", "miss")):
            examples = rule.tests.get(key) or []
            if examples:
                print(f"\n  {label}:")
                for ex in examples:
                    print(f"    {ex}")
        return 0

    if opts.command in ("test-rules", "fudge"):
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tests"))
        import test_rules
        return test_rules.main(opts.args)

    targets = opts.args or ["-"]
    files: list[str] = []
    for t in targets:
        if t == "-" or is_url(t):
            files.append(t)
        elif os.path.isdir(t):
            if not opts.recursive and t != ".":
                print(f"slop: {t} is a directory (use -r)", file=sys.stderr)
                return 2
            files.extend(walk(t, cfg["exclude"]))
        elif os.path.exists(t):
            files.append(t)
        else:
            print(f"slop: no such file: {t}", file=sys.stderr)
            return 2

    reports = []
    for f in files:
        try:
            name, src, kind = read_source(f)
        except Exception as exc:
            print(f"slop: cannot read {f}: {exc}", file=sys.stderr)
            return 2
        reports.append(lint_source(name, src, kind, rules, cfg))

    all_f = [f for r in reports for f in r["findings"]]
    words = sum(r["words"] for r in reports)
    per1000 = round(len(all_f) / words * 1000, 2) if words else 0.0

    if opts.format == "json":
        print(json.dumps({"files": reports, "total": len(all_f), "words": words,
                          "per1000": per1000, "rules": [r.id for r in rules],
                          "config": str(cfg_path) if cfg_path else None}, indent=2))
    elif opts.format == "tsv":
        for f in all_f:
            print("\t".join([f["file"], str(f["line"]), str(f["col"]), f["rule"],
                             one_line(f["match"], 200)]))
    elif opts.format == "github":
        for f in all_f:
            msg = one_line(f"{f['match']} — {f['suggest'] or ''}", 200).replace("%", " ")
            print(f"::warning file={f['file']},line={f['line']},col={f['col']},"
                  f"title={f['rule']}::{msg}")
    else:
        for r in reports:
            if not r["findings"] or opts.quiet:
                continue
            print(f"\n{r['file']} ({r['words']} words, {len(r['findings'])} findings)")
            for f in r["findings"]:
                badge = f" ×{f['count']}" if f["count"] else ""
                print(f"  {f['line']}:{f['col']:<6} {f['rule']:<21}{badge} {one_line(f['match'], 88)}")
                if opts.context and f["sentence"].strip() != f["match"].strip():
                    print(f"  {'':9} {one_line(f['sentence'], 132)}")
                if opts.suggest and f["suggest"]:
                    print(f"  {'':9} fix: {f['suggest']}")
        if all_f and not opts.quiet:
            by: dict[str, int] = {}
            for f in all_f:
                by[f["rule"]] = by.get(f["rule"], 0) + 1
            print("\nBy rule")
            for rid, n in sorted(by.items(), key=lambda kv: -kv[1]):
                print(f"  {n:4}  {rid}")
        print(f"\n{len(all_f)} findings in {len(reports)} file"
              f"{'' if len(reports) == 1 else 's'}, {words} words — {per1000} per 1000 words")

    if opts.exit_zero:
        return 0
    if cfg["max_per_1000"] is not None:
        return 1 if per1000 > cfg["max_per_1000"] else 0
    return 1 if len(all_f) > (cfg["max"] or 0) else 0


if __name__ == "__main__":
    raise SystemExit(main())
