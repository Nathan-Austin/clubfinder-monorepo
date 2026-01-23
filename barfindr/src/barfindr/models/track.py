from sqlalchemy import Column, String, DateTime, JSON, Float, ForeignKey, UUID
from sqlalchemy.orm import relationship
from ..database import Base
from datetime import datetime
import uuid
from .bar_reference import Bar


class BarTrack(Base):
    """
    Represents a track played at a specific bar.
    Stores track metadata and Spotify audio features.
    """

    __tablename__ = "bar_tracks"
    __table_args__ = {"schema": "clubfindr"}  # Adjust schema as needed

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bar_id = Column(UUID(as_uuid=True), ForeignKey("clubfindr.bars.id"), nullable=False)

    # Relationship to the Bar model
    bar = relationship("Bar", foreign_keys=[bar_id])

    track_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    artist = Column(String, nullable=False)
    album = Column(String)
    popularity = Column(Float)
    features = Column(JSON)
    played_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<BarTrack(id={self.id}, track={self.name}, artist={self.artist}, bar_id={self.bar_id})>"
