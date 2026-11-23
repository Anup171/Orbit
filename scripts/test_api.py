"""Integration test for FastAPI API endpoints."""
import sys
sys.path.insert(0, '.')
from fastapi.testclient import TestClient
from src.api.main import app

client = TestClient(app)

# 1. Health check
res = client.get('/api/v1/health')
print('GET /api/v1/health ->', res.status_code, res.json())
assert res.status_code == 200
assert res.json()['model_loaded'] is True

# 2. Sample triage
res = client.get('/api/v1/sample-triage')
num_feat = len(res.json().get('features', []))
print('GET /api/v1/sample-triage ->', res.status_code, f'{num_feat} features')
assert res.status_code == 200

# 3. Routes endpoint
res = client.post('/api/v1/routes', json={
    'origin_lat': 37.7749,
    'origin_lon': -122.4194,
    'destinations': [
        {'lat': 37.7745, 'lon': -122.4175, 'id': 'b3'},
        {'lat': 37.7740, 'lon': -122.4160, 'id': 'b4'}
    ],
    'top_k': 5
})
num_routes = res.json().get('total_routes', 0)
print('POST /api/v1/routes ->', res.status_code, f'{num_routes} routes computed')
assert res.status_code == 200

print('\n✓ ALL API ENDPOINT INTEGRATION TESTS PASSED!')
