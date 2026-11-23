"""
Database ORM Models
-------------------
Defines schema for disaster assessment jobs, per-building damage results,
and emergency route geometries.
"""

from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    Text,
    ForeignKey
)
from sqlalchemy.orm import relationship
from src.database.connection import Base


class AssessmentJob(Base):
    __tablename__ = "assessment_jobs"

    id = Column(String(64), primary_key=True, index=True)
    status = Column(String(32), default="pending", index=True)  # pending, processing, completed, failed
    pre_image_path = Column(String(512), nullable=True)
    post_image_path = Column(String(512), nullable=True)
    staging_lat = Column(Float, nullable=True)
    staging_lon = Column(Float, nullable=True)
    total_buildings = Column(Integer, default=0)
    flagged_for_review = Column(Integer, default=0)
    summary_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    buildings = relationship("BuildingRecord", back_populates="job", cascade="all, delete-orphan")


class BuildingRecord(Base):
    __tablename__ = "building_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(64), ForeignKey("assessment_jobs.id"), index=True)
    building_id = Column(String(64), index=True)
    damage_class = Column(String(32), index=True)  # no-damage, minor-damage, major-damage, destroyed
    damage_score = Column(Float, default=0.0)
    area_sq_m = Column(Float, default=0.0)
    priority_rank = Column(Integer, default=0)
    priority_score = Column(Float, default=0.0)
    confidence = Column(Float, default=1.0)
    needs_manual_review = Column(Boolean, default=False)
    centroid_lat = Column(Float, default=0.0)
    centroid_lon = Column(Float, default=0.0)
    travel_time_minutes = Column(Float, nullable=True)
    geometry_json = Column(Text, nullable=True)

    job = relationship("AssessmentJob", back_populates="buildings")
