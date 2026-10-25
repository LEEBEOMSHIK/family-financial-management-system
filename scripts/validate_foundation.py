"""Validate this design kit only; this is not a product or bank integration test."""
from __future__ import annotations

import ast
import json
import os
import re
import sys
import tomllib
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []
counts = {"json": 0, "toml": 0, "markdown_links": 0, "html_refs": 0,
          "contrast_pairs": 0, "token_values": 0, "python_syntax": 0}


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def local_ref(source: Path, raw: str) -> None:
    parsed = urlparse(raw)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return
    target = (source.parent / unquote(parsed.path)).resolve()
    require(target.is_relative_to(ROOT), f"Reference leaves kit: {source.name}: {raw}")
    require(target.exists(), f"Missing target: {source.relative_to(ROOT)} -> {raw}")


class PreviewParser(HTMLParser):
    def __init__(self, path: Path) -> None:
        super().__init__()
        self.path = path
        self.ids: set[str] = set()
        self.anchors: list[str] = []
        self.h1_count = 0
        self.lang = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if tag == "html":
            self.lang = data.get("lang")
        if tag == "h1":
            self.h1_count += 1
        if data.get("id"):
            require(data["id"] not in self.ids, f"Duplicate HTML ID: {data['id']}")
            self.ids.add(data["id"])
        for key in ("href", "src"):
            ref = data.get(key)
            if not ref:
                continue
            counts["html_refs"] += 1
            if ref.startswith("#"):
                self.anchors.append(ref[1:])
            else:
                local_ref(self.path, ref)


def luminance(value: str) -> float:
    channels = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
              for c in channels]
    return sum(c * w for c, w in zip(linear, (0.2126, 0.7152, 0.0722)))


