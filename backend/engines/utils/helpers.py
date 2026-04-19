# Shared Utility Functions

from __future__ import annotations

import time
import sys
from contextlib import contextmanager
from loguru     import logger

from backend.config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    logger.remove() 
    logger.add(
        sys.stderr,
        level=settings.log_level,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> — "
            "<level>{message}</level>"
        ),
        colorize=True,
    )


@contextmanager
def timer(label: str = ""):
    start = time.perf_counter()
    yield
    elapsed = (time.perf_counter() - start) * 1000
    logger.debug(f"{label or 'Operation'} took {elapsed:.1f} ms")


def elapsed_ms(start_time: float) -> float:
    return round((time.perf_counter() - start_time) * 1000, 2) # returns time elapsed from start time


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))