"""Heuristic for the MB Team orchestrator guard: does a Bash command write into the project tree
outside the bank? shlex plus a few regexes, not a shell parser; anything it cannot read is let through
(shell variables are not expanded). `cd`/`pushd` joined by `&&` or `;` move the directory that relative
paths resolve against; a `cd` it cannot follow (variable, `-`, subshell, pipe, missing dir) makes relative
paths unknown, so they pass. Anything inside a `.memory-bank/` directory is bank territory."""

from __future__ import annotations

import os
import re
import shlex

_HEREDOC = re.compile(r"(?<!<)<<(?!<)-?\s*(['\"]?)(\w+)\1")
_REDIRECT_OUT = {">", ">>", ">|", "&>", "&>>"}
_REDIRECT_IN = {"<", "<<", "<<<", "<&", ">&"}
_SEPARATOR = set(";&|()")
_SEQUENTIAL = {"", ";", "&&"}  # a cd between these changes the directory of what follows
_WRAPPERS = {"sudo", "env", "command", "nohup", "time", "exec"}
_PY_OPEN = re.compile(
    r"""\bopen\(\s*(['"])(?P<p>[^'"]+)\1\s*,\s*(?:mode\s*=\s*)?(['"])[^'"]*[wax+][^'"]*\3"""
    r"""|\bPath\(\s*(['"])(?P<q>[^'"]+)\4\s*\)\.write_(?:text|bytes)\("""
)
_GIT_READ_ONLY = {"--check", "--stat", "--numstat", "--summary", "--cached"}
_ARG_OPTS = {"install": {"-m", "-o", "-g", "-S", "--mode", "--owner", "--group"}}


def inside(path: str, root: str) -> bool:
    return path == root or path.startswith(root.rstrip("/") + "/")


def _split(cmd: str) -> list[tuple[str, list[str], str]]:
    """(separator before, tokens, here-doc text of the line) per statement; a trailing separator (a closing
    `)`) is a statement without tokens. Here-doc bodies are cut out of the code; an unparseable line becomes
    ("!", [the raw line], body): the directory is unknown after it."""
    lines: list[tuple[str, list[str]]] = []
    end = None
    for line in cmd.splitlines():
        if end is not None:
            lines[-1][1].append(line)
            end = None if line.strip() == end else end
            continue
        match = _HEREDOC.search(line)
        end = match.group(2) if match else None
        lines.append((line, []))
    statements: list[tuple[str, list[str], str]] = []
    for line, body_lines in lines:
        body = "\n".join(body_lines)
        try:
            lex = shlex.shlex(line, posix=True, punctuation_chars=True)
            lex.whitespace_split = True
            tokens = list(lex)
        except ValueError:
            statements.append(("!", [line], body))
            continue
        current: list[str] = []
        sep = ""
        for tok in tokens:
            if tok and set(tok) <= _SEPARATOR:
                if current:
                    statements.append((sep, current, body))
                    current, sep = [], ""
                sep += tok
            else:
                current.append(tok)
        if current or sep:
            statements.append((sep, current, body))
    return statements


def _redirects(tokens: list[str]) -> tuple[list[str], list[str]]:
    """(words, files written by `>`-style redirections)."""
    words: list[str] = []
    out: list[str] = []
    skip = False
    for i, tok in enumerate(tokens):
        nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
        if skip:
            skip = False
        elif tok in _REDIRECT_OUT or tok in _REDIRECT_IN:
            skip = True
            if tok in _REDIRECT_OUT and nxt:
                out.append(nxt)
        elif not (tok.isdigit() and (nxt in _REDIRECT_OUT or nxt in _REDIRECT_IN)):
            words.append(tok)
    return words, out


def _parts(args: list[str], takes_arg: set[str]) -> tuple[list[str], list[str]]:
    """(options, positionals); the value after an option in `takes_arg` is skipped."""
    opts: list[str] = []
    pos: list[str] = []
    it = iter(args)
    for a in it:
        if a.startswith("-") and a != "-":
            opts.append(a)
            if a in takes_arg:
                next(it, None)
        else:
            pos.append(a)
    return opts, pos


def _in_place(args: list[str], inplace: str, script_opts: set[str]) -> list[str]:
    opts, pos = _parts(args, script_opts)
    if not any(re.fullmatch(inplace, o) for o in opts):
        return []
    return pos if any(o in script_opts for o in opts) else pos[1:]


def _copy(cmd: str, args: list[str]) -> list[str]:
    for i, a in enumerate(args):
        if a in ("-t", "--target-directory") and i + 1 < len(args):
            return [args[i + 1]]
        if a.startswith("--target-directory="):
            return [a.split("=", 1)[1]]
    opts, pos = _parts(args, _ARG_OPTS.get(cmd, set()))
    if cmd == "install" and "-d" in opts:
        return pos
    return pos[-1:] if len(pos) >= 2 else []


