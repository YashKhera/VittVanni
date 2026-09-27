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
from data.partners_seed import partner_count, seed_partners  # noqa: E402
from data.schemes_seed import seed_schemes  # noqa: E402


def _init_db():
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_schemes(db)
        seed_partners(db)
    finally:
        db.close()


class PartnerApiTestCase(unittest.TestCase):
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

    def _token(self):
        from unittest import mock
        email = "partner_user@example.com"
        with mock.patch("app.services.auth_service.secrets.randbelow", return_value=424242):
            self.client.post("/api/auth/otp/request-signup", json={"email": email})
        r = self.client.post("/api/auth/otp/verify-signup", json={"email": email, "otp": "424242"})
        if r.status_code != 200:
            # Account already exists (repeat runs): log in instead.
            with mock.patch("app.services.auth_service.secrets.randbelow", return_value=424242):
                self.client.post("/api/auth/otp/request", json={"email": email})
            r = self.client.post("/api/auth/otp/login", json={"email": email, "otp": "424242"})
        return r.json()["access_token"]

    def _headers(self, token):
        return {"Authorization": f"Bearer {token}"}


class TestPartnerSeed(PartnerApiTestCase):
    def test_partner_count_exceeds_100(self):
        self.assertGreaterEqual(partner_count(), 100)

    def test_seed_inserted_partners(self):
        from app.models.channel_partner import ChannelPartner
        db = SessionLocal()
        try:
            total = db.query(ChannelPartner).count()
        finally:
            db.close()
        self.assertGreaterEqual(total, 100)

    def test_partners_have_required_fields(self):
        from app.models.channel_partner import ChannelPartner
        db = SessionLocal()
        try:
            p = db.query(ChannelPartner).first()
        finally:
            db.close()
        self.assertIsNotNone(p)
        self.assertTrue(p.name)
        self.assertIn(p.partner_type, ["sca", "psb", "rrb", "nbfc_mfi"])
        self.assertTrue(p.state)
        self.assertIsNotNone(p.latitude)
        self.assertIsNotNone(p.longitude)


class TestPartnerAuth(PartnerApiTestCase):
    def test_requires_auth(self):
        r = self.client.get("/api/partners")
        self.assertEqual(r.status_code, 401)


