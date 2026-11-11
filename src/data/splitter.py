"""
Dataset Splitting Module (Event-Based Splits)
--------------------------------------------
Implements disaster-event held-out splits according to Section 4 of the proposal.
Holding out entire disaster events prevents spatial roof-memorization and guarantees
realistic generalizability to unseen disasters.
"""

import os
import glob
import json
import random
from typing import Dict, List, Tuple


# Default split strategy: hold out 2 diverse disasters for validation, 1 for testing
DEFAULT_VAL_DISASTERS = ["guatemala-volcano", "hurricane-michael"]
DEFAULT_TEST_DISASTERS = ["palu-tsunami"]


def discover_image_pairs(raw_train_dir: str) -> Dict[str, List[Dict[str, str]]]:
    """
    Groups pre- and post-disaster image paths and their label JSONs by disaster event.
    """
    images_dir = os.path.join(raw_train_dir, "images")
    labels_dir = os.path.join(raw_train_dir, "labels")

    post_labels = glob.glob(os.path.join(labels_dir, "*_post_disaster.json"))
    disaster_groups: Dict[str, List[Dict[str, str]]] = {}

    for post_json in post_labels:
        base_name = os.path.basename(post_json)
        prefix = base_name.replace("_post_disaster.json", "")
        disaster_name = prefix.split("_")[0]

        pre_json = os.path.join(labels_dir, f"{prefix}_pre_disaster.json")
        pre_img = os.path.join(images_dir, f"{prefix}_pre_disaster.png")
        post_img = os.path.join(images_dir, f"{prefix}_post_disaster.png")

        # Verify that all corresponding files exist
        if not (os.path.exists(pre_json) and os.path.exists(pre_img) and os.path.exists(post_img)):
            continue

        item = {
            "prefix": prefix,
            "disaster": disaster_name,
            "pre_img": pre_img,
            "post_img": post_img,
            "pre_json": pre_json,
            "post_json": post_json,
        }

        if disaster_name not in disaster_groups:
            disaster_groups[disaster_name] = []
        disaster_groups[disaster_name].append(item)

    return disaster_groups


def create_event_splits(
    raw_train_dir: str,
    output_dir: str = "data/splits",
    val_disasters: List[str] = None,
    test_disasters: List[str] = None,
) -> Tuple[int, int, int]:
    """
    Creates train, val, and test JSON split manifests partitioned strictly by disaster event.
    """
    os.makedirs(output_dir, exist_ok=True)
    val_disasters = val_disasters or DEFAULT_VAL_DISASTERS
    test_disasters = test_disasters or DEFAULT_TEST_DISASTERS

    disaster_groups = discover_image_pairs(raw_train_dir)
    all_events = sorted(list(disaster_groups.keys()))

    train_items: List[Dict[str, str]] = []
    val_items: List[Dict[str, str]] = []
    test_items: List[Dict[str, str]] = []

    for event in all_events:
        items = disaster_groups[event]
        if event in test_disasters:
            test_items.extend(items)
        elif event in val_disasters:
            val_items.extend(items)
        else:
            train_items.extend(items)

    # Save manifest files
    splits = {
        "train": train_items,
        "val": val_items,
        "test": test_items,
    }

    manifest_metadata = {
        "all_disaster_events": all_events,
        "train_disasters": [e for e in all_events if e not in val_disasters and e not in test_disasters],
        "val_disasters": val_disasters,
        "test_disasters": test_disasters,
        "counts": {
            "train": len(train_items),
            "val": len(val_items),
            "test": len(test_items),
            "total_pairs": len(train_items) + len(val_items) + len(test_items),
        },
    }

    for split_name, items in splits.items():
        split_file = os.path.join(output_dir, f"{split_name}_manifest.json")
        with open(split_file, "w") as f:
            json.dump(items, f, indent=2)

    with open(os.path.join(output_dir, "metadata.json"), "w") as f:
        json.dump(manifest_metadata, f, indent=2)

    print(f"Generated event splits in '{output_dir}':")
    print(f"  - Train: {len(train_items)} pairs across {manifest_metadata['train_disasters']}")
    print(f"  - Val:   {len(val_items)} pairs across {val_disasters}")
    print(f"  - Test:  {len(test_items)} pairs across {test_disasters}")

    return len(train_items), len(val_items), len(test_items)


if __name__ == "__main__":
    create_event_splits("data/raw/train")

