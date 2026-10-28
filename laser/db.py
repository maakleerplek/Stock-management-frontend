"""SQLite storage: live machine-use data (laser sessions, time cleared without a session).

Lasting data is in InvenTree and so in its backup: the material library
(inventree.py) and the "how did it go" reports (feedback.py).
"""
import json
import os
import sqlite3
import threading

DATA_DIR = os.environ.get('DATA_DIR', os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(DATA_DIR, 'machineusage.db')
OLD_NAME = 'laser.db'   # its name until 2026-10; moved once on start

# Less laser time than this is no real use of the laser, just a test pulse. It
# does not become a cut and is not logged as thrown away. (Was 30 s before cuts:
# a short engrave is a real cut now.)
MIN_LOGGED_SECONDS = 2

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def move_old_name(path: str) -> None:
    """laser.db (with its WAL files) becomes machineusage.db, unless that exists already."""
    old = os.path.join(os.path.dirname(path) or '.', OLD_NAME)
    if os.path.exists(path) or not os.path.exists(old):
        return
    for suffix in ('', '-wal', '-shm'):
        if os.path.exists(old + suffix):
            os.replace(old + suffix, path + suffix)


def connect(path: str = DB_PATH) -> sqlite3.Connection:
    global _conn
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    move_old_name(path)
    _conn = sqlite3.connect(path, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    _conn.execute('PRAGMA journal_mode = WAL')
    _conn.executescript('''
        CREATE TABLE IF NOT EXISTS laser_state (  -- unassigned time and ESP counter, kept across restarts
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT,
            created TEXT NOT NULL,
            total_time REAL NOT NULL DEFAULT 0,
            total_cost REAL NOT NULL DEFAULT 0
        );

        -- Optional group of cuts, for someone lasering a long time with others in between.
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created TEXT NOT NULL,
            closed_at TEXT  -- all its cuts paid: kept for the analytics (project size, time per person)
        );

        CREATE TABLE IF NOT EXISTS time_blocks (
            id INTEGER PRIMARY KEY,
            session_id TEXT NOT NULL,
            seconds REAL NOT NULL,
            flushed_at TEXT NOT NULL
        );

        -- Laser time cleared without a paid session: unassigned time
        -- (reset) or a deleted session. Kept so time that never went through a
        -- paid session stays visible; it may have been paid some other way.
        CREATE TABLE IF NOT EXISTS discarded_time (
            id INTEGER PRIMARY KEY,
            seconds REAL NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('unassigned', 'session')),
            session_name TEXT,
            reason TEXT,
            kind TEXT,  -- deleted session: paid (outside checkout), workshop (HTL use), volunteer (own credit), other
            discarded_at TEXT NOT NULL
        );

        -- Old: reports now live in InvenTree (feedback.py). Kept so
        -- app.migrate_feedback can move rows that are still here.
        CREATE TABLE IF NOT EXISTS attempts (
            id INTEGER PRIMARY KEY,
            material TEXT NOT NULL,
            thickness_mm REAL NOT NULL,
            operation TEXT NOT NULL CHECK (operation IN ('cut', 'engrave')),
            speed REAL NOT NULL,
            power REAL NOT NULL,
            passes INTEGER NOT NULL DEFAULT 1,
            strength REAL,
            outcome TEXT NOT NULL CHECK (outcome IN ('failed', 'risky', 'partial', 'clean')),
            submitted_by TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    # Added later: a session is 'in checkout' once someone pressed Pay, and
    # 'paid' with the InvenTree order once the checkout went through.
    have = {r[1] for r in _conn.execute('PRAGMA table_info(sessions)')}
    for column in ('checkout_at', 'paid_at', 'order_ref', 'file', 'project_id'):
        if column not in have:
            _conn.execute(f'ALTER TABLE sessions ADD COLUMN {column} TEXT')
    # A cut's LightBurn thumbnail (PNG), from the watcher on the laser PC.
    if 'preview' not in have:
        _conn.execute('ALTER TABLE sessions ADD COLUMN preview BLOB')
    if 'closed_at' not in {r[1] for r in _conn.execute('PRAGMA table_info(projects)')}:
        _conn.execute('ALTER TABLE projects ADD COLUMN closed_at TEXT')
    if 'kind' not in {r[1] for r in _conn.execute('PRAGMA table_info(discarded_time)')}:
        _conn.execute('ALTER TABLE discarded_time ADD COLUMN kind TEXT')
    # Rows from before MIN_LOGGED_SECONDS existed: they only skew the analytics.
    _conn.execute('DELETE FROM discarded_time WHERE seconds < ?', (MIN_LOGGED_SECONDS,))
    _conn.execute('DELETE FROM sessions WHERE paid_at IS NOT NULL AND total_time <= 0')
    _conn.commit()
    return _conn


def query(sql: str, params: tuple = ()) -> list[dict]:
    with _lock:
        return [dict(r) for r in _conn.execute(sql, params).fetchall()]


def execute(sql: str, params: tuple = ()) -> int:
    with _lock:
        cur = _conn.execute(sql, params)
        _conn.commit()
        return cur.lastrowid


def load_state() -> dict:
    """The saved laser state (key -> JSON-decoded value); empty on a new database."""
    return {r['key']: json.loads(r['value']) for r in query('SELECT key, value FROM laser_state')}


def save_state(values: dict) -> None:
    with _lock:
        _conn.executemany('INSERT OR REPLACE INTO laser_state (key, value) VALUES (?, ?)',
                          [(k, json.dumps(v)) for k, v in values.items()])
        _conn.commit()
