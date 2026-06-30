"""
Shared logger for the F1 tracker.

Import `logger` from this module in every other file — don't call
logging.getLogger() directly elsewhere. That keeps the format and level
consistent across the whole project from one place.
"""

import logging
import sys


def _build_logger() -> logging.Logger:
    logger = logging.getLogger("f1_tracker")

    # Guard against duplicate handlers if this module is imported more than
    # once in the same process (can happen in tests or interactive shells).
    if logger.handlers:
        return logger

    logger.setLevel(logging.DEBUG)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)

    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)-8s %(name)s.%(module)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    return logger


logger = _build_logger()