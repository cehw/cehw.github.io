#!/usr/bin/env python3
"""Validate assets/gallery/meta.json integrity."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


def resolve_gallery_dir(root: Path) -> Path:
    assets_gallery = root / "assets" / "gallery"
    legacy_gallery = root / "materials" / "gallery"
    if assets_gallery.exists():
        return assets_gallery
    if legacy_gallery.exists():
        return legacy_gallery
    raise FileNotFoundError("No gallery directory found. Expected assets/gallery.")


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    gallery_dir = resolve_gallery_dir(root)
    meta_path = gallery_dir / "meta.json"
    if not meta_path.exists():
        print(f"ERROR: {meta_path} not found")
        return 1

    try:
        items = json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: Invalid JSON in {meta_path}: {exc}")
        return 1

    if not isinstance(items, list):
        print(f"ERROR: {meta_path} should contain a JSON array")
        return 1

    missing = []
    thumbs = []
    fulls = []

    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            print(f"ERROR: item {idx} is not an object")
            return 1
        thumb = str(item.get("thumb", "")).strip()
        full = str(item.get("full", "")).strip()
        thumbs.append(thumb)
        fulls.append(full)

        for key, rel in (("thumb", thumb), ("full", full)):
            if not rel:
                missing.append((idx, key, rel, str(item.get("title", ""))))
                continue
            if not (gallery_dir / rel).is_file():
                missing.append((idx, key, rel, str(item.get("title", ""))))

    thumb_counts = Counter(t for t in thumbs if t)
    full_counts = Counter(f for f in fulls if f)
    dup_thumbs = {k: v for k, v in thumb_counts.items() if v > 1}
    dup_fulls = {k: v for k, v in full_counts.items() if v > 1}

    print(f"Gallery dir: {gallery_dir}")
    print(f"Items: {len(items)}")
    print(f"Missing refs: {len(missing)}")
    print(f"Duplicate thumbs: {len(dup_thumbs)}")
    print(f"Duplicate fulls: {len(dup_fulls)}")

    if missing:
        print("\nMissing entries:")
        for idx, key, rel, title in missing:
            print(f"  - item {idx} ({title}): {key}='{rel}'")

    if dup_thumbs:
        print("\nDuplicate thumb entries:")
        for rel, count in sorted(dup_thumbs.items()):
            print(f"  - {rel}: {count}")

    if dup_fulls:
        print("\nDuplicate full entries:")
        for rel, count in sorted(dup_fulls.items()):
            print(f"  - {rel}: {count}")

    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
