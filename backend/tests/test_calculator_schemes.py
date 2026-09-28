import os
import tempfile
import unittest

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
from data.schemes_seed import seed_schemes  # noqa: E402


def _init_db():
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_schemes(db)
    finally:
        db.close()


class CalculatorSchemesApiTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _init_db()
        cls.client = TestClient(app)
        cls._n = 0

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        try:
            os.unlink(_tmp.name)
        except OSError:
            pass

    def _token(self):
        from unittest import mock
        type(self)._n += 1
        email = f"calc_schemes_user_{type(self)._n}@example.com"
        with mock.patch("app.services.auth_service.secrets.randbelow", return_value=424242):
            self.client.post("/api/auth/otp/request-signup", json={"email": email})
        r = self.client.post("/api/auth/otp/verify-signup", json={"email": email, "otp": "424242"})
        self.assertEqual(r.status_code, 200)
        return r.json()["access_token"]

    def _headers(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _profile(self, token, **overrides):
        payload = {
            "full_name": "Test User",
            "phone_number": "9876543210",
            "state": "maharashtra",
            "district": "Pune",
            "age_group": "26-35",
            "gender": "male",
            "social_category": "general",
            "business_name": "Test Foods",
            "business_sector": "food_processing",
            "business_stage": "existing",
            "annual_revenue": "10l_50l",
            "employee_count": "1-5",
            "support_needs": ["loan"],
        }
        payload.update(overrides)
        r = self.client.post("/api/profile", json=payload, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        return r.json()


class TestPersonalizedSchemes(CalculatorSchemesApiTestCase):
    def test_requires_auth(self):
        r = self.client.get("/api/calculator/schemes")
        self.assertEqual(r.status_code, 401)

    def test_no_profile_returns_unpersonalized(self):
        token = self._token()
        r = self.client.get("/api/calculator/schemes", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertFalse(data["personalized"])
        self.assertGreater(data["total"], 0)
        for item in data["items"]:
            self.assertFalse(item["eligible"])
            self.assertIsNone(item["match_score"])

    def test_male_user_excludes_women_only_schemes(self):
        # Seed loan schemes are all SC-gated; a general male matches none,
        # and Mahila Samridhi must surface as ineligible, never pre-listed.
        token = self._token()
        self._profile(token, gender="male", social_category="general")
        r = self.client.get("/api/calculator/schemes", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data["personalized"])
        self.assertEqual(data["eligible_count"], 0)
        names = [i["scheme_name"] for i in data["items"]]
        self.assertIn("Mahila Samridhi Yojana (SC Women)", names)
        mahila = next(i for i in data["items"] if "Mahila" in i["scheme_name"])
        self.assertFalse(mahila["eligible"])
        self.assertIsNone(mahila["match_score"])

    def test_eligible_woman_sees_mahila_with_score(self):
        token = self._token()
        self._profile(token, gender="female", social_category="sc",
                      annual_family_income="under_2.5l", estimated_project_cost=100000)
        r = self.client.get("/api/calculator/schemes", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data["personalized"])
        eligible = [i for i in data["items"] if i["eligible"]]
        self.assertTrue(eligible, "expected eligible schemes for SC woman")
        names = [i["scheme_name"] for i in eligible]
        self.assertIn("Mahila Samridhi Yojana (SC Women)", names)
        for item in eligible:
            self.assertIsNotNone(item["match_score"])
            self.assertGreaterEqual(item["match_score"], 40)
        # No women-only scheme leaks to a male profile's eligible set.
        token2 = self._token()
        self._profile(token2, gender="male", social_category="sc",
                      annual_family_income="under_2.5l", estimated_project_cost=100000)
        data2 = self.client.get("/api/calculator/schemes", headers=self._headers(token2)).json()
        for item in data2["items"]:
            if item["eligible"]:
                self.assertNotIn("Mahila", item["scheme_name"])

    def test_eligible_sorted_first_by_match(self):
        token = self._token()
        self._profile(token, gender="female", social_category="sc")
        r = self.client.get("/api/calculator/schemes", headers=self._headers(token))
        data = r.json()
        self.assertTrue(data["personalized"])
        flags = [i["eligible"] for i in data["items"]]
        # All eligible items precede ineligible ones.
        self.assertEqual(flags, sorted(flags, key=lambda f: 0 if f else 1))
        scores = [i["match_score"] for i in data["items"] if i["eligible"]]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_compare_post_still_accepts_any_scheme_ids(self):
        token = self._token()
        self._profile(token, gender="male")
        lst = self.client.get("/api/calculator/schemes", headers=self._headers(token)).json()
        ids = [i["scheme_id"] for i in lst["items"][:2]]
        r = self.client.post(
            "/api/calculator/schemes",
            json={"scheme_ids": ids, "project_cost": 500000, "tenure_months": 60},
            headers=self._headers(token),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()["items"]), 2)


if __name__ == "__main__":
    unittest.main()
