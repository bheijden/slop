"""Rule-set resolution: which rules are active for this run.

Precedence, lowest to highest:
    built-in sets in rules/  ->  slop.json / pyproject.toml  ->  CLI flags

`select` and `ignore` both accept a SET NAME ("llm-cliches") or a RULE ID
("colon-triple"), the way ruff accepts both "E" and "E501".
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from .engine import Rule, compile_rule

CONFIG_NAME = "slop.json"
BUILTIN_DIR = Path(__file__).resolve().parents[2] / "rules"


class RuleSet:
    def __init__(self, data: dict, fallback: str = ""):
        self.name = data.get("name") or fallback
        self.title = data.get("title", "")
        self.description = data.get("description", "")
        self.source = data.get("source", "")
        if not isinstance(data.get("rules"), list):
            raise ValueError(f'rule set "{self.name}" has no rules array')
        self.rules: list[Rule] = [compile_rule(r, self.name) for r in data["rules"]]


def load_set_file(path: str | os.PathLike) -> RuleSet:
    path = Path(path)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"cannot load rule set {path}: {exc}") from exc
    return RuleSet(data, path.stem)


def fetch_set_url(url: str) -> RuleSet:
    """Load a rule set from a URL.

    Fetching one runs someone else's patterns on your text, so read it first:
    the browser caps a runaway rule with a worker timeout, the CLI does not.
    """
    import urllib.request
    req = urllib.request.Request(url, headers={"accept": "application/json",
                                               "user-agent": "slop"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode(resp.headers.get_content_charset() or "utf-8"))
    return RuleSet(data, url.rsplit("/", 1)[-1].removesuffix(".json"))


def load_builtin_sets(directory: Path | None = None) -> list[RuleSet]:
    directory = Path(directory or BUILTIN_DIR)
    if not directory.is_dir():
        return []
    # index.json is the manifest the web page reads, not a rule set.
    return [load_set_file(p) for p in sorted(directory.glob("*.json")) if p.name != "index.json"]


def find_config(start: str | os.PathLike = ".") -> Path | None:
    d = Path(start).resolve()
    while True:
        p = d / CONFIG_NAME
        if p.is_file():
            return p
        if d.parent == d:
            return None
        d = d.parent


def load_config(path: str | os.PathLike | None) -> dict:
    """Read slop.json, or [tool.slop] from a pyproject.toml."""
    if not path:
        return {}
    path = Path(path)
    if path.name == "pyproject.toml":
        import tomllib
        with path.open("rb") as fh:
            return tomllib.load(fh).get("tool", {}).get("slop", {})
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"cannot read {path}: {exc}") from exc


def resolve_rules(select=(), ignore=(), rule_sets=(), all_rules=False, rules_dir=None,
                  extra_sets=()):
    """Returns (active_rules, all_sets, every_rule)."""
    sets = (load_builtin_sets(rules_dir)
            + [load_set_file(p) for p in rule_sets if not p.startswith(("http://", "https://"))]
            + list(extra_sets))
    by_name: dict[str, RuleSet] = {}
    for s in sets:
        if s.name in by_name:
            raise ValueError(f'duplicate rule set name "{s.name}"')
        by_name[s.name] = s
    every = [r for s in sets for r in s.rules]
    by_id = {r.id: r for r in every}

    for names, what in ((select, "select"), (ignore, "ignore")):
        for n in names:
            if n not in by_name and n not in by_id:
                raise ValueError(f'{what}: "{n}" is not a rule set or rule id (try `slop list`)')

    sel_sets = [n for n in select if n in by_name]
    sel_ids = [n for n in select if n in by_id and n not in by_name]
    ign_sets = {n for n in ignore if n in by_name}
    ign_ids = {n for n in ignore if n in by_id and n not in by_name}

    if select:
        base, seen = [], set()
        for n in sel_sets:
            for r in by_name[n].rules:
                if r.id not in seen:
                    seen.add(r.id)
                    base.append(r)
        for i in sel_ids:
            if i not in seen:
                seen.add(i)
                base.append(by_id[i])
    else:
        base = every

    explicit = set(sel_ids)
    active = [r for r in base
              if r.id not in ign_ids and r.set not in ign_sets
              and (r.default != "off" or all_rules or r.id in explicit)]
    return active, sets, every


def merge_config(config: dict, flags: dict) -> dict:
    def merge(a, b):
        out = list(a or [])
        for x in (b or []):
            if x not in out:
                out.append(x)
        return out

    return {
        "select": flags.get("select") or config.get("select", []),
        "ignore": merge(config.get("ignore"), flags.get("ignore")),
        "rule_sets": merge(config.get("ruleSets"), flags.get("rule_sets")),
        "all_rules": flags.get("all_rules", config.get("all", False)),
        "exclude": merge(config.get("exclude"), flags.get("exclude")),
        "max": flags.get("max") if flags.get("max") is not None else config.get("max", 0),
        "max_per_1000": (flags.get("max_per_1000")
                         if flags.get("max_per_1000") is not None
                         else config.get("maxPer1000")),
        # Extraction options: markdown tables and indented code blocks.
        "skip_tables": flags.get("skip_tables") or config.get("skipTables", False),
        "indent_code": (False if flags.get("indent_code") is False
                        else config.get("indentCode", True)),
    }