def _git_dir(args: list[str]) -> str | None:
    """The directory `git [-C d] apply` writes into, None for another subcommand or a read-only apply."""
    base, i = ".", 0
    while i < len(args) and args[i].startswith("-"):
        if args[i] == "-C" and i + 1 < len(args):
            base = os.path.join(base, args[i + 1])
        i += 2 if args[i] in ("-C", "-c") else 1
    rest = args[i:]
    if not rest or rest[0] != "apply" or _GIT_READ_ONLY & set(rest):
        return None
    return base


def _patch_dir(args: list[str]) -> list[str]:
    if "--dry-run" in args:
        return []
    for i, a in enumerate(args):
        if a == "-d" and i + 1 < len(args):
            return [args[i + 1]]
        if a.startswith("--directory="):
            return [a.split("=", 1)[1]]
    return ["."]


def _targets(words: list[str]) -> list[str]:
    while words and (re.match(r"\w+=", words[0]) or words[0] in _WRAPPERS):
        words = words[1:]
    if not words:
        return []
    cmd, args = os.path.basename(words[0]), words[1:]
    if cmd == "tee":
        return _parts(args, set())[1]
    if cmd in ("cp", "mv", "install", "ln"):
        return _copy(cmd, args)
    if cmd == "sed":
        return _in_place(
            args, r"-[A-Za-z]*i.*|--in-place.*", {"-e", "-f", "--expression", "--file"}
        )
    if cmd == "perl":
        return _in_place(args, r"-[A-Za-z]*i.*", {"-e", "-E"})
    if cmd == "git":
        base = _git_dir(args)
        return [base] if base else []
    if cmd == "patch":
        return _patch_dir(args)
    return []


def _unresolvable(path: str) -> bool:
    return not path or bool(re.search(r"[$`*?\[{]", path))


def _cd_target(words: list[str], cwd: str | None) -> str | None:
    """The directory a `cd`/`pushd` leads to, None when it cannot be followed."""
    args = [a for a in words[1:] if a == "-" or not a.startswith("-")]
    path = os.path.expandvars(os.path.expanduser(args[0] if args else "~"))
    if (
        len(args) > 1
        or path == "-"
        or _unresolvable(path)
        or (cwd is None and not os.path.isabs(path))
    ):
        return None
    full = os.path.realpath(os.path.join(cwd or "/", path))
    return full if os.path.isdir(full) else None


def _in_tree(path: str, cwd: str | None, tree: str, bank: str) -> str | None:
    path = os.path.expandvars(os.path.expanduser(path))
    if _unresolvable(path) or (cwd is None and not os.path.isabs(path)):
        return None
    full = os.path.realpath(os.path.join(cwd or "/", path))
    in_bank = inside(full, bank) or ".memory-bank" in full.split(os.sep)
    return path if inside(full, tree) and not in_bank else None


def _sequential(sep: str) -> bool:
    return re.sub(r"[()]", "", sep) in _SEQUENTIAL


def _next_stack(stack: list[str | None], words: list[str], sequential: bool) -> list[str | None]:
    """The directory stack (top = cwd, None = unknown) after a `cd`/`pushd`/`popd` statement."""
    top, rest = stack[0], stack[1:]
    opts = [a for a in words[1:] if a.startswith(("-", "+")) and a not in ("-", "+")]
    if not sequential or (words[0] != "cd" and opts):
        return [None, *rest]
    if words[0] == "popd":
        return rest or [None]
    if words[0] == "pushd" and len(words) == 1:  # swap the top two; a missing one is unknown
        return [*(rest or [None])[:1], top, *rest[1:]]
    target = _cd_target(words, top)
    return [target, *rest] if words[0] == "cd" else [target, top, *rest]


def tree_write(cmd: str, cwd: str, tree: str, bank: str) -> str | None:
    """The first path inside `tree` (outside any `.memory-bank/`) that `cmd` appears to write, or None."""
    stack: list[str | None] = [cwd]
    saved: list[list[str | None]] = []  # the stacks of the enclosing shells, restored at `)`
    statements = _split(cmd)
    for i, (sep, tokens, body) in enumerate(statements):
        for ch in filter(lambda c: c in "()", sep):
            if ch == "(":
                saved.append(stack)
            elif saved:
                stack = saved.pop()
        words, redirected = _redirects(tokens)
        here = stack[0]
        checks = list(redirected)  # a redirect is opened before the `cd` it sits on takes effect
        if sep == "!":
            stack = [None, *stack[1:]]
        elif words[:1] in (["cd"], ["pushd"], ["popd"]):
            after = statements[i + 1][0] if i + 1 < len(statements) else ""
            stack = _next_stack(stack, words, _sequential(sep) and _sequential(after))
        else:
            checks += _targets(words)
        if re.search(r"\bpython[\d.]*\b", " ".join(tokens)):
            checks += [
                m.group("p") or m.group("q")
                for m in _PY_OPEN.finditer(" ".join(tokens) + "\n" + body)
            ]
        for path in checks:
            if hit := _in_tree(path, here, tree, bank):
                return hit
    return None
