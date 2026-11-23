"""Audit script: checks model checkpoint, data pipeline, and all import chains."""
import sys, json, os
sys.path.insert(0, '.')

print("=== STAGE 2: Model & Training Checks ===")
import torch
ckpt_path = "checkpoints/best_siamese_resnet34.pt"
if os.path.exists(ckpt_path):
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    print(f"  Checkpoint keys: {list(ckpt.keys())}")
    print(f"  Epoch: {ckpt.get('epoch', '?')}")
    print(f"  Fusion mode: {ckpt.get('fusion_mode', '?')}")
    if "metrics" in ckpt:
        m = ckpt["metrics"]
        print(f"  xView2={m.get('xview2_score','?')}, loc_f1={m.get('loc_f1','?')}, dmg_f1={m.get('dmg_macro_f1','?')}")
    from src.models.siamese_resnet import SiameseResNet34
    model = SiameseResNet34(pretrained=False, fusion_mode=ckpt.get("fusion_mode","concat_diff_prod"))
    model.load_state_dict(ckpt["model_state"])
    total = sum(p.numel() for p in model.parameters())
    print(f"  Model loaded OK. Params: {total:,}")
    
    # Verify forward pass
    dummy_pre = torch.randn(1, 3, 512, 512)
    dummy_post = torch.randn(1, 3, 512, 512)
    model.eval()
    with torch.no_grad():
        out = model(dummy_pre, dummy_post)
    print(f"  Forward pass OK: loc_logits={out['loc_logits'].shape}, dmg_logits={out['dmg_logits'].shape}")
else:
    print(f"  MISSING checkpoint: {ckpt_path}")

print()
print("=== STAGE 1: Data Tile Index Checks ===")
for name in ["train_tiles.json", "val_tiles.json", "test_tiles.json"]:
    path = f"data/processed/{name}"
    if os.path.exists(path):
        size = os.path.getsize(path)
        if size == 0:
            print(f"  CRITICAL: {name} is EMPTY (0 bytes) - training cannot load data!")
        else:
            with open(path) as f:
                data = json.load(f)
            if isinstance(data, list) and len(data) > 0:
                print(f"  OK {name}: {len(data)} records")
                r = data[0]
                print(f"     Keys: {list(r.keys())}")
                # Check first record paths
                for k in ["pre_img", "post_img", "loc_mask", "dmg_mask"]:
                    if k in r and not os.path.exists(r[k]):
                        print(f"     ISSUE: {k} path not found: {r[k]}")
                    elif k in r:
                        print(f"     OK {k}: path exists")
            else:
                print(f"  WARN {name}: empty list or not a list")
    else:
        print(f"  MISSING {name}")

print()
print("=== STAGE 3: Eval & Calibration ===")
try:
    from src.evaluation.calibration import compute_ece, TemperatureScaler, calibrate_temperature, flag_uncertain_buildings, compute_reliability_diagram
    print("  OK calibration.py: all 5 exports")
except Exception as e:
    print(f"  FAIL calibration.py: {e}")

print()
print("=== STAGE 4: Triage Module ===")
try:
    from src.triage import (
        BuildingAssessment, compute_priority_scores, buildings_to_summary,
        RoadNetwork, TriagePipeline, run_triage, predictions_to_buildings, geojson_to_buildings
    )
    print("  OK triage __init__: all 8 exports")
    buildings = geojson_to_buildings("stubs/sample_triage.geojson")
    ranked = compute_priority_scores(buildings, confidence_threshold=0.6)
    summary = buildings_to_summary(ranked)
    tb = summary["total_buildings"]
    print(f"  OK pipeline test: {tb} buildings ranked")
except Exception as e:
    print(f"  FAIL triage: {e}")

print()
print("=== STAGE 5: Backend ===")
try:
    from src.database.connection import engine, SessionLocal, Base, get_db, init_db
    print("  OK database.connection")
except Exception as e:
    print(f"  FAIL database.connection: {e}")

try:
    from src.database.models import AssessmentJob, BuildingRecord
    print("  OK database.models")
except Exception as e:
    print(f"  FAIL database.models: {e}")

try:
    from src.api.schemas import PredictRequest, TriageRequest, JobCreatedResponse, JobStatusResponse, JobResultsResponse, BuildingResponse, HealthResponse
    print("  OK api.schemas: all 7 schemas")
except Exception as e:
    print(f"  FAIL api.schemas: {e}")

try:
    from src.workers.celery_app import celery_app
    print(f"  OK celery_app")
except Exception as e:
    print(f"  FAIL celery_app: {e}")

try:
    from src.api.main import app
    paths = list(app.openapi()['paths'].keys())
    print(f"  OK FastAPI app: {len(paths)} API endpoints: {paths}")
except Exception as e:
    print(f"  FAIL api.main: {e}")

try:
    init_db()
    db = SessionLocal()
    from sqlalchemy import inspect as sqla_inspect
    inspector = sqla_inspect(engine)
    tables = inspector.get_table_names()
    print(f"  OK database tables: {tables}")
    db.close()
except Exception as e:
    print(f"  FAIL DB init: {e}")

print()
print("=== CROSS-STAGE INTEGRATION CHECKS ===")
# Check train.py references correct dataset/model paths
issues = []

# 1. train_tiles.json is empty
if os.path.exists("data/processed/train_tiles.json") and os.path.getsize("data/processed/train_tiles.json") == 0:
    issues.append("CRITICAL: train_tiles.json is 0 bytes - training used val_tiles as fallback")

# 2. geotransforms.json missing
if not os.path.exists("data/raw/geotransforms.json"):
    issues.append("WARN: geotransforms.json missing - geo-referencing unavailable")

# 3. ONNX model not exported yet
if not os.path.exists("checkpoints/siamese_resnet34.onnx"):
    issues.append("WARN: ONNX model not yet exported (run scripts/export_onnx.py)")

# 4. Frontend Dockerfile missing
if not os.path.exists("frontend/Dockerfile"):
    issues.append("CRITICAL: frontend/Dockerfile missing - docker-compose frontend service will fail")

# 5. Vite expects index.html at frontend root, not in public/
if not os.path.exists("frontend/index.html") and os.path.exists("frontend/public/index.html"):
    issues.append("CRITICAL: Vite expects index.html at frontend/ root, not in public/")

# 6. Check processed train has matching images and masks
train_imgs = len(os.listdir("data/processed/train/images")) if os.path.isdir("data/processed/train/images") else 0
train_masks = len(os.listdir("data/processed/train/masks")) if os.path.isdir("data/processed/train/masks") else 0
if train_imgs > 0 and train_masks > 0 and train_imgs != train_masks:
    issues.append(f"WARN: train images ({train_imgs}) != masks ({train_masks}) count mismatch")

# 7. uploads directory
if not os.path.exists("data/uploads"):
    issues.append("MINOR: data/uploads/ does not exist (created on first API request)")

# 8. graph cache directory
if not os.path.exists("data/graphs"):
    issues.append("MINOR: data/graphs/ does not exist (created on first triage run)")

for i, issue in enumerate(issues, 1):
    print(f"  [{i}] {issue}")

if not issues:
    print("  No issues found!")

print(f"\nTotal issues: {len(issues)}")
