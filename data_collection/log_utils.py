import hashlib
import os


def pii_logging_enabled():
    """Return True when raw identifiers are allowed in logs."""
    return os.getenv("CLUBFINDER_LOG_PII", "").lower() in {"1", "true", "yes"}


def redact_identifier(value, label="id"):
    """Return a stable, non-PII token for logging identifiers."""
    if value is None or value == "":
        return f"{label}:unknown"

    text = str(value)
    if pii_logging_enabled():
        return text

    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:10]
    return f"{label}:{digest}"


def redact_list(values, label="items"):
    """Return a count-only representation for lists unless PII logging is enabled."""
    if values is None:
        return f"{label}:0"
    if pii_logging_enabled():
        return values
    return f"{label}:{len(values)}"
