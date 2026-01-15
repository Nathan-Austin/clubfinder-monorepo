"""empty message

Revision ID: c192d6d5e2af
Revises: 7867ac1d6519
Create Date: 2024-11-14 15:42:37.636868

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c192d6d5e2af'
down_revision: Union[str, None] = '7867ac1d6519'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute('DROP SEQUENCE IF EXISTS clubfindr.bar_tracks_id_seq CASCADE')
    op.execute('DROP SEQUENCE IF EXISTS clubfindr.bar_music_profiles_id_seq CASCADE')

def downgrade():
    pass
