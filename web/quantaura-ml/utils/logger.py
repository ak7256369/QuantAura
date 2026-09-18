import logging, os, sys

def get_logger(name: str, level=logging.INFO) -> logging.Logger:
    """Shared logger factory. Logs to console + file."""
    from config import BASE_DIR
    log_dir = os.path.join(BASE_DIR, "logs")
    os.makedirs(log_dir, exist_ok=True)

    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(level)
    fmt = logging.Formatter("%(asctime)s [%(name)s] %(levelname)s: %(message)s")

    # The console stream has the same codepage trap as the file handler: on a
    # cp1252 console, one unmappable character raises UnicodeEncodeError inside
    # emit() and logging discards the whole record. Degrade to '?' instead of
    # losing the line.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass

    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    # encoding MUST be set explicitly: the default is the locale codepage
    # (cp1252 on Windows), and any log line containing a character outside it
    # raises UnicodeEncodeError, which logging swallows — the record is then
    # silently never written. That is how the fine-tune ACCEPTED/REJECTED lines
    # went missing from autopilot.log.
    fh = logging.FileHandler(os.path.join(log_dir, f"{name}.log"),
                             encoding="utf-8", errors="replace")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    return logger
