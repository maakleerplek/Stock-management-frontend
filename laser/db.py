"""SQLite storage: laser sessions and logged attempts.

The material list with its baseline settings lives in InvenTree (see
inventree.py), so it is part of the InvenTree backup. Only what users add
here - sessions and "how did it go" reports - is in this file.
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
