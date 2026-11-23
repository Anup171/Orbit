"""
Workers Package
---------------
Celery background workers for ONNX inference.
"""

from src.workers.celery_app import celery_app
from src.workers.tasks import predict_damage

__all__ = ["celery_app", "predict_damage"]
