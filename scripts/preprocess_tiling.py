"""
Preprocessing & Tiling Module
-----------------------------
Reads xBD pre- and post-disaster 1024x1024 image pairs + JSON labels:
1. Rasterizes building footprints into binary localization masks.
2. Rasterizes damage categories (0: none, 1: minor, 2: major, 3: destroyed) into damage masks.
3. Crops both images and masks into matching 512x512 patches (4 quadrants per 1024x1024 image).
4. Saves preprocessed arrays/images ready for immediate PyTorch loading.
"""

import os
import json
import argparse
from typing import Tuple, Dict, Any, List
from concurrent.futures import ProcessPoolExecutor

import cv2
import numpy as np
from shapely.wkt import loads as wkt_loads
from shapely.geometry import Polygon
from tqdm import tqdm

DAMAGE_MAPPING = {
    "no-damage": 0,
    "minor-damage": 1,
    "major-damage": 2,
    "destroyed": 3,
    "un-classified": 0,
}


def parse_polygons_from_json(json_path: str) -> List[Tuple[Polygon, str]]:
    """
    Extracts pixel (xy) building polygons and damage subtypes from xBD label JSON.
    """
    with open(json_path, "r") as f:
        data = json.load(f)

    polygons = []
    features_xy = data.get("features", {}).get("xy", [])
    for feat in features_xy:
        wkt_str = feat.get("wkt")
        if not wkt_str:
            continue
        try:
            geom = wkt_loads(wkt_str)
            subtype = feat.get("properties", {}).get("subtype", "no-damage")
            polygons.append((geom, subtype))
        except Exception:
            continue
    return polygons


