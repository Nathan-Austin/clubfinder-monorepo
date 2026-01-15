"""create music tables

Revision ID: e90e79becf37
Revises: 
Create Date: 2024-11-14 11:58:39.742087

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID 

def upgrade() -> None:
    op.create_table(
        'bar_music_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bar_id', UUID(), nullable=False),
        sa.Column('spotify_token', sa.String()),
        sa.Column('spotify_refresh_token', sa.String()),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('music_profile', sa.JSON()),
        sa.Column('last_polled', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['bar_id'], ['clubfindr.bars.id'])
    )

    op.create_table(
        'bar_tracks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bar_id', UUID(), nullable=False),
        sa.Column('track_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('artist', sa.String(), nullable=False),
        sa.Column('features', sa.JSON()),
        sa.Column('genres', sa.JSON()),
        sa.Column('played_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['bar_id'], ['clubfindr.bars.id'])
    )

    # Add indexes for performance
    op.create_index('idx_bar_tracks_bar_id', 'bar_tracks', ['bar_id'])
    op.create_index('idx_bar_tracks_played_at', 'bar_tracks', ['played_at'])

def downgrade() -> None:
    op.drop_index('idx_bar_tracks_played_at')
    op.drop_index('idx_bar_tracks_bar_id')
    op.drop_table('bar_tracks')
    op.drop_table('bar_music_profiles')


# revision identifiers, used by Alembic.
revision: str = 'e90e79becf37'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



