# models/bar_profile.py
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from ..database import Base
from .bar import Bar


class BarGenreProfile(Base):
    __tablename__ = "bar_genre_profiles"
    __table_args__ = {"schema": "clubfindr"}
    id = Column(UUID, primary_key=True, server_default="gen_random_uuid()")
    bar_id = Column(UUID, ForeignKey("clubfindr.bars.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Current track info
    current_track_id = Column(String)
    current_track_name = Column(String)
    current_genres = Column(JSON)  # List of genres

    # Genre profiles
    rolling_genre_profile = Column(JSON)  # Dict of genre weights
    immediate_genre_profile = Column(JSON)  # Dict of genre weights

    # Metadata
    track_counts = Column(JSON)  # Dict with recent/queued counts

    # Relationships
    bar = relationship("Bar", back_populates="genre_profiles")

    def __repr__(self):
        return f"<BarGenreProfile(bar_id={self.bar_id}, timestamp={self.timestamp})>"


class BarGenreAggregate(Base):
    __tablename__ = "bar_genre_aggregates"
    __table_args__ = {"schema": "clubfindr"}
    id = Column(UUID, primary_key=True, server_default="gen_random_uuid()")
    bar_id = Column(UUID, ForeignKey("clubfindr.bars.id"), nullable=False)
    genre = Column(String, nullable=False)
    weight = Column(Float, nullable=False)
    last_updated = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    bar = relationship("Bar", back_populates="genre_aggregates")

    __table_args__ = (Index("idx_bar_genre", bar_id, genre, unique=True),)

    def __repr__(self):
        return f"<BarGenreAggregate(bar_id={self.bar_id}, genre={self.genre}, weight={self.weight})>"