def rasterize_masks(
    polygons: List[Tuple[Polygon, str]],
    height: int = 1024,
    width: int = 1024
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Creates:
      - localization_mask: uint8 array with 1 for building, 0 for background.
      - damage_mask: uint8 array with 0 (no-damage), 1 (minor), 2 (major), 3 (destroyed).
                     Background remains 255 (ignore index for damage loss).
    """
    loc_mask = np.zeros((height, width), dtype=np.uint8)
    dmg_mask = np.full((height, width), fill_value=255, dtype=np.uint8)

    for geom, subtype in polygons:
        if geom.is_empty:
            continue

        pts = []
        if geom.geom_type == "Polygon":
            coords = np.array(geom.exterior.coords, dtype=np.int32)
            pts.append(coords)
        elif geom.geom_type == "MultiPolygon":
            for poly in geom.geoms:
                coords = np.array(poly.exterior.coords, dtype=np.int32)
                pts.append(coords)

        dmg_class = DAMAGE_MAPPING.get(subtype, 0)
        cv2.fillPoly(loc_mask, pts, 1)
        cv2.fillPoly(dmg_mask, pts, dmg_class)

    return loc_mask, dmg_mask


def tile_pair(
    item: Dict[str, str],
    output_images_dir: str,
    output_masks_dir: str,
    tile_size: int = 512,
) -> List[Dict[str, Any]]:
    """
    Tiles a 1024x1024 image pair and masks into (1024/tile_size)^2 non-overlapping tiles.
    """
    prefix = item["prefix"]
    pre_img = cv2.imread(item["pre_img"])
    post_img = cv2.imread(item["post_img"])

    if pre_img is None or post_img is None:
        return []

    h, w, _ = pre_img.shape
    polygons = parse_polygons_from_json(item["post_json"])
    loc_mask, dmg_mask = rasterize_masks(polygons, h, w)

    tile_records = []
    tile_idx = 0

    for y in range(0, h, tile_size):
        for x in range(0, w, tile_size):
            # Check bounding limits
            y_end = min(y + tile_size, h)
            x_end = min(x + tile_size, w)

            pre_patch = pre_img[y:y_end, x:x_end]
            post_patch = post_img[y:y_end, x:x_end]
            loc_patch = loc_mask[y:y_end, x:x_end]
            dmg_patch = dmg_mask[y:y_end, x:x_end]

            # If edge patches are smaller, pad to tile_size
            if pre_patch.shape[0] != tile_size or pre_patch.shape[1] != tile_size:
                pad_y = tile_size - pre_patch.shape[0]
                pad_x = tile_size - pre_patch.shape[1]
                pre_patch = cv2.copyMakeBorder(pre_patch, 0, pad_y, 0, pad_x, cv2.BORDER_CONSTANT, value=0)
                post_patch = cv2.copyMakeBorder(post_patch, 0, pad_y, 0, pad_x, cv2.BORDER_CONSTANT, value=0)
                loc_patch = cv2.copyMakeBorder(loc_patch, 0, pad_y, 0, pad_x, cv2.BORDER_CONSTANT, value=0)
                dmg_patch = cv2.copyMakeBorder(dmg_patch, 0, pad_y, 0, pad_x, cv2.BORDER_CONSTANT, value=255)

            tile_prefix = f"{prefix}_tile_{tile_idx}"
            pre_save = os.path.join(output_images_dir, f"{tile_prefix}_pre.png")
            post_save = os.path.join(output_images_dir, f"{tile_prefix}_post.png")
            loc_save = os.path.join(output_masks_dir, f"{tile_prefix}_loc.png")
            dmg_save = os.path.join(output_masks_dir, f"{tile_prefix}_dmg.png")

            cv2.imwrite(pre_save, pre_patch)
            cv2.imwrite(post_save, post_patch)
            cv2.imwrite(loc_save, loc_patch)
            cv2.imwrite(dmg_save, dmg_patch)

            has_buildings = int((loc_patch > 0).any())
            unique_damages = [int(u) for u in np.unique(dmg_patch) if u != 255]

            tile_records.append({
                "tile_prefix": tile_prefix,
                "disaster": item.get("disaster", "unknown"),
                "has_buildings": has_buildings,
                "damage_classes_present": unique_damages,
                "pre_img": pre_save,
                "post_img": post_save,
                "loc_mask": loc_save,
                "dmg_mask": dmg_save,
            })
            tile_idx += 1

    return tile_records


def process_manifest(
    manifest_path: str,
    output_dir: str,
    tile_size: int = 512,
    max_workers: int = 4
) -> str:
    """
    Tiles an entire split manifest in parallel.
    """
    split_name = os.path.basename(manifest_path).replace("_manifest.json", "")
    with open(manifest_path, "r") as f:
        items = json.load(f)

    split_out_dir = os.path.join(output_dir, split_name)
    images_out = os.path.join(split_out_dir, "images")
    masks_out = os.path.join(split_out_dir, "masks")
    os.makedirs(images_out, exist_ok=True)
    os.makedirs(masks_out, exist_ok=True)

    print(f"\nTiling {len(items)} pairs for split '{split_name}' into {tile_size}x{tile_size} patches...")
    all_tile_records = []

    # Sequential or multi-threaded
    for item in tqdm(items, desc=f"Processing {split_name}"):
        records = tile_pair(item, images_out, masks_out, tile_size)
        all_tile_records.extend(records)

    index_file = os.path.join(output_dir, f"{split_name}_tiles.json")
    with open(index_file, "w") as f:
        json.dump(all_tile_records, f, indent=2)

    building_tiles = sum(1 for r in all_tile_records if r["has_buildings"])
    print(f"Split '{split_name}' complete:")
    print(f"  - Total 512x512 patches created: {len(all_tile_records)}")
    print(f"  - Patches containing buildings:  {building_tiles} ({building_tiles / max(1, len(all_tile_records)) * 100:.1f}%)")
    print(f"  - Index saved to: {index_file}")

    return index_file


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="xBD Tiling and Mask Rasterization")
    parser.add_argument("--splits_dir", default="data/splits", help="Directory containing split manifests")
    parser.add_argument("--output_dir", default="data/processed", help="Output directory for 512x512 tiles")
    parser.add_argument("--tile_size", type=int, default=512, help="Patch size")
    parser.add_argument("--split", choices=["val", "test", "train", "all"], default="val",
                        help="Which split to process (run 'val' first for rapid verification)")

    args = parser.parse_args()

    splits_to_run = ["val", "test", "train"] if args.split == "all" else [args.split]
    for s in splits_to_run:
        manifest = os.path.join(args.splits_dir, f"{s}_manifest.json")
        if os.path.exists(manifest):
            process_manifest(manifest, args.output_dir, args.tile_size)
        else:
            print(f"Manifest '{manifest}' not found. Run src/data/splitter.py first.")