def main() -> int:
    skipped_dirs = {
        ".git", "node_modules", ".venv", ".venv-pg", ".next", "__pycache__", ".pytest_cache",
        ".ruff_cache", ".mypy_cache", "coverage", "test-results", "playwright-report",
        "var", "private-data", "dist", "out",
    }
    all_files = []
    for current, directories, names in os.walk(ROOT):
        directories[:] = [name for name in directories if name not in skipped_dirs]
        all_files.extend(Path(current) / name for name in names)
    for path in all_files:
        if path.suffix == ".json":
            try:
                json.loads(path.read_text(encoding="utf-8"))
                counts["json"] += 1
            except (ValueError, OSError) as exc:
                errors.append(f"Invalid JSON {path.name}: {exc}")
        if path.suffix == ".toml":
            try:
                tomllib.loads(path.read_text(encoding="utf-8"))
                counts["toml"] += 1
            except (ValueError, OSError) as exc:
                errors.append(f"Invalid TOML {path.name}: {exc}")
        if path.suffix == ".md":
            text = re.sub(r"```[\s\S]*?```", "", path.read_text(encoding="utf-8"))
            for ref in re.findall(r"\[[^\]]*\]\(([^\s)]+)\)", text):
                if not urlparse(ref).scheme and not ref.startswith("#"):
                    counts["markdown_links"] += 1
                    local_ref(path, ref)
        if path.suffix == ".html":
            parser = PreviewParser(path)
            parser.feed(path.read_text(encoding="utf-8"))
            require(parser.lang == "ko", f"Missing Korean lang in {path.name}")
            require(parser.h1_count == 1, f"Expected one H1 in {path.name}")
            for anchor in parser.anchors:
                require(anchor in parser.ids, f"Missing anchor #{anchor} in {path.name}")
        if path.suffix == ".py":
            try:
                ast.parse(path.read_text(encoding="utf-8"))
                counts["python_syntax"] += 1
            except SyntaxError as exc:
                errors.append(f"Python syntax {path.name}: {exc}")

    tokens = json.loads((ROOT / "docs/design/tokens.json").read_text(encoding="utf-8"))
    css = (ROOT / "apps/web/src/styles/tokens.css").read_text(encoding="utf-8")
    for group, prefix in (("colors", "color"), ("space", "space"), ("font-size", "font-size"),
                          ("radius", "radius"), ("layout", "layout")):
        for name, value in tokens[group].items():
            counts["token_values"] += 1
            require(f"--{prefix}-{name}: {value};" in css, f"CSS token mismatch {prefix}-{name}")

    theme_css = (ROOT / "apps/web/src/styles/theme.css").read_text(encoding="utf-8")
    dark_blocks = re.findall(r":root(?:\[data-theme=\"dark\"\]|:not\(\[data-theme\]\))\s*\{([^}]+)\}", theme_css)
    require(len(dark_blocks) == 2, "Expected explicit and system fallback dark CSS blocks")
    require(set(tokens["colors"]) == set(tokens["dark_colors"]), "Light/dark token keys differ")
    for block in dark_blocks:
        for name, value in tokens["dark_colors"].items():
            counts["token_values"] += 1
            require(f"--color-{name}: {value};" in block, f"Dark CSS token mismatch: {name}")

    ratios = []
    for theme, palette in (("light", tokens["colors"]), ("dark", tokens["dark_colors"])):
        for foreground, background, minimum in tokens["contrast_pairs"]:
            a, b = luminance(palette[foreground]), luminance(palette[background])
            ratio = (max(a, b) + 0.05) / (min(a, b) + 0.05)
            counts["contrast_pairs"] += 1
            require(ratio >= minimum, f"Contrast {theme} {foreground}/{background}: {ratio:.2f} < {minimum}")
            ratios.append({"theme": theme, "pair": f"{foreground}/{background}",
                           "ratio": round(ratio, 2), "minimum": minimum})

    css_files = [p for p in all_files if p.suffix == ".css"]
    all_css = "\n".join(p.read_text(encoding="utf-8") for p in css_files)
    declared = set(re.findall(r"(--[a-z0-9-]+)\s*:", all_css))
    used = set(re.findall(r"var\((--[a-z0-9-]+)", all_css))
    require(not used - declared, f"Undeclared CSS tokens: {sorted(used - declared)}")
    for path in css_files:
        for ref in re.findall(r"@import\s+['\"]([^'\"]+)['\"]", path.read_text(encoding="utf-8")):
            local_ref(path, ref)

    policy = json.loads((ROOT / "config/business-policy.example.json").read_text(encoding="utf-8"))
    require(policy["activated"] is False, "Unverified business policy must be inactive")
    require(policy["source_sha256"] is None, "Do not invent regulation hash")
    require(policy["on_unconfigured"] == "deny_policy_dependent_mutations", "Missing deny policy")
    notification = json.loads((ROOT / "config/notification-policy.example.json").read_text(encoding="utf-8"))
    require([x["days"] for x in notification["offsets"]] == [-1, 0, 1], "Reminder offsets changed")
    require(all(x["enabled"] for x in notification["offsets"]), "Confirmed offsets disabled")
    require(notification["offsets"][2]["only_if_unprocessed"] is True, "D+1 must be conditional")
    require(notification["recipient_role"] == "current_treasurer", "Recipient must be current treasurer")
    require(notification["transport"] == "sink" and notification["external_delivery_enabled"] is False,
            "External notification must be off in draft")
    require(notification["hold_across_revisions_and_recipients"] == ["accepted", "delivered", "unknown"],
            "Cross-revision send protection missing")
    decisions = json.loads((ROOT / "config/project-decisions.json").read_text(encoding="utf-8"))
    require(decisions["confirmed"]["local_docker"] is False, "Local Docker must not be required")
    require(decisions["confirmed"]["manual_transfer_by_current_treasurer"] is True, "Manual transfer condition changed")
    roles = list((ROOT / ".agents/roles").glob("*.md"))
    require(len(roles) == 11, f"Expected 11 role prompts, found {len(roles)}")

    report = {"scope": "design-kit-static-validation", "status": "PASS" if not errors else "FAIL",
              "file_count": len(all_files), "checks": counts, "contrast": ratios, "errors": errors,
              "not_tested": ["Next.js build", "React runtime", "FastAPI/DB integration", "bank/Kakao live APIs",
                             "product RBAC", "full WCAG compliance", "deployment"]}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
