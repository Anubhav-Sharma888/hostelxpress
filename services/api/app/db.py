from __future__ import annotations

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


class Database:
    def __init__(self, conninfo: str):
        # Application code and the wire contract assume UTC; a server default
        # timezone would otherwise leak into every returned timestamptz.
        def configure(conn):
            conn.execute("SET TIME ZONE 'UTC'")
            conn.commit()  # The pool requires connections back in the idle state.
        self.pool = ConnectionPool(conninfo, min_size=1, max_size=10, open=False,
                                   kwargs={'row_factory': dict_row, 'connect_timeout': 5}, timeout=10,
                                   configure=configure)

    def open(self):
        self.pool.open(wait=True, timeout=10)

    def close(self):
        self.pool.close()

    def connection(self):
        return self.pool.connection()
