#!/usr/bin/env python3
"""
Wrapper for Spotify Automation cleanup
"""

import sys
import logging
import os

# Ensure we can import from src
sys.path.append(os.path.join(os.path.dirname(__file__), "src"))

from spotify_automation.core.cleanup import (  # noqa: E402
    cleanup_processes,
    print_active_selenium_processes,
)

# Configure basic logging for standalone run
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

if __name__ == "__main__":
    print_active_selenium_processes()
    cleanup_processes()
