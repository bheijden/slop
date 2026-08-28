"""The rule engine: five detector kinds, all driven by rules/*.json.

Behaviour is identical to js/engine.mjs. tests/test_rules.py runs the same
rule test cases against both, which is what keeps them from drifting.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Iterable

KINDS = ("regex", "chain", "echo", "question-chain", "anaphora")

CHAIN_SEP = (
    r"(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+"
    r"|\s*[;&–—]\s*(?:and\s+|or\s+)?|\s+-{1,2}\s+)"
)
_CHAIN_SPLIT = re.compile(CHAIN_SEP, re.I)
_ANAPHORA_SKIP = re.compile(
    r"^(?:i|it|the|a|an|this|that|we|you|they|he|she|there|but|and|so|in|as|if"
    r"|my|his|her|their|its|these|those|for|at|on|of|to|is|was)$", re.I)
_WORD = re.compile(r"\S+")


@dataclass
class Match:
    start: int
    end: int
    count: int | None = None
    rule: "Rule | None" = None


@dataclass
class Rule:
    id: str
    name: str
    kind: str
    description: str = ""
    suggest: str = ""
    severity: str = "warn"
    set: str = ""
    pattern: str | None = None
    flags: str = ""
    headTest: str | None = None
    itemLabel: str = "item"
    params: dict = field(default_factory=dict)
    tests: dict = field(default_factory=lambda: {"hit": [], "miss": []})
    default: str | None = None
    find: Callable[[str], list[Match]] = None  # set by compile_rule


def _compile(pattern: str, flags: str, rule_id: str) -> re.Pattern:
    try:
        return re.compile(pattern, re.I if "i" in (flags or "") else 0)
    except re.error as exc:
        raise ValueError(f'rule "{rule_id}": bad pattern - {exc}') from exc


def _regex_finder(rule: Rule):
    rx = _compile(rule.pattern, rule.flags, rule.id)
    return lambda text: [Match(m.start(), m.end()) for m in rx.finditer(text)]


def _chain_finder(rule: Rule):
    rx = _compile(rule.pattern, rule.flags, rule.id)
    head = _compile(rule.headTest, "i", rule.id)

    def find(text: str) -> list[Match]:
        out = []
        for m in rx.finditer(text):
            end = m.end()
            while end > m.start() and text[end - 1].isspace():
                end -= 1
            parts = _CHAIN_SPLIT.split(m.group(0))
            out.append(Match(m.start(), end, len([p for p in parts if head.match(p.strip())])))
        return out

    return find


def _grams(s: str, n: int) -> set[str]:
    w = re.findall(r"[a-z0-9'’-]+", s.lower())
    return {" ".join(w[i:i + n]) for i in range(len(w) - n + 1)}


def _echo_finder(rule: Rule):
    min_gram = rule.params.get("minGram", 4)
    min_run = rule.params.get("minRun", 2)

    def find(text: str) -> list[Match]:
        sents = [(m.start(), m.end(), m.group(0))
                 for m in re.finditer(r"[^.!?\n]+[.!?]?", text)
                 if len(_WORD.findall(m.group(0))) >= 4]
        out, i = [], 0
        while i < len(sents):
            j, shared = i, None
            while j + 1 < len(sents):
                if sents[j + 1][0] - sents[j][1] > 3:
                    break
                common = _grams(sents[j][2], min_gram) & _grams(sents[j + 1][2], min_gram)
                if not common:
                    break
                shared = sorted(common, key=lambda g: -len(g))[0]
                j += 1
            run = j - i + 1
            if run >= min_run and shared:
                end = sents[j][1]
                while end > sents[i][0] and text[end - 1].isspace():
                    end -= 1
                out.append(Match(sents[i][0], end, run))
                i = j + 1
            else:
                i += 1
        return out

    return find


def _question_finder(rule: Rule):
    min_run = rule.params.get("minRun", 2)

    def find(text: str) -> list[Match]:
        out = []
        for m in re.finditer(r"[^.!?\n]+\?(?:\s+[^.!?\n]+\?)+", text):
            n = m.group(0).count("?")
            if n < min_run:
                continue
            s = m.start()
            while s < m.end() and text[s].isspace():
                s += 1
            out.append(Match(s, m.end(), n))
        return out

    return find


def _anaphora_finder(rule: Rule):
    min_run = rule.params.get("minRun", 3)

    def find(text: str) -> list[Match]:
        sents = []
        for m in re.finditer(r"[^.!?\n]+[.!?]", text):
            w = re.search(r"[A-Za-z'’-]+", m.group(0))
            if w:
                sents.append((m.start() + m.group(0).index(w.group(0)), m.end(), w.group(0).lower()))
        out, i = [], 0
        while i < len(sents):
            j = i
            while (j + 1 < len(sents) and sents[j + 1][2] == sents[i][2]
                   and sents[j + 1][0] - sents[j][1] < 4):
                j += 1
            run = j - i + 1
            if run >= min_run and not _ANAPHORA_SKIP.match(sents[i][2]):
                out.append(Match(sents[i][0], sents[j][1], run))
                i = j + 1
            else:
                i += 1
        return out

    return find


_BUILDERS = {
    "regex": _regex_finder,
    "chain": _chain_finder,
    "echo": _echo_finder,
    "question-chain": _question_finder,
    "anaphora": _anaphora_finder,
}


def compile_rule(data: dict, set_name: str = "") -> Rule:
    if not data.get("id"):
        raise ValueError("every rule needs an id")
    kind = data.get("kind")
    if kind not in _BUILDERS:
        raise ValueError(f'rule "{data["id"]}": unknown kind {kind!r} (expected {", ".join(KINDS)})')
    rule = Rule(
        id=data["id"], name=data.get("name", data["id"]), kind=kind,
        description=data.get("description", ""), suggest=data.get("suggest", ""),
        severity=data.get("severity", "warn"), set=data.get("set") or set_name,
        pattern=data.get("pattern"), flags=data.get("flags", ""),
        headTest=data.get("headTest"), itemLabel=data.get("itemLabel", "item"),
        params=data.get("params", {}) or {},
        tests=data.get("tests", {"hit": [], "miss": []}),
        default=data.get("default"),
    )
    rule.find = _BUILDERS[kind](rule)
    return rule


def analyze(text: str, rules: Iterable[Rule]) -> list[Match]:
    """Run every rule; overlapping matches collapse to the leftmost-longest."""
    raw: list[Match] = []
    for rule in rules:
        for m in rule.find(text):
            m.rule = rule
            raw.append(m)
    raw.sort(key=lambda m: (m.start, -m.end))
    out: list[Match] = []
    for m in raw:
        if out and m.start < out[-1].end:
            continue
        out.append(m)
    return out


def sentence_bounds(text: str, start: int, end: int) -> tuple[int, int]:
    s = start
    while s > 0 and text[s - 1] not in "\n.!?…":
        s -= 1
    while s < start and text[s].isspace():
        s += 1
    e = end
    while e < len(text):
        ch = text[e]
        if ch == "\n":
            break
        e += 1
        if ch in ".!?…":
            while e < len(text) and text[e] in "\"'”’)]":
                e += 1
            break
    return s, e


def count_words(s: str) -> int:
    return len(_WORD.findall(s))
