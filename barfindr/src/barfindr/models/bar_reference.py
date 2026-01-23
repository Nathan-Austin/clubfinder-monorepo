import uuid
from datetime import datetime

from sqlalchemy import UUID, Boolean, Column, DateTime, String
from sqlalchemy.orm import declarative_base

# Use a separate base to avoid conflicts with our other models
BarBase = declarative_base()


class Bar(BarBase):
    """
    Reference model for the Bar from the Clubfindr project.
    This ensures foreign key relationships can be established.
    """

    __tablename__ = "bars"
    __table_args__ = {"schema": "clubfindr"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Bar(id={self.id}, name={self.name})>"
