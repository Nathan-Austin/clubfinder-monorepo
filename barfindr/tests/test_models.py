import pytest
from sqlalchemy import (
    create_engine,
    Column,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    text,
    MetaData,
)
from sqlalchemy.orm import sessionmaker, relationship, declarative_base, backref
from datetime import datetime
import uuid
from sqlalchemy import TypeDecorator, String

# Create a separate Base for tests
TestBase = declarative_base()


class SqliteUUID(TypeDecorator):
    """SQLite-friendly UUID type."""

    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif isinstance(value, uuid.UUID):
            return str(value)
        else:
            return str(uuid.UUID(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            return uuid.UUID(value)


# Create test-specific models with SQLite-compatible UUID
class TestBar(TestBase):
    __tablename__ = "test_bars"
    __table_args__ = {"schema": "clubfindr"}

    id = Column(SqliteUUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    contact_person = Column(String(255), nullable=False)
    general_email = Column(String(255), nullable=False, unique=True)
    phone = Column(String(20))
    address = Column(String)
    postcode = Column(String(20))
    website = Column(String(255))
    music_service = Column(String(50))
    spotify_access_token = Column(String(1024))
    spotify_refresh_token = Column(String(1024))
    city = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    confirmed = Column(Boolean, default=False)


class TestBarMusicProfile(TestBase):
    __tablename__ = "test_bar_music_profiles"
    __table_args__ = {"schema": "clubfindr"}

    id = Column(SqliteUUID(), primary_key=True, default=uuid.uuid4)
    bar_id = Column(
        SqliteUUID(),
        ForeignKey("clubfindr.test_bars.id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    current_artist = Column(String(255))
    current_track = Column(String(255))
    is_active = Column(Boolean, default=True)
    last_updated = Column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
    genre = Column(String)
    music_style = Column(String)
    bar = relationship("TestBar", backref=backref("music_profile", uselist=False))


@pytest.fixture(scope="module")
def engine():
    # Use an in-memory SQLite database for testing
    engine = create_engine("sqlite:///:memory:", echo=True)

    # Create schema if it doesn't exist (SQLite doesn't support schemas, this is just for compatibility)
    with engine.connect() as conn:
        conn.execute(text("ATTACH DATABASE ':memory:' AS clubfindr;"))

    return engine


@pytest.fixture(scope="module")
def tables(engine):
    # Create all tables in the test database
    TestBase.metadata.create_all(engine)
    yield
    TestBase.metadata.drop_all(engine)


@pytest.fixture
def session(engine, tables):
    """Returns an sqlalchemy session, and after the test tears down everything properly."""
    connection = engine.connect()
    # begin the nested transaction
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()

    yield session

    session.close()
    # roll back the broader transaction
    transaction.rollback()
    connection.close()


def test_bar_creation(session):
    bar = TestBar(
        name="Test Bar",
        contact_person="John Doe",
        general_email="test@example.com",
        phone="1234567890",
        address="123 Test St",
        postcode="12345",
        city="Test City",
    )
    session.add(bar)
    session.commit()

    # Verify bar was created
    assert bar.id is not None
    assert bar.name == "Test Bar"
    assert bar.created_at is not None
    assert bar.updated_at is not None
    assert bar.confirmed is False


def test_bar_music_profile_creation(session):
    bar = TestBar(
        name="Music Bar",
        contact_person="Jane Doe",
        general_email="music@example.com",
        city="Music City",
    )
    session.add(bar)
    session.commit()

    music_profile = TestBarMusicProfile(
        bar_id=bar.id,
        current_artist="Test Artist",
        current_track="Test Track",
        genre="Rock",
        music_style="Alternative",
    )
    session.add(music_profile)
    session.commit()

    # Verify music profile was created
    assert music_profile.id is not None
    assert music_profile.bar_id == bar.id
    assert music_profile.current_artist == "Test Artist"
    assert music_profile.is_active is True
    assert music_profile.last_updated is not None


def test_bar_music_profile_relationship(session):
    bar = TestBar(
        name="Relationship Bar",
        contact_person="Relationship Doe",
        general_email="relationship@example.com",
        city="Relationship City",
    )
    session.add(bar)
    session.commit()

    music_profile = TestBarMusicProfile(
        bar_id=bar.id,
        current_artist="Relationship Artist",
        current_track="Relationship Track",
    )
    session.add(music_profile)
    session.commit()

    # Test bidirectional relationship
    assert bar.music_profile == music_profile
    assert music_profile.bar == bar


def test_bar_unique_email_constraint(session):
    bar1 = TestBar(
        name="First Bar",
        contact_person="First Contact",
        general_email="unique@example.com",
        city="First City",
    )
    session.add(bar1)
    session.commit()

    # Try to create another bar with same email (should raise integrity error)
    bar2 = TestBar(
        name="Second Bar",
        contact_person="Second Contact",
        general_email="unique@example.com",
        city="Second City",
    )

    with pytest.raises(Exception):  # SQLAlchemy will raise an IntegrityError
        session.add(bar2)
        session.commit()


def test_bar_music_profile_timestamps(session):
    bar = TestBar(
        name="Timestamp Bar",
        contact_person="Timestamp Doe",
        general_email="timestamp@example.com",
        city="Timestamp City",
    )
    session.add(bar)
    session.commit()

    music_profile = TestBarMusicProfile(
        bar_id=bar.id,
        current_artist="Timestamp Artist",
        current_track="Timestamp Track",
    )
    session.add(music_profile)
    session.commit()

    # Check initial timestamp
    initial_timestamp = music_profile.last_updated

    # Update the music profile
    music_profile.current_artist = "New Artist"
    session.commit()

    # Verify timestamp was updated
    assert music_profile.last_updated > initial_timestamp
