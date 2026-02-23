#!/usr/bin/env python3
"""Auto-generate assets/gallery/meta.json from local images."""

from __future__ import annotations

import json
import re
import subprocess
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}

FIXED_GROUP_ORDER = {
    "Austria": 10,
    "Australia": 20,
    "Hong Kong": 30,
    "Portraits": 40,
    "Research Visuals": 50,
}


def read_json(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    return []


def mdls_creation_date(path: Path) -> str:
    cmd = ["mdls", "-name", "kMDItemContentCreationDate", str(path)]
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        return ""
    line = result.stdout.strip()
    if "=" not in line:
        return ""
    value = line.split("=", 1)[1].strip()
    if value == "(null)":
        return ""
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", value)
    if not m:
        return ""
    return f"{m.group(1)}-{m.group(2)}"


def infer_group(rel_path: str, ext: str, date_ym: str) -> str:
    lower = rel_path.lower()
    if "austria" in lower:
        return "Austria"
    if "australia" in lower:
        return "Australia"
    if "hongkong" in lower or "hong_kong" in lower or "/hk" in lower:
        return "Hong Kong"
    if "portrait" in lower or "headshot" in lower or "profile" in lower:
        return "Portraits"
    if ext.lower() == ".png":
        return "Research Visuals"
    if re.match(r"^\d{4}-\d{2}$", date_ym):
        year = date_ym[:4]
        return f"Field & Travel {year}"
    return "Unsorted"


def group_order(group: str) -> int:
    if group in FIXED_GROUP_ORDER:
        return FIXED_GROUP_ORDER[group]
    m = re.match(r"^Field & Travel (\d{4})$", group)
    if m:
        year = int(m.group(1))
        return 200 + (2100 - year)
    if group == "Unsorted":
        return 999
    return 800


def default_description(group: str) -> str:
    if group == "Portraits":
        return "Personal gallery selection."
    if group == "Research Visuals":
        return "Research visual material and snapshots."
    if group in {"Austria", "Australia", "Hong Kong"}:
        return "Field and conference travel moments."
    if group.startswith("Field & Travel"):
        return "Field and research travel moments."
    return "Gallery selection."


def prettify_title(rel_path: str, group: str) -> str:
    stem = Path(rel_path).stem
    readable = re.sub(r"[_-]+", " ", stem).strip()
    if re.match(r"^(img|dsc)\s*\d+$", readable, re.IGNORECASE):
        if group.startswith("Field & Travel"):
            return f"{group} · {readable.upper()}"
        if group == "Research Visuals":
            return f"Research Visual · {readable.upper()}"
        return readable.upper()
    return readable.title()


def parse_date_for_sort(value: str) -> float:
    value = (value or "").strip()
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            return datetime.strptime(value, fmt).timestamp()
        except ValueError:
            continue
    return float("-inf")


def find_full_variant(gallery_dir: Path, thumb_rel: str) -> str:
    thumb_path = Path(thumb_rel)
    full_stem = f"{thumb_path.stem}_full"
    candidates = []
    for ext in IMAGE_EXTS:
        candidates.append(thumb_path.with_name(f"{full_stem}{ext}"))
        candidates.append(thumb_path.with_name(f"{full_stem}{ext.upper()}"))
    for candidate in candidates:
        if (gallery_dir / candidate).is_file():
            return candidate.as_posix()
    return ""


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    assets_gallery = root / "assets" / "gallery"
    legacy_gallery = root / "materials" / "gallery"
    if assets_gallery.exists():
        gallery_dir = assets_gallery
    elif legacy_gallery.exists():
        gallery_dir = legacy_gallery
    else:
        raise FileNotFoundError("No gallery directory found. Expected assets/gallery.")
    meta_path = gallery_dir / "meta.json"

    existing = read_json(meta_path)
    existing_by_thumb = {
        str(item.get("thumb", "")).strip(): item
        for item in existing
        if str(item.get("thumb", "")).strip()
    }
    existing_by_full = {
        str(item.get("full", "")).strip(): item
        for item in existing
        if str(item.get("full", "")).strip()
    }

    images: list[Path] = []
    for file in gallery_dir.rglob("*"):
        if not file.is_file():
            continue
        if file.name.startswith("."):
            continue
        if file.name.lower() == "meta.json":
            continue
        rel_for_skip = file.relative_to(gallery_dir).as_posix().lower()
        if rel_for_skip.startswith("thumbs/"):
            continue
        # Treat *_full assets as full-size variants for existing thumbs.
        # They are referenced from metadata and should not become gallery cards.
        if file.stem.lower().endswith("_full"):
            continue
        if file.suffix.lower() not in IMAGE_EXTS:
            continue
        images.append(file)
    images.sort(key=lambda p: str(p).lower())

    out: list[dict[str, Any]] = []
    for file in images:
        thumb_rel = file.relative_to(gallery_dir).as_posix()
        prev = existing_by_thumb.get(thumb_rel) or existing_by_full.get(thumb_rel, {})

        date_ym = str(prev.get("date", "")).strip()
        if not date_ym:
            date_ym = mdls_creation_date(file)

        group = str(prev.get("group", "")).strip()
        if not group:
            group = infer_group(thumb_rel, file.suffix, date_ym)

        order = prev.get("group_order")
        if not isinstance(order, int):
            try:
                order = int(order)
            except Exception:
                order = group_order(group)

        prev_full = str(prev.get("full", "")).strip()
        full_rel = ""
        if prev_full and (gallery_dir / prev_full).exists():
            full_rel = prev_full
        else:
            candidate = find_full_variant(gallery_dir, thumb_rel)
            if candidate:
                full_rel = candidate
            else:
                full_rel = thumb_rel

        title = str(prev.get("title", "")).strip() or prettify_title(thumb_rel, group)
        desc = str(prev.get("description", "")).strip() or default_description(group)

        prev_thumb = str(prev.get("thumb", "")).strip()
        if prev_thumb and (gallery_dir / prev_thumb).is_file():
            thumb_out = prev_thumb
        else:
            thumb_out = thumb_rel

        item = {
            "group": group,
            "group_order": int(order),
            "thumb": thumb_out,
            "full": full_rel,
            "title": title,
            "description": desc,
        }
        if date_ym:
            item["date"] = date_ym
        out.append(item)

    out.sort(
        key=lambda x: (
            int(x.get("group_order", 999)),
            -parse_date_for_sort(str(x.get("date", ""))),
            str(x.get("thumb", "")),
        )
    )

    meta_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    counts = Counter(str(item.get("group", "Other")) for item in out)
    print(f"Wrote {len(out)} items to {meta_path}")
    for group, count in sorted(counts.items(), key=lambda x: x[0].lower()):
        print(f"  - {group}: {count}")


if __name__ == "__main__":
    main()
