# Calibrating a rule against real prose

Every built-in rule is measured over 29k words of real technical writing —
internal reports, troubleshooting notes and design documents — before it ships
enabled. No rule is off by default. One nearly was, and the story is the reason
this document exists.

## The case of `colon-triple`

The rule looks for a colon opening onto three comma-separated items — *"separate
ports, processes, and local state"* — the shape LLM prose reaches for when it
wants to sound concrete. Upstream ships it with a warning: *"Noisy in technical
writing — leave it off by default if your corpus is documentation."*

On the corpus it fired **21 times, 45% of all findings**. The obvious move was to
take upstream's advice and disable it. That was wrong. Reading all 21 showed the
rule was not noisy, it was **broken**:

```
: SVD mode ("truncate", "damp", or None)              a Python docstring
: theta_opt, cost_history, primary_rms_history        identifiers
: B=per[k], per[0]=I, per[j]=B⁻¹per[j]                matrix algebra
: Intel CNVi, hci0, BlueZ 5                           a hardware list
: Perception, Planning, Actuation, Orchestration      component names
: shows HE-MCS 11 at 1 Gbps, signal -30 dBm, 0% loss  measurements
```

Sixteen of the 21 were not prose at all. Five were real. Upstream's item body is
`[^.!?;:\n]{2,40}` — three commas and anything between them.

### The fix

Two constraints, both derived from what the false positives had in common:

1. **Items may not contain code, math or path characters** —
   `= [ ] ( ) { } " ' / \ | _ ~ ^ % * + < > & # @ $ → ⇒ ↔ °`. Docstrings, matrix
   algebra and file paths all carry at least one.
2. **Each item must start lowercase.** Prose items do. Proper-noun enumerations
   — `Perception, Planning, Actuation` — do not.

Four candidates were measured against a must-hit set (both upstream examples
plus the two real findings) and a must-miss set (both upstream counter-examples
plus fourteen false positives from the corpus):

| variant | recall | must-miss | corpus hits |
|---|---|---|---|
| upstream | 4/4 | 6/14 | 21 |
| A — prose characters only | 4/4 | 11/14 | 8 |
| B — A + `and`/`or` required | **3/4** | 14/14 | 2 |
| **C — A + lowercase items** | **4/4** | **14/14** | **5** |
| D — B + C | 3/4 | 14/14 | 2 |

Variant C keeps every example and drops every false positive. B and D score
perfectly on the must-miss set but lose a real hit, because requiring `and`
before the last item rejects the bare triple `ports, processes, local state` —
which upstream lists as an example.

All five surviving hits are genuine. The rule ships **on**, and the fourteen
false positives are now `tests.miss` cases, so the regression is locked in.

The override lives in `tools/build-rules.mjs`, not in `rules/*.json`, so
refreshing `vendor/` does not silently revert it.

## Doing this on your own corpus

```sh
slop check --format json -r <your-docs> \
  | jq -r '.files[].findings[].rule' | sort | uniq -c | sort -rn
```

A rule producing a large share of findings is not automatically wrong — but read
twenty of its hits before you decide. The choice is rarely *keep it or drop it*.
It is usually *the rule needs a constraint it does not have yet*, and the hits
themselves tell you which one.

Two rules were nearly disabled on intuition and then kept: `x-is-dead` and
`stranded-auxiliary` each produced exactly one finding over 29k words, and both
were true positives. Guessing would have removed two working rules.
