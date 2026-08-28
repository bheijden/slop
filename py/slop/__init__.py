"""slop - prose linting with pluggable rule sets."""
from .engine import Rule, analyze, compile_rule, count_words, sentence_bounds
from .config import load_set_file, load_builtin_sets, resolve_rules

__version__ = "0.1.0"
__all__ = ["Rule", "analyze", "compile_rule", "count_words", "sentence_bounds",
           "load_set_file", "load_builtin_sets", "resolve_rules"]
