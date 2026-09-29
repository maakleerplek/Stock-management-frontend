"""SQLite storage: live laser data (sessions, time cleared without a session)
and who stored what in the cellar (storage.py).

Lasting data is in InvenTree and so in its backup: the material library
(inventree.py) and the "how did it go" reports (feedback.py).
"""
import os
import sqlite3
import threading

DATA_DIR = os.environ.get('DATA_DIR', os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(DATA_DIR, 'laser.db')

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def connect(path: str = DB_PATH) -> sqlite3.Connection:
    global _conn
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    _conn = sqlite3.connect(path, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    _conn.execute('PRAGMA journal_mode = WAL')
    _conn.executescript('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT,
            created TEXT NOT NULL,
            total_time REAL NOT NULL DEFAULT 0,
            total_cost REAL NOT NULL DEFAULT 0
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

        -- Things people left in the cellar. The item itself is a stock item
        -- in InvenTree (stock_pk); this row holds the owner and the reminder.
        CREATE TABLE IF NOT EXISTS storage_items (
            stock_pk INTEGER PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT NOT NULL,
            content TEXT NOT NULL,
            created TEXT NOT NULL,
            expires TEXT NOT NULL,
            reminded_at TEXT,
            closed_at TEXT,
            closed_reason TEXT
        );
    ''')
    # Added later: a session is 'in checkout' once someone pressed Pay, and
    # 'paid' with the InvenTree order once the checkout went through.
    have = {r[1] for r in _conn.execute('PRAGMA table_info(sessions)')}
    for column in ('checkout_at', 'paid_at', 'order_ref'):
        if column not in have:
            _conn.execute(f'ALTER TABLE sessions ADD COLUMN {column} TEXT')
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
