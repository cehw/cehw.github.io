#!/usr/bin/env python3
"""Generate optimized gallery thumbnails and rewrite meta.json thumb paths."""

from __future__ import annotations

import json
import warnings
from pathlib import Path

from PIL import Image, ImageOps


MAX_SIZE = (1400, 1050)
WEBP_QUALITY = 76


def main() -> None:
    warnings.simplefilter("ignore", Image.DecompressionBombWarning)
    root = Path(__file__).resolve().parents[1]
    gallery_dir = root / "assets" / "gallery"
    meta_path = gallery_dir / "meta.json"
    thumbs_root = gallery_dir / "thumbs"
    thumbs_root.mkdir(parents=True, exist_ok=True)

    items = json.loads(meta_path.read_text(encoding="utf-8"))
    if not isinstance(items, list):
        raise ValueError("meta.json must contain an array")

    generated = 0
    skipped_missing = 0
    expected_rel_paths: set[str] = set()

    for item in items:
        if not isinstance(item, dict):
            continue

        full_rel = str(item.get("full") or item.get("thumb") or "").strip()
        if not full_rel:
            continue
        src_path = gallery_dir / full_rel
        if not src_path.is_file():
            skipped_missing += 1
            continue

        rel_base = Path(full_rel).with_suffix(".webp")
        thumb_rel = Path("thumbs") / rel_base
        thumb_path = gallery_dir / thumb_rel
        thumb_path.parent.mkdir(parents=True, exist_ok=True)
        expected_rel_paths.add(thumb_rel.as_posix())

        regenerate = True
        if thumb_path.exists():
            regenerate = thumb_path.stat().st_mtime < src_path.stat().st_mtime

        if regenerate:
            with Image.open(src_path) as im:
                im = ImageOps.exif_transpose(im)
                if im.mode not in ("RGB", "L"):
                    im = im.convert("RGB")
                elif im.mode == "L":
                    im = im.convert("RGB")
                im.thumbnail(MAX_SIZE, Image.Resampling.LANCZOS)
                im.save(
                    thumb_path,
                    format="WEBP",
                    quality=WEBP_QUALITY,
                    method=6,
                    optimize=True,
                )
            generated += 1

        item["thumb"] = thumb_rel.as_posix()

    removed = 0
    for old_thumb in thumbs_root.rglob("*"):
        if not old_thumb.is_file():
            continue
        old_rel = old_thumb.relative_to(gallery_dir).as_posix()
        if old_rel not in expected_rel_paths:
            old_thumb.unlink()
            removed += 1

    meta_path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Updated {meta_path}")
    print(f"Generated/updated thumbs: {generated}")
    print(f"Removed stale thumbs: {removed}")
    if skipped_missing:
        print(f"Missing source images skipped: {skipped_missing}")


if __name__ == "__main__":
    main()
