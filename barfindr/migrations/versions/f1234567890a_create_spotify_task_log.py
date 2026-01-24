"""create spotify task log

Revision ID: f1234567890a
Revises: ead0a432cf18
Create Date: 2026-01-24 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f1234567890a"
down_revision: Union[str, None] = "ead0a432cf18"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "spotify_task_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("task_id", sa.String(length=255), nullable=False),
        sa.Column("task_name", sa.String(length=255), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=True),
        sa.Column("entity_id", postgresql.UUID(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("retries", sa.Integer(), server_default="0", nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id"),
        schema="clubfindr"
    )
    op.create_index(
        "idx_spotify_task_entity",
        "spotify_task_log",
        ["entity_type", "entity_id"],
        schema="clubfindr"
    )
    op.create_index(
        "idx_spotify_task_status",
        "spotify_task_log",
        ["status"],
        schema="clubfindr"
    )


def downgrade() -> None:
    op.drop_index("idx_spotify_task_status", table_name="spotify_task_log", schema="clubfindr")
    op.drop_index("idx_spotify_task_entity", table_name="spotify_task_log", schema="clubfindr")
    op.drop_table("spotify_task_log", schema="clubfindr")
