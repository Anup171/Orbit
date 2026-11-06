# Satellite Disaster Damage Assessment & Triage System (Phase 2)
**BMS College of Engineering, Dept. of CSE (Data Science)**  
*Faculty Guide: Prof. Sunag P.*

---

## 1. Project Overview
An end-to-end disaster damage assessment platform using high-resolution pre- and post-disaster satellite imagery pairs. The system performs:
1. **Single-Pass Building Localization & 4-Class Damage Assessment** (No-damage, Minor-damage, Major-damage, Destroyed) using a Siamese ResNet-34.
2. **Confidence Calibration** via Temperature Scaling (flagging uncertain buildings for manual review).
3. **Smart Triage & Road Routing** via OSMnx and OpenStreetMap.
4. **Interactive Web App** with React, MapLibre, FastAPI, Celery, and PostGIS.

---

## 2. Directory Structure & Team Ownership

```text
DLG-Rayhan(SP)/
├── configs/
│   └── config.yaml             # Hyperparameters, paths, loss weights, class mapping
├── data/                       # (Git-ignored)
│   ├── raw/
│   │   ├── train/              # 5,598 images + 5,598 JSON polygon labels
│   │   │   ├── images/
│   │   │   └── labels/
│   │   ├── test/               # 1,866 test images
│   │   │   └── images/
│   │   └── geotransforms.json  # GPS coordinate transformation metadata
│   ├── processed/              # 512x512 tiled patches & generated binary/damage masks
│   └── splits/                 # Disaster event-based cross-validation splits
├── docker/
│   ├── Dockerfile.api          # [M3] FastAPI container
│   ├── Dockerfile.worker       # [M3] Celery worker container
│   └── docker-compose.yml      # [M3] Services orchestration (API, Redis, PostGIS, Worker)
├── frontend/                   # [M4] React + MapLibre UI
│   └── src/components/
│       ├── SwipeMap.jsx        # Pre/post comparison swipe
│       ├── DamageLayer.jsx     # Color-coded damage polygons
│       └── RoutePanel.jsx      # Triage list & rescue team routes
├── notebooks/                  # EDA, baseline reproduction, calibration experiments
├── scripts/
│   ├── preprocess_tiling.py    # [M1] Slices 1024x1024 to 512x512 patches
│   ├── train.py                # [M2] Model training loop
│   ├── run_ablations.py        # [M2] 3-seed ablation experiments
│   ├── evaluate.py             # [M1] xView2 composite F1 & ECE evaluation
│   └── export_onnx.py          # [M2] Exports PyTorch weights to ONNX format
├── src/
│   ├── api/                    # [M3] FastAPI routes and request/response schemas
│   ├── data/                   # [M1] Dataset classes, augmentations, and balanced samplers
│   ├── database/               # [M3] PostGIS models & database connection
│   ├── evaluation/             # [M1] Metrics and temperature scaling calibration
│   ├── models/                 # [M2] Siamese ResNet-34, fusion layers, and loss functions
│   ├── triage/                 # [M4] Expected damage severity & OSMnx road router
│   └── workers/                # [M3] Celery tasks for background ONNX inference
├── stubs/                      # Mock implementations for parallel team development
│   ├── mock_onnx_runner.py     # Simulates model output for M3 backend testing
│   └── sample_triage.geojson   # Sample damage polygons and route for M4 frontend testing
├── .gitignore
├── requirements.txt
└── README.md
```

---

## 3. Team Division & Immediate Next Steps

* **M1 (Data & Evaluation):**
  * Write `scripts/preprocess_tiling.py` to tile the 1024×1024 images into 512×512 patches.
  * Create disaster-based splits in `data/splits/` (holding out whole disaster events).
* **M2 (Model Architecture):**
  * Build the Siamese ResNet-34 model in `src/models/` with multi-stage fusion (difference + product).
  * Implement Focal + Dice loss for the rare Minor and Major damage classes.
* **M3 (Backend & DevOps):**
  * Wire the FastAPI `/predict` and `/routes` endpoints using `stubs/mock_onnx_runner.py`.
  * Set up Redis and Celery worker.
* **M4 (Frontend & Triage):**
  * Build the MapLibre map component using `stubs/sample_triage.geojson`.
  * Implement OSMnx graph loading in `src/triage/routing.py`.

