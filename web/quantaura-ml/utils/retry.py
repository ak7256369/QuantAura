import time, functools, logging
logger = logging.getLogger(__name__)

def with_retry(max_attempts=3, base_delay=5, max_delay=60, exceptions=(Exception,)):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            delay = base_delay
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_attempts:
                        logger.error(f"[RETRY] {func.__name__} failed after {max_attempts} attempts: {e}")
                        raise
                    logger.warning(f"[RETRY] {func.__name__} attempt {attempt} failed: {e}. Retry in {delay}s...")
                    time.sleep(delay)
                    delay = min(delay * 2, max_delay)
        return wrapper
    return decorator
