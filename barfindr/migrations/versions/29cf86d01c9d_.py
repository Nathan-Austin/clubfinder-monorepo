"""empty message

Revision ID: 29cf86d01c9d
Revises: e90e79becf37
Create Date: 2024-11-14 15:31:24.396149
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision: str = "29cf86d01c9d"
down_revision: Union[str, None] = "e90e79becf37"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check existing tables
    schema = "clubfindr"
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names(schema=schema)

    if "bar_music_profiles" not in existing_tables:
        op.create_table(
            "bar_music_profiles",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("bar_id", sa.UUID(), nullable=False),
            sa.Column("current_artist", sa.String(length=255), nullable=True),
            sa.Column("current_track", sa.String(length=255), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.Column("last_updated", sa.DateTime(timezone=True), nullable=True),
            sa.Column("genre", sa.Text(), nullable=True),
            sa.Column("music_style", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(
                ["bar_id"],
                ["clubfindr.bars.id"],
                onupdate="CASCADE",
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("bar_id"),
            schema="clubfindr",
        )

    if "bar_tracks" not in existing_tables:
        op.create_table(
            "bar_tracks",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("bar_id", sa.UUID(), nullable=False),
            sa.Column("track_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("artist", sa.String(), nullable=False),
            sa.Column("album", sa.String(), nullable=True),
            sa.Column("popularity", sa.Float(), nullable=True),
            sa.Column("features", sa.JSON(), nullable=True),
            sa.Column("played_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["bar_id"], ["clubfindr.bars.id"]),
            sa.PrimaryKeyConstraint("id"),
            schema="clubfindr",
        )


def downgrade() -> None:
    # Skip dropping tables
    pass
