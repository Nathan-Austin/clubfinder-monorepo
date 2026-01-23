import json
import logging
import os


def get_graphql_template_path():
    """Return the absolute path to the GraphQL query template."""
    return os.path.join(os.path.dirname(__file__), "graphql_query_template.json")


def load_graphql_query_template():
    """Load the default GraphQL query template from disk."""
    template_path = get_graphql_template_path()
    with open(template_path, "r") as file:
        return json.load(file)


def parse_graphql_response(
    payload, path, context="GraphQL response", logger=None, expected_type=None
):
    """Extract a nested value from a GraphQL payload with basic validation."""
    if logger is None:
        logger = logging.getLogger(__name__)

    if not isinstance(payload, dict):
        logger.error("%s is not a JSON object", context)
        return None

    errors = payload.get("errors")
    if errors:
        logger.error("%s returned errors: %s", context, errors)
        return None

    data = payload.get("data")
    if data is None:
        logger.error("%s missing 'data' field", context)
        return None

    current = data
    for key in path:
        if not isinstance(current, dict) or key not in current:
            logger.error("%s missing key path: %s", context, " -> ".join(path))
            return None
        current = current[key]

    if expected_type is not None and not isinstance(current, expected_type):
        logger.error(
            "%s has unexpected type (expected %s, got %s)",
            context,
            expected_type.__name__,
            type(current).__name__,
        )
        return None

    return current
