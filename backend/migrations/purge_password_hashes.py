"""One-time purge: replace every stored password hash with an unusable random secret.

Auth is OTP-only now and no code reads password_hash, so real password hashes
must not linger in the database. Idempotent and dialect-safe (plain UPDATEs,
no schema change). Run from backend/ once per database:

    python -m migrations.purge_password_hashes --yes

DATABASE_URL comes from the environment (or backend/.env). Point it at prod
(Neon) to purge production, then at dev sqlite if needed.
"""

import os
import secrets
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.utils.security import hash_password  # noqa: E402


def main() -> int:
    if "--yes" not in sys.argv:
        print("Refusing to run without --yes (this rewrites every users.password_hash).")
        return 2
    db = SessionLocal()
    try:
        users = db.query(User).all()
        for user in users:
            user.password_hash = hash_password(secrets.token_hex(32))
        db.commit()
        print(f"Purged {len(users)} password hash(es). Password auth is dead; OTP only.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
