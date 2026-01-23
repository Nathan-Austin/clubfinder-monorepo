"""add genre profile tables

Revision ID: ead0a432cf18
Revises: 57c807cf3312
Create Date: 2024-11-15 22:38:07.423560

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "ead0a432cf18"
down_revision: Union[str, None] = "57c807cf3312"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create bar_genre_profiles table
    op.create_table(
        "bar_genre_profiles",
        sa.Column(
            "id",
            postgresql.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("bar_id", postgresql.UUID(), nullable=False),
        sa.Column(
            "timestamp",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("current_track_id", sa.String(), nullable=True),
        sa.Column("current_track_name", sa.String(), nullable=True),
        sa.Column("current_genres", postgresql.JSONB(), nullable=True),
        sa.Column("rolling_genre_profile", postgresql.JSONB(), nullable=True),
        sa.Column("immediate_genre_profile", postgresql.JSONB(), nullable=True),
        sa.Column("track_counts", postgresql.JSONB(), nullable=True),
        sa.ForeignKeyConstraint(["bar_id"], ["clubfindr.bars.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="clubfindr",
    )

    # Create bar_genre_aggregates table
    op.create_table(
        "bar_genre_aggregates",
        sa.Column(
            "id",
            postgresql.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("bar_id", postgresql.UUID(), nullable=False),
        sa.Column("genre", sa.String(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column(
            "last_updated",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["bar_id"], ["clubfindr.bars.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="clubfindr",
    )

    # Create indices
    op.create_index(
        "idx_bar_genre_profiles_bar_id_timestamp",
        "clubfindr.bar_genre_profiles",
        ["bar_id", "timestamp"],
    )

    op.create_index(
        "idx_bar_genre_aggregates_bar_id_genre",
        "clubfindr.bar_genre_aggregates",
        ["bar_id", "genre"],
        unique=True,
    )

    # Drop old bar_tracks table if it exists
    op.drop_table("bar_tracks", schema="clubfindr")


def downgrade() -> None:
    # Drop the new tables
    op.drop_table("clubfindr.bar_genre_aggregates")
    op.drop_table("clubfindr.bar_genre_profiles")

    # Recreate the old bar_tracks table
    op.create_table(
        "clubfindr.bar_tracks",
        sa.Column(
            "id",
            postgresql.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("bar_id", postgresql.UUID(), nullable=False),
        sa.Column("track_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("artist", sa.String(), nullable=True),
        sa.Column("album", sa.String(), nullable=True),
        sa.Column("popularity", sa.Integer(), nullable=True),
        sa.Column("features", postgresql.JSONB(), nullable=True),
        sa.Column("played_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["bar_id"], ["clubfindr.bars.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
