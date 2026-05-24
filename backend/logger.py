import json
import time
import sqlite3
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class ExecutionLog(BaseModel):
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    session_id: str
    agent_name: str
    action: str
    input_query: Optional[str] = None
    affected_files: List[str] = Field(default_factory=list)
    status: str = "success"
    execution_time_ms: float = 0.0
    token_usage: Dict[str, int] = Field(default_factory=lambda: {"prompt": 0, "completion": 0})
    details: Dict[str, Any] = Field(default_factory=dict)

class TraceLogger:
    def __init__(self, db_path: str = "logs.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                timestamp TEXT,
                agent_name TEXT,
                action TEXT,
                input_query TEXT,
                affected_files TEXT,
                status TEXT,
                execution_time_ms REAL,
                token_usage TEXT,
                details TEXT
            )
        ''')
        conn.commit()
        conn.close()

    def log(self, log_entry: ExecutionLog):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO logs (
                session_id, timestamp, agent_name, action, input_query, 
                affected_files, status, execution_time_ms, token_usage, details
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            log_entry.session_id,
            log_entry.timestamp,
            log_entry.agent_name,
            log_entry.action,
            log_entry.input_query,
            json.dumps(log_entry.affected_files),
            log_entry.status,
            log_entry.execution_time_ms,
            json.dumps(log_entry.token_usage),
            json.dumps(log_entry.details)
        ))
        conn.commit()
        conn.close()
        return log_entry

    def get_session_logs(self, session_id: str) -> List[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM logs WHERE session_id = ? ORDER BY timestamp ASC', (session_id,))
        rows = [dict(row) for row in cursor.fetchall()]
        for row in rows:
            row['affected_files'] = json.loads(row['affected_files'])
            row['token_usage'] = json.loads(row['token_usage'])
            row['details'] = json.loads(row['details'])
        conn.close()
        return rows

# Singleton instance for the app
trace_logger = TraceLogger()
