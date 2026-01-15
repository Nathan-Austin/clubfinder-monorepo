from sqlalchemy import TypeDecorator, String
import uuid

class SqliteUUID(TypeDecorator):
    """SQLite-friendly UUID type.
    Uses a string to store UUIDs to work around SQLite's lack of native UUID support.
    """
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