class TestPartnerSearch(PartnerApiTestCase):
    def test_list_all(self):
        token = self._token()
        r = self.client.get("/api/partners", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertGreaterEqual(data["total"], 100)
        self.assertGreaterEqual(len(data["partners"]), 1)

    def test_filter_by_state(self):
        token = self._token()
        r = self.client.get("/api/partners", headers=self._headers(token), params={"state": "maharashtra"})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertGreaterEqual(len(data["partners"]), 1)
        for p in data["partners"]:
            self.assertEqual(p["state"], "maharashtra")

    def test_filter_by_type(self):
        token = self._token()
        r = self.client.get("/api/partners", headers=self._headers(token), params={"partner_type": "nbfc_mfi"})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertGreaterEqual(len(data["partners"]), 1)
        for p in data["partners"]:
            self.assertEqual(p["partner_type"], "nbfc_mfi")

    def test_search_by_city(self):
        token = self._token()
        r = self.client.get("/api/partners", headers=self._headers(token), params={"city": "Mumbai"})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertGreaterEqual(len(data["partners"]), 1)
        for p in data["partners"]:
            self.assertIn("Mumbai", p["city"])

    def test_filter_by_loan_category(self):
        token = self._token()
        r = self.client.get("/api/partners", headers=self._headers(token), params={"loan_category": "education"})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertGreaterEqual(len(data["partners"]), 1)
        for p in data["partners"]:
            self.assertIn("education", p["loan_categories"])

    def test_pincode_filter(self):
        token = self._token()
        r = self.client.get("/api/partners", headers=self._headers(token), params={"pincode": "400021"})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertGreaterEqual(len(data["partners"]), 1)
        for p in data["partners"]:
            self.assertEqual(p["pincode"], "400021")


class TestPartnerGet(PartnerApiTestCase):
    def test_get_by_id(self):
        token = self._token()
        lst = self.client.get("/api/partners", headers=self._headers(token), params={"limit": 1})
        pid = lst.json()["partners"][0]["id"]
        r = self.client.get(f"/api/partners/{pid}", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["id"], pid)

    def test_get_missing_returns_404(self):
        token = self._token()
        r = self.client.get("/api/partners/999999", headers=self._headers(token))
        self.assertEqual(r.status_code, 404)


class TestPartnerNearest(PartnerApiTestCase):
    def test_nearest_returns_sorted_by_distance(self):
        token = self._token()
        # Central Mumbai coords
        r = self.client.get("/api/partners/nearest", headers=self._headers(token),
                            params={"lat": 19.0760, "lon": 72.8777, "max_distance_km": 200})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertGreaterEqual(len(data["partners"]), 1)
        dists = [p["distance_km"] for p in data["partners"]]
        self.assertEqual(dists, sorted(dists))

    def test_nearest_respects_max_distance(self):
        token = self._token()
        r = self.client.get("/api/partners/nearest", headers=self._headers(token),
                            params={"lat": 19.0760, "lon": 72.8777, "max_distance_km": 10})
        self.assertEqual(r.status_code, 200)
        for p in r.json()["partners"]:
            self.assertLessEqual(p["distance_km"], 10)

    def test_nearest_constrains_loan_category(self):
        token = self._token()
        r = self.client.get("/api/partners/nearest", headers=self._headers(token),
                            params={"lat": 19.0760, "lon": 72.8777, "loan_category": "education",
                                    "max_distance_km": 1000})
        self.assertEqual(r.status_code, 200)
        for p in r.json()["partners"]:
            self.assertIn("education", p["loan_categories"])


class TestPartnerEligible(PartnerApiTestCase):
    def test_eligible_filters_high_npa(self):
        token = self._token()
        r = self.client.get("/api/partners/eligible", headers=self._headers(token),
                            params={"max_npa": 5.0})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertGreaterEqual(len(data["partners"]), 1)
        for p in data["partners"]:
            self.assertLessEqual(p["npa_pct"], 5.0)

    def test_eligible_requires_utilization(self):
        token = self._token()
        r = self.client.get("/api/partners/eligible", headers=self._headers(token),
                            params={"min_utilization": 80.0})
        self.assertEqual(r.status_code, 200)
        for p in r.json()["partners"]:
            self.assertGreaterEqual(p["fund_utilization_pct"], 80.0)

    def test_eligible_returns_filters_echo(self):
        token = self._token()
        r = self.client.get("/api/partners/eligible", headers=self._headers(token),
                            params={"state": "kerala", "max_npa": 4.0})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["filters"]["state"], "kerala")
        self.assertEqual(data["filters"]["max_npa"], 4.0)


class TestPartnerSeedQuality(PartnerApiTestCase):
    def test_no_stacked_coordinates(self):
        from app.models.channel_partner import ChannelPartner
        db = SessionLocal()
        try:
            coords = [(p.latitude, p.longitude)
                      for p in db.query(ChannelPartner).all()]
        finally:
            db.close()
        self.assertEqual(len(coords), len(set(coords)),
                         "branches sharing exact coords stack on the map")

    def test_seed_upserts_corrections(self):
        from app.models.channel_partner import ChannelPartner
        from data.partners_seed import build_partners, seed_partners
        db = SessionLocal()
        try:
            first = build_partners()[0]
            row = db.query(ChannelPartner).filter(
                ChannelPartner.name == first["name"]).first()
            self.assertIsNotNone(row)
            row.latitude = 0.0
            row.phone = "000-0000000"
            db.commit()
            seed_partners(db)
            db.refresh(row)
            self.assertAlmostEqual(row.latitude, first["latitude"])
            self.assertEqual(row.phone, first["phone"])
        finally:
            db.close()

    def test_curated_coords_inside_india(self):
        from data.partners_seed import build_partners
        for p in build_partners():
            self.assertTrue(6.0 <= p["latitude"] <= 38.0, p["name"])
            self.assertTrue(68.0 <= p["longitude"] <= 98.0, p["name"])

    def test_variant_pincodes_match_base(self):
        from data.partners_seed import PARTNERS, build_partners
        base_pins = {r[5] for r in PARTNERS}
        for p in build_partners():
            self.assertIn(p["pincode"], base_pins)


if __name__ == "__main__":
    unittest.main()