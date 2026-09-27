"""Migration v4 - application engine: user roles + partner/application tables.

Idempotent for SQLite and PostgreSQL. Run from backend/:
    python -m migrations.migrate_v4_applications

- users.role (VARCHAR(20) DEFAULT 'user')
- partner_profiles, partner_schemes, applications, application_messages
"""

import os
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, text  # noqa: E402

from app.database import Base, engine  # noqa: E402
import app.models  # noqa: E402,F401


def _add_column(table: str, column: str, ddl: str) -> None:
    cols = [c["name"] for c in inspect(engine).get_columns(table)]
    if column in cols:
        print(f"SKIP {table}.{column} already exists")
        return
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
    print(f"ADD {table}.{column}")


def main() -> None:
    _add_column("users", "role", "VARCHAR(20) DEFAULT 'user'")
    with engine.begin() as conn:
        conn.execute(text("UPDATE users SET role='user' WHERE role IS NULL"))
    Base.metadata.create_all(bind=engine)
    print("OK v4 tables ensured")


if __name__ == "__main__":
    main()
