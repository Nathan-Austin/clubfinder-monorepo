"""empty message

Revision ID: 7867ac1d6519
Revises: 9a0fdfbdc643
Create Date: 2024-11-14 15:41:24.130421

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7867ac1d6519'
down_revision: Union[str, None] = '9a0fdfbdc643'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Drop old sequences since we're using UUID now
    op.execute('DROP SEQUENCE IF EXISTS clubfindr.bar_tracks_id_seq')
    op.execute('DROP SEQUENCE IF EXISTS clubfindr.bar_music_profiles_id_seq')

def downgrade():
    # Recreate sequences if needed
    op.execute('CREATE SEQUENCE IF NOT EXISTS clubfindr.bar_tracks_id_seq')
    op.execute('CREATE SEQUENCE IF NOT EXISTS clubfindr.bar_music_profiles_id_seq')
