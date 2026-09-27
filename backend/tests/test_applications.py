import os
import tempfile
import unittest
from unittest import mock

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
os.environ["SECRET_KEY"] = "test-secret-key-for-tests"
os.environ["ENVIRONMENT"] = "testing"
os.environ["AI_API_KEY"] = ""
os.environ["GEMINI_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


def _init_db():
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        from data.schemes_seed import seed_schemes
        seed_schemes(db)
    finally:
        db.close()


class ApplicationApiTestCase(unittest.TestCase):
    _n = 0

    @classmethod
    def setUpClass(cls):
        _init_db()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        try:
            os.unlink(_tmp.name)
        except OSError:
            pass

    def _email(self, prefix="app"):
        type(self)._n += 1
        return f"{prefix}_{type(self)._n}@example.com"

    def _headers(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _signup(self, email=None, role="user", code=424242):
        email = email or self._email()
        with mock.patch("app.services.auth_service.secrets.randbelow", return_value=code):
            r = self.client.post("/api/auth/otp/request-signup", json={"email": email, "role": role})
        self.assertEqual(r.status_code, 200)
        r = self.client.post(
            "/api/auth/otp/verify-signup",
            json={"email": email, "otp": f"{code:06d}", "role": role},
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["user"]["role"], role)
        return email, data["access_token"]

    def _scheme_with_docs(self, token):
        r = self.client.get("/api/schemes", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        schemes = r.json()["schemes"]
        for s in schemes:
            sid = s["id"]
            d = self.client.get(f"/api/applications/doc-schema/{sid}", headers=self._headers(token))
            if d.status_code == 200 and d.json().get("fields"):
                return sid, d.json()["fields"]
        self.fail("no seeded scheme with documents")

    def _fill_docs(self, fields):
        out = {}
        for f in fields:
            out[f["key"]] = "123456789012" if f["sensitive"] else f"test-{f['key']}"
        return out


class TestApplicationFlow(ApplicationApiTestCase):
    def test_full_flow(self):
        user_email, user_tok = self._signup(role="user")
        _, partner_tok = self._signup(role="partner")
        sid, fields = self._scheme_with_docs(user_tok)

        # Partner serves the scheme.
        r = self.client.put("/api/partner/schemes", json={"scheme_ids": [sid]},
                            headers=self._headers(partner_tok))
        self.assertEqual(r.status_code, 200)

        # Partner is discoverable for that scheme.
        r = self.client.get(f"/api/applications/partners?scheme_id={sid}",
                            headers=self._headers(user_tok))
        self.assertEqual(r.status_code, 200)
        self.assertTrue(len(r.json()) >= 1)
        pid = r.json()[0]["partner_id"]

        # Missing documents are rejected.
        r = self.client.post("/api/applications",
                             json={"scheme_id": sid, "partner_id": pid,
                                   "form_data": {}, "documents": {}},
                             headers=self._headers(user_tok))
        self.assertEqual(r.status_code, 400)

        # Create the application.
        docs = self._fill_docs(fields)
        r = self.client.post("/api/applications",
                             json={"scheme_id": sid, "partner_id": pid,
                                   "form_data": {"name": "Test", "phone": "999"},
                                   "documents": docs},
                             headers=self._headers(user_tok))
        self.assertEqual(r.status_code, 200)
        app = r.json()
        self.assertEqual(app["status"], "submitted")
        self.assertRegex(app["application_no"], r"^VV-\d{4}-\w+$")
        aid = app["id"]

        # Owner sees full document values.
        for f in fields:
            if f["sensitive"]:
                self.assertEqual(app["documents"][f["key"]], docs[f["key"]])

        # Chat is locked before review.
        r = self.client.post(f"/api/applications/{aid}/messages", json={"body": "hi"},
                             headers=self._headers(user_tok))
        self.assertEqual(r.status_code, 400)

        # Partner inbox shows it with masked sensitive docs.
        r = self.client.get("/api/partner/applications", headers=self._headers(partner_tok))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 1)
        masked = [v for v in r.json()[0]["documents"].values()]
        self.assertTrue(any("••" in str(v) for v in masked))

        # Move to review: contact unlocks, chat opens.
        r = self.client.post(f"/api/partner/applications/{aid}/status",
                             json={"status": "under_review"}, headers=self._headers(partner_tok))
        self.assertEqual(r.status_code, 200)
        r = self.client.get(f"/api/partner/applications/{aid}", headers=self._headers(partner_tok))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["contact_email"], user_email)

        r = self.client.post(f"/api/applications/{aid}/messages", json={"body": "hello partner"},
                             headers=self._headers(user_tok))
        self.assertEqual(r.status_code, 200)
        r = self.client.post(f"/api/applications/{aid}/messages", json={"body": "hello applicant"},
                             headers=self._headers(partner_tok))
        self.assertEqual(r.status_code, 200)
        r = self.client.get(f"/api/applications/{aid}/messages", headers=self._headers(user_tok))
        self.assertEqual(len(r.json()), 2)
        r = self.client.get(f"/api/applications/{aid}/messages?after_id=1",
                            headers=self._headers(user_tok))
        self.assertEqual(len(r.json()), 1)

        # Approve: terminal, chat locks again.
        r = self.client.post(f"/api/partner/applications/{aid}/status",
                             json={"status": "approved"}, headers=self._headers(partner_tok))
        self.assertEqual(r.status_code, 200)
        r = self.client.post(f"/api/partner/applications/{aid}/status",
                             json={"status": "rejected"}, headers=self._headers(partner_tok))
        self.assertEqual(r.status_code, 400)
        r = self.client.post(f"/api/applications/{aid}/messages", json={"body": "late msg"},
                             headers=self._headers(user_tok))
        self.assertEqual(r.status_code, 400)

        # User sees live status in My Applications.
        r = self.client.get("/api/applications", headers=self._headers(user_tok))
        self.assertEqual(r.json()[0]["status"], "approved")

    def test_isolation(self):
        _, tok_a = self._signup(role="user")
        _, tok_b = self._signup(role="user")
        _, partner_tok = self._signup(role="partner")
        sid, fields = self._scheme_with_docs(tok_a)
        self.client.put("/api/partner/schemes", json={"scheme_ids": [sid]},
                        headers=self._headers(partner_tok))
        pid = self.client.get(f"/api/applications/partners?scheme_id={sid}",
                              headers=self._headers(tok_a)).json()[0]["partner_id"]
        aid = self.client.post(
            "/api/applications",
            json={"scheme_id": sid, "partner_id": pid, "form_data": {},
                  "documents": self._fill_docs(fields)},
            headers=self._headers(tok_a)).json()["id"]
        # Stranger user: 404.
        r = self.client.get(f"/api/applications/{aid}", headers=self._headers(tok_b))
        self.assertEqual(r.status_code, 404)
        # Plain user on partner routes: 403.
        r = self.client.get("/api/partner/applications", headers=self._headers(tok_a))
        self.assertEqual(r.status_code, 403)
        # Partner serving another scheme sees nothing.
        _, other_partner = self._signup(role="partner")
        r = self.client.get("/api/partner/applications", headers=self._headers(other_partner))
        self.assertEqual(r.json(), [])


if __name__ == "__main__":
    unittest.main()
