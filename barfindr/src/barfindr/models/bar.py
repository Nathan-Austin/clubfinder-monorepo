import uuid
from datetime import datetime

from sqlalchemy import UUID, Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship

from ..database import Base


class Bar(Base):
    __tablename__ = "bars"
    __table_args__ = {"schema": "clubfindr"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    contact_person = Column(String(255), nullable=False)
    general_email = Column(String(255), nullable=False, unique=True)
    phone = Column(String(20))
    address = Column(Text)
    postcode = Column(String(20))
    website = Column(String(255))
    music_service = Column(String(50))
    spotify_access_token = Column(String(1024))
    spotify_refresh_token = Column(String(1024))
    city = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    confirmed = Column(Boolean, default=False)

    # New fields
    smoking_allowed = Column(Boolean, default=False, nullable=False)
    bar_types = Column(ARRAY(String), default=[], nullable=False)

    genre_profiles = relationship(
        "BarGenreProfile", back_populates="bar", cascade="all, delete-orphan"
    )
    genre_aggregates = relationship(
        "BarGenreAggregate", back_populates="bar", cascade="all, delete-orphan"
    )


class BarMusicProfile(Base):
    __tablename__ = "bar_music_profiles"
    __table_args__ = {"schema": "clubfindr"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bar_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clubfindr.bars.id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    current_artist = Column(String(255))
    current_track = Column(String(255))

    is_active = Column(Boolean, default=True)
    last_updated = Column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    genre = Column(Text)
    music_style = Column(Text)

    bar = relationship("Bar", backref="music_profile")

    def __repr__(self):
        return f"<BarMusicProfile(id={self.id}, bar_id={self.bar_id}, artist={self.current_artist}, track={self.current_track})>"
