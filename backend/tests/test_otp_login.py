import os
import tempfile
import unittest
from unittest.mock import patch

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


class OtpLoginApiTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app import models  # noqa: F401
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)
        cls._n = 0

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        try:
            os.unlink(_tmp.name)
        except OSError:
            pass

    def _register(self):
        from unittest import mock
        type(self)._n += 1
        email = f"otp_user_{type(self)._n}@example.com"
        with mock.patch("app.services.auth_service.secrets.randbelow", return_value=424242):
            r = self.client.post("/api/auth/otp/request-signup", json={"email": email})
        self.assertEqual(r.status_code, 200)
        r = self.client.post("/api/auth/otp/verify-signup", json={"email": email, "otp": "424242"})
        self.assertEqual(r.status_code, 200)
        return email

    def _headers(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _request_code(self, email, code=424242):
        with patch("app.services.auth_service.secrets.randbelow", return_value=code):
            r = self.client.post("/api/auth/otp/request", json={"email": email})
        self.assertEqual(r.status_code, 200)
        return f"{code:06d}"


class TestOtpLogin(OtpLoginApiTestCase):
    def test_request_login_otp_unknown_email_404(self):
        r = self.client.post("/api/auth/otp/request", json={"email": "ghost@example.com"})
        self.assertEqual(r.status_code, 404)

    def test_full_otp_login_flow(self):
        email = self._register()
        code = self._request_code(email)
        r = self.client.post("/api/auth/otp/login", json={"email": email, "otp": code})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["email"], email)
        # Token works for authenticated endpoints.
        me = self.client.get("/api/auth/me", headers=self._headers(data["access_token"]))
        self.assertEqual(me.status_code, 200)

    def test_wrong_code_rejected(self):
        email = self._register()
        self._request_code(email)
        r = self.client.post("/api/auth/otp/login", json={"email": email, "otp": "000000"})
        self.assertEqual(r.status_code, 401)

    def test_code_single_use(self):
        email = self._register()
        code = self._request_code(email)
        r1 = self.client.post("/api/auth/otp/login", json={"email": email, "otp": code})
        self.assertEqual(r1.status_code, 200)
        r2 = self.client.post("/api/auth/otp/login", json={"email": email, "otp": code})
        self.assertEqual(r2.status_code, 400)

    def test_reset_otp_does_not_log_in(self):
        # Purpose isolation: a signup code is useless for login.
        from unittest import mock
        email = f"iso_user_{type(self)._n}@example.com"
        with mock.patch("app.services.auth_service.secrets.randbelow", return_value=111111):
            r = self.client.post("/api/auth/otp/request-signup", json={"email": email})
        self.assertEqual(r.status_code, 200)
        from app.models.otp import OtpCode
        db = SessionLocal()
        try:
            row = db.query(OtpCode).filter(
                OtpCode.email == email, OtpCode.purpose == "signup").first()
            self.assertIsNotNone(row)
        finally:
            db.close()
        r = self.client.post("/api/auth/otp/login", json={"email": email, "otp": "111111"})
        self.assertIn(r.status_code, (400, 401, 404))

    def test_signup_then_login_works(self):
        email = self._register()
        code = self._request_code(email)
        r = self.client.post("/api/auth/otp/login",
                             json={"email": email, "otp": code})
        self.assertEqual(r.status_code, 200)
        self.assertIn("access_token", r.json())


if __name__ == "__main__":
    unittest.main()
