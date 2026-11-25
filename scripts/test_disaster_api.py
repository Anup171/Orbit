import urllib.request
import json

base = "http://127.0.0.1:8000/api/v1"

with urllib.request.urlopen(f"{base}/health") as r:
    print("Health:", json.loads(r.read()))

with urllib.request.urlopen(f"{base}/disasters") as r:
    catalog = json.loads(r.read())
    events = sorted(set(d["event"] for d in catalog))
    print(f"Catalog scenes: {len(catalog)}, Events ({len(events)}): {events}")

with urllib.request.urlopen(f"{base}/disasters/zones") as r:
    zones = json.loads(r.read())
    print(f"Global zones GeoJSON features: {len(zones['features'])}")

with urllib.request.urlopen(f"{base}/disasters/mexico-earthquake_00000052/info") as r:
    info = json.loads(r.read())
    print(f"Scene info: {info['name']}, top-left corner: {info['image_coords'][0]}")

with urllib.request.urlopen(f"{base}/disasters/santa-rosa-wildfire_00000084/pre-image") as r:
    pre_bytes = len(r.read())

with urllib.request.urlopen(f"{base}/disasters/santa-rosa-wildfire_00000084/post-image") as r:
    post_bytes = len(r.read())

print(f"Santa Rosa pre={pre_bytes:,} bytes, post={post_bytes:,} bytes")

with urllib.request.urlopen("http://127.0.0.1:3000") as r:
    print(f"Frontend HTTP status: {r.status}")
