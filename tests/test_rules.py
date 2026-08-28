"""Rule tests for the Python engine - the mirror of tests/run.mjs.

    python3 tests/test_rules.py                  every built-in rule set
    python3 tests/test_rules.py rules/mine.json  a rule set you are writing
    pytest tests/test_rules.py

Both engines run the same rule files and the same fudging variants. If one
drifts from the other, one of these two suites goes red.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "py"))

from slop.config import load_builtin_sets, load_set_file  # noqa: E402
from slop.extract import extract_html, extract_markdown  # noqa: E402
from slop.fudge import variants  # noqa: E402

EXTRACT = {"md": extract_markdown, "html": extract_html}


def check(sets):
    conform_ok = conform_bad = fudge_ok = fudge_bad = lossy = 0
    failures, fragile = [], {}
    for s in sets:
        for rule in s.rules:
            t = rule.tests or {}
            if not t.get("hit"):
                failures.append((rule.id, "no examples", "every rule needs a tests.hit example"))
                conform_bad += 1
            for ex in t.get("miss", []):
                if rule.find(ex):
                    conform_bad += 1
                    failures.append((rule.id, "false positive", repr(ex)))
                else:
                    conform_ok += 1
            for ex in t.get("hit", []):
                hits = rule.find(ex)
                if not hits:
                    conform_bad += 1
                    failures.append((rule.id, "example does not match", repr(ex)))
                    continue
                conform_ok += 1
                for v in variants(ex, hits[0].start, hits[0].end):
                    text, _ = EXTRACT[v.format](v.source)
                    if rule.find(text):
                        if v.lossless:
                            fudge_ok += 1
                    elif not v.lossless:
                        lossy += 1
                    else:
                        fudge_bad += 1
                        fragile[v.name] = fragile.get(v.name, 0) + 1
                        failures.append((rule.id, f"fragile: {v.name}", repr(v.source[:72])))
    return dict(conform_ok=conform_ok, conform_bad=conform_bad, fudge_ok=fudge_ok,
                fudge_bad=fudge_bad, lossy=lossy, failures=failures, fragile=fragile)


def test_rules():
    r = check(load_builtin_sets())
    assert r["conform_bad"] == 0, r["failures"][:10]
    assert r["fudge_bad"] == 0, r["failures"][:10]


def main(argv):
    files = [a for a in argv if a.endswith(".json")]
    sets = [load_set_file(f) for f in files] if files else load_builtin_sets()
    r = check(sets)
    n = sum(len(s.rules) for s in sets)
    print(f"rule sets: {', '.join(s.name for s in sets)}  ({n} rules)")
    print(f"conformance: {r['conform_ok']} pass, {r['conform_bad']} fail")
    print(f"fudging:     {r['fudge_ok']} pass, {r['fudge_bad']} fail  "
          f"({r['lossy']} expected misses on lossy markup)")
    if r["fragile"]:
        print("\nfragile variants, worst first:")
        for name, c in sorted(r["fragile"].items(), key=lambda kv: -kv[1]):
            print(f"  {c:4}  {name}")
    if r["failures"]:
        print("\nfailures:")
        for rid, why, detail in r["failures"][:15]:
            print(f"  {rid:22} {why:28} {detail}")
    return 1 if r["conform_bad"] or r["fudge_bad"] else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
