# migrations/versions/9a0fdfbdc643_.py
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision = "9a0fdfbdc643"
down_revision = "29cf86d01c9d"


def upgrade() -> None:
    # Change id column type from INTEGER to UUID
    with op.batch_alter_table("bar_music_profiles", schema="clubfindr") as batch_op:
        batch_op.alter_column(
            "id",
            existing_type=sa.INTEGER(),
            type_=sa.UUID(),
            postgresql_using="id::uuid",
        )

    with op.batch_alter_table("bar_tracks", schema="clubfindr") as batch_op:
        batch_op.alter_column(
            "id",
            existing_type=sa.INTEGER(),
            type_=sa.UUID(),
            postgresql_using="id::uuid",
        )


def downgrade() -> None:
    with op.batch_alter_table("bar_music_profiles", schema="clubfindr") as batch_op:
        batch_op.alter_column("id", existing_type=sa.UUID(), type_=sa.INTEGER())

    with op.batch_alter_table("bar_tracks", schema="clubfindr") as batch_op:
        batch_op.alter_column("id", existing_type=sa.UUID(), type_=sa.INTEGER())
