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
from data.schemes_seed import scheme_count, seed_schemes  # noqa: E402


def _init_db():
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_schemes(db)
    finally:
        db.close()


class ApiTestCase(unittest.TestCase):
    _counter = 0

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

    def _email(self, prefix="user"):
        ApiTestCase._counter += 1
        return f"{prefix}_{ApiTestCase._counter}@example.com"

    def _request_signup(self, email=None):
        return self.client.post("/api/auth/otp/request-signup", json={"email": email or self._email()})

    def _signup(self, email=None, phone_number="", code=424242):
        email = email or self._email()
        with mock.patch("app.services.auth_service.secrets.randbelow", return_value=code):
            r = self.client.post("/api/auth/otp/request-signup", json={"email": email})
        self.assertEqual(r.status_code, 200)
        return self.client.post(
            "/api/auth/otp/verify-signup",
            json={"email": email, "otp": f"{code:06d}", "phone_number": phone_number},
        )

    def _request_login_code(self, email, code=424242):
        with mock.patch("app.services.auth_service.secrets.randbelow", return_value=code):
            r = self.client.post("/api/auth/otp/request", json={"email": email})
        self.assertEqual(r.status_code, 200)
        return f"{code:06d}"

    def _token(self):
        return self._signup().json()["access_token"]

    def _headers(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _create_profile(self, token, sector="food_processing", state="maharashtra"):
        payload = {
            "full_name": "Priya Sharma",
            "phone_number": "9876543210",
            "state": state,
            "district": "Pune",
            "age_group": "26-35",
            "gender": "female",
            "social_category": "obc",
            "business_name": "Priya Foods",
            "business_sector": sector,
            "business_stage": "existing",
            "annual_revenue": "10l_50l",
            "employee_count": "1-5",
            "support_needs": ["loan", "training"],
        }
        return self.client.post("/api/profile", json=payload, headers=self._headers(token))


class TestAuth(ApiTestCase):
    def test_signup_full_flow(self):
        email = self._email("signup")
        r = self._signup(email)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("access_token", data)
        self.assertIn("user", data)
        self.assertEqual(data["user"]["email"], email)

    def test_signup_duplicate_request_rejected(self):
        email = self._email("dup")
        self.assertEqual(self._signup(email).status_code, 200)
        r2 = self.client.post("/api/auth/otp/request-signup", json={"email": email})
        self.assertEqual(r2.status_code, 409)

    def test_signup_duplicate_verify_rejected(self):
        email = self._email("dupv")
        self.assertEqual(self._signup(email).status_code, 200)
        r2 = self.client.post(
            "/api/auth/otp/verify-signup", json={"email": email, "otp": "424242"})
        self.assertEqual(r2.status_code, 409)

    def test_signup_wrong_code(self):
        email = self._email("wrong")
        self._request_signup(email)
        r = self.client.post(
            "/api/auth/otp/verify-signup", json={"email": email, "otp": "000000"})
        self.assertEqual(r.status_code, 401)

    def test_signup_code_single_use(self):
        email = self._email("once")
        self.assertEqual(self._signup(email).status_code, 200)
        r2 = self.client.post(
            "/api/auth/otp/verify-signup", json={"email": email, "otp": "424242"})
        self.assertEqual(r2.status_code, 409)

    def test_signup_code_cannot_login(self):
        email = self._email("iso")
        self._request_signup(email)
        r = self.client.post("/api/auth/otp/login", json={"email": email, "otp": "424242"})
        self.assertIn(r.status_code, (400, 401, 404))

    def test_login_code_cannot_signup(self):
        email = self._email("iso2")
        self.assertEqual(self._signup(email).status_code, 200)
        code = self._request_login_code(email, code=777777)
        r = self.client.post(
            "/api/auth/otp/verify-signup", json={"email": "fresh@example.com", "otp": code})
        self.assertIn(r.status_code, (400, 401))

    def test_login_otp_flow(self):
        email = self._email("login")
        self.assertEqual(self._signup(email).status_code, 200)
        code = self._request_login_code(email)
        r = self.client.post("/api/auth/otp/login", json={"email": email, "otp": code})
        self.assertEqual(r.status_code, 200)
        self.assertIn("access_token", r.json())

    def test_login_unknown_email(self):
        r = self.client.post("/api/auth/otp/request", json={"email": "nobody@example.com"})
        self.assertEqual(r.status_code, 404)

    def test_me(self):
        token = self._token()
        r = self.client.get("/api/auth/me", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertIn("email", r.json())

    def test_me_unauthenticated(self):
        r = self.client.get("/api/auth/me")
        self.assertEqual(r.status_code, 401)

    def test_signup_with_phone(self):
        r = self._signup(self._email("phone"), phone_number="9876543210")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["user"]["phone_number"], "9876543210")
        token = r.json()["access_token"]
        me = self.client.get("/api/auth/me", headers=self._headers(token))
        self.assertEqual(me.json()["phone_number"], "9876543210")
        self.assertEqual(r.json()["user"]["phone_number"], "9876543210")
        token = r.json()["access_token"]
        me = self.client.get("/api/auth/me", headers=self._headers(token))
        self.assertEqual(me.json()["phone_number"], "9876543210")

    def test_otp_request_does_not_leak_code(self):
        email = self._email("noleak")
        self.assertEqual(self._signup(email).status_code, 200)
        r = self.client.post("/api/auth/otp/request", json={"email": email})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("message", data)
        self.assertNotIn("otp", data)
        self.assertNotIn("dev_otp", data)

    def test_otp_request_unknown_email(self):
        r = self.client.post("/api/auth/otp/request", json={"email": "nobody2@example.com"})
        self.assertEqual(r.status_code, 404)

    def test_verify_otp_wrong_code(self):
        email = self._email("wrong2")
        self.assertEqual(self._signup(email).status_code, 200)
        self._request_login_code(email)
        r = self.client.post("/api/auth/otp/login", json={"email": email, "otp": "000000"})
        self.assertEqual(r.status_code, 401)

    def test_verify_otp_without_request(self):
        email = self._email("noreq")
        self.assertEqual(self._signup(email).status_code, 200)
        r = self.client.post("/api/auth/otp/login", json={"email": email, "otp": "123456"})
        self.assertEqual(r.status_code, 400)


class TestProfile(ApiTestCase):
    def test_create_profile(self):
        token = self._token()
        r = self._create_profile(token)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["business_sector"], "food_processing")
        self.assertIn("loan", r.json()["support_needs"])

    def test_get_profile(self):
        token = self._token()
        self._create_profile(token)
        r = self.client.get("/api/profile", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["full_name"], "Priya Sharma")

    def test_update_profile(self):
        token = self._token()
        self._create_profile(token)
        r = self.client.put("/api/profile", json={"business_stage": "expanding", "support_needs": ["subsidy"]},
                            headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["business_stage"], "expanding")
        self.assertIn("subsidy", r.json()["support_needs"])


class TestUnderstanding(ApiTestCase):
    def _setup(self):
        token = self._token()
        self._create_profile(token, sector="ecommerce", state="punjab")
        return token

    def test_understand_builtin(self):
        token = self._setup()
        r = self.client.post("/api/ai/understand", json={
            "description": "I make pickles and namkeen in my small kitchen and want to sell online"
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["provider"], "builtin")
        self.assertEqual(data["sector"], "food_processing")
        self.assertIn("pickle", data["tags"])
        self.assertTrue(data["summary_en"])
        self.assertEqual(data["summary_loc"], "")

    def test_understand_regional_language_fallback(self):
        token = self._setup()
        r = self.client.post("/api/ai/understand", json={
            "description": "I make pickles and namkeen in my small kitchen",
            "language": "pa",
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["provider"], "builtin")
        # builtin fallback serves English text as summary_loc for regional languages
        self.assertEqual(data["summary_loc"], data["summary_en"])
        self.assertTrue(data["summary_loc"])

    def test_confirm_persists_and_profile_includes_fields(self):
        token = self._setup()
        r = self.client.post("/api/ai/confirm", json={
            "description": "I make pickles and namkeen",
            "sector": "food_processing",
            "tags": ["pickle", "namkeen"],
            "summary_en": "Food business",
            "summary_hi": "खाद्य व्यवसाय",
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        saved = self.client.get("/api/ai/understanding", headers=self._headers(token)).json()
        self.assertEqual(saved["sector"], "food_processing")
        self.assertEqual(saved["tags"], ["pickle", "namkeen"])
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertTrue(prof["ai_confirmed"])
        self.assertEqual(prof["ai_sector"], "food_processing")
        self.assertEqual(prof["ai_tags"], ["pickle", "namkeen"])

    def test_matching_uses_confirmed_sector(self):
        token = self._setup()
        rec = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()
        baseline = {x["scheme_id"]: x["match_score"] for x in rec["recommendations"]}
        self.client.post("/api/ai/confirm", json={
            "description": "I make pickles and namkeen",
            "sector": "food_processing",
            "tags": ["pickle", "namkeen"],
            "summary_en": "Food business",
            "summary_hi": "खाद्य व्यवसाय",
        }, headers=self._headers(token))
        rec2 = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()
        food_scores = {x["scheme_id"]: x["match_score"] for x in rec2["recommendations"]}
        moved = [sid for sid in food_scores if food_scores[sid] > baseline.get(sid, 0)]
        self.assertTrue(moved, "confirming a food sector should lift at least one food scheme")

    def test_understand_returns_project_type(self):
        token = self._setup()
        r = self.client.post("/api/ai/understand", json={
            "description": "I run a coaching centre for students"
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["project_type"], "business")
        r2 = self.client.post("/api/ai/understand", json={
            "description": "I want an education loan to study in college"
        }, headers=self._headers(token))
        self.assertEqual(r2.json()["project_type"], "education")

    def test_confirm_persists_project_type(self):
        token = self._setup()
        r = self.client.post("/api/ai/confirm", json={
            "description": "I want to study nursing",
            "sector": "education",
            "tags": ["nursing"],
            "project_type": "education",
            "summary_en": "Study loan",
            "summary_hi": "शिक्षा ऋण",
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        saved = self.client.get("/api/ai/understanding", headers=self._headers(token)).json()
        self.assertEqual(saved["project_type"], "education")
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertEqual(prof["project_type"], "education")


class TestUnderstandFromForm(ApiTestCase):
    def test_answers_drive_understanding_without_description(self):
        token = self._token()
        r = self.client.post("/api/ai/understand-form", json={
            "sector": "food_processing",
            "stage": "existing",
            "support_needs": ["capital", "marketing"],
            "annual_revenue": "under_5l",
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["sector"], "food_processing")
        self.assertEqual(data["stage"], "existing")
        self.assertEqual(data["support_needs"], ["capital", "marketing"])
        self.assertEqual(data["project_type"], "business")
        self.assertTrue(data["summary_en"])
        self.assertIn("food processing", data["summary_en"])

    def test_description_enriches_but_options_win(self):
        token = self._token()
        r = self.client.post("/api/ai/understand-form", json={
            "sector": "agriculture",
            "stage": "new",
            "support_needs": ["subsidy"],
            "description": "I make pickles and namkeen at home and want to start selling",
        }, headers=self._headers(token))
        data = r.json()
        self.assertEqual(data["sector"], "agriculture")
        self.assertEqual(data["stage"], "new")
        self.assertEqual(data["support_needs"], ["subsidy"])
        self.assertIn("pickle", data["tags"])
        self.assertIn("You also told us", data["summary_en"])

    def test_empty_payload_returns_business_default(self):
        token = self._token()
        r = self.client.post("/api/ai/understand-form", json={}, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["project_type"], "business")
        self.assertIsNone(data["sector"])
        self.assertTrue(data["summary_en"])

    def test_explicit_project_type_education_respected_without_description(self):
        token = self._token()
        r = self.client.post("/api/ai/understand-form", json={
            "sector": "education",
            "project_type": "education",
        }, headers=self._headers(token))
        data = r.json()
        self.assertEqual(data["project_type"], "education")
        self.assertEqual(data["sector"], "education")


class TestApplyFromDescription(ApiTestCase):
    def test_creates_minimal_profile_without_form(self):
        token = self._token()
        r = self.client.post("/api/ai/apply-from-description", json={
            "description": "I want to start a bakery business from home and need a loan, and help selling online",
            "social_category": "sc",
            "state": "punjab",
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["sector"], "food_processing")
        self.assertEqual(data["stage"], "new")
        self.assertIn("capital", data["support_needs"])
        self.assertIn("marketing", data["support_needs"])
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertEqual(prof["social_category"], "sc")
        self.assertEqual(prof["state"], "punjab")
        self.assertTrue(prof["ai_confirmed"])
        self.assertEqual(prof["business_sector"], "food_processing")
        self.assertEqual(prof["business_stage"], "new")
        self.assertIn("capital", prof["support_needs"])

    def test_existing_profile_keeps_sector_updates_identity(self):
        token = self._token()
        self._create_profile(token, sector="ecommerce", state="punjab")
        r = self.client.post("/api/ai/apply-from-description", json={
            "description": "I run a dairy selling milk and ghee, want subsidy",
            "social_category": "sc",
            "state": "haryana",
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertEqual(prof["business_sector"], "ecommerce")
        self.assertEqual(prof["social_category"], "sc")
        self.assertEqual(prof["state"], "haryana")
        self.assertIn("subsidy", prof["support_needs"])
        self.assertEqual(prof["description"], "I run a dairy selling milk and ghee, want subsidy")

    def test_sc_describe_flow_persists_income_education_cost(self):
        token = self._token()
        self.client.post("/api/ai/apply-from-description", json={
            "description": "I make papad at home and want a loan to buy a machine",
            "social_category": "sc",
            "state": "bihar",
            "annual_family_income": "2.5l_5l",
            "education_status": "undergraduate",
            "estimated_project_cost": 120000,
        }, headers=self._headers(token))
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertEqual(prof["social_category"], "sc")
        self.assertEqual(prof["annual_family_income"], "2.5l_5l")
        self.assertEqual(prof["education_status"], "undergraduate")
        self.assertEqual(prof["estimated_project_cost"], 120000)

    def test_sc_describe_updates_existing_profile_fields(self):
        token = self._token()
        self._create_profile(token)
        self.client.post("/api/ai/apply-from-description", json={
            "description": "want to scale my spice business",
            "social_category": "sc",
            "state": "madhya_pradesh",
            "annual_family_income": "under_2.5l",
            "education_status": "postgraduate",
            "estimated_project_cost": 3500000,
        }, headers=self._headers(token))
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertEqual(prof["annual_family_income"], "under_2.5l")
        self.assertEqual(prof["education_status"], "postgraduate")
        self.assertEqual(prof["estimated_project_cost"], 3500000)

    def test_sc_describe_without_sc_fields_defaults_clean(self):
        token = self._token()
        self.client.post("/api/ai/apply-from-description", json={
            "description": "I want a loan to start a tailoring shop",
            "social_category": "sc",
            "state": "odisha",
        }, headers=self._headers(token))
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertEqual(prof["annual_family_income"], "")
        self.assertEqual(prof["education_status"], "not_applicable")
        self.assertIsNone(prof["estimated_project_cost"])

    def test_understand_gate_response_includes_stage_and_needs(self):
        token = self._token()
        r = self.client.post("/api/ai/understand", json={
            "description": "I want to start a solar panel business and need a loan for equipment"
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("stage", data)
        self.assertIn("support_needs", data)
        self.assertEqual(data["sector"], "solar_energy")

    def test_confirm_persists_stage_and_support_needs(self):
        token = self._token()
        self._create_profile(token)
        r = self.client.post("/api/ai/confirm", json={
            "description": "scaling up my food business",
            "sector": "food_processing",
            "tags": ["pickle"],
            "stage": "existing",
            "support_needs": ["capital", "training"],
            "summary_en": "Scaling",
            "summary_hi": "विस्तार",
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        saved = self.client.get("/api/ai/understanding", headers=self._headers(token)).json()
        self.assertEqual(saved["stage"], "existing")
        self.assertIn("capital", saved["support_needs"])


class TestProjectTypeApi(ApiTestCase):
    def test_apply_detects_education_project_type(self):
        token = self._token()
        r = self.client.post("/api/ai/apply-from-description", json={
            "description": "I want an education loan to study in college",
            "social_category": "sc",
            "state": "punjab",
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["project_type"], "education")
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertEqual(prof["project_type"], "education")
        self.assertEqual(prof["business_sector"], "education")

    def test_apply_detects_business_project_type(self):
        token = self._token()
        self.client.post("/api/ai/apply-from-description", json={
            "description": "I run a coaching centre for students",
            "social_category": "sc",
            "state": "punjab",
        }, headers=self._headers(token))
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertEqual(prof["project_type"], "business")

    def test_apply_explicit_project_type_override_wins(self):
        token = self._token()
        self.client.post("/api/ai/apply-from-description", json={
            "description": "I run a coaching centre for students",
            "social_category": "sc",
            "state": "punjab",
            "project_type": "education",
        }, headers=self._headers(token))
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertEqual(prof["project_type"], "education")

    def test_education_apply_gets_education_loan(self):
        token = self._token()
        self.client.post("/api/ai/apply-from-description", json={
            "description": "I want an education loan to study in college",
            "social_category": "sc",
            "state": "punjab",
            "annual_family_income": "under_2.5l",
        }, headers=self._headers(token))
        data = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()
        self.assertEqual(data["profile_summary"]["project_type"], "education")
        cats = {x["scheme"].get("loan_category") for x in data["recommendations"]}
        self.assertIn("education", cats)

    def test_education_loan_blocked_for_teaching_business_even_in_education_sector(self):
        token = self._token()
        self.client.post("/api/ai/apply-from-description", json={
            "description": "I run a coaching centre for students",
            "social_category": "sc",
            "state": "punjab",
            "annual_family_income": "under_2.5l",
        }, headers=self._headers(token))
        data = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()
        cats = {x["scheme"].get("loan_category") for x in data["recommendations"]}
        self.assertNotIn("education", cats)

    def test_small_business_tier_boosts_micro_over_term_loan(self):
        token = self._token()
        self.client.post("/api/ai/apply-from-description", json={
            "description": "I make utensils in my small workshop and want a loan for a machine",
            "social_category": "sc",
            "state": "punjab",
            "annual_family_income": "under_2.5l",
            "estimated_project_cost": 100000,
        }, headers=self._headers(token))
        recs = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()["recommendations"]
        micro = [x for x in recs if x["scheme"].get("loan_category") == "micro_finance"]
        term = [x for x in recs if x["scheme"].get("loan_category") == "term_loan"]
        self.assertTrue(micro, "micro_finance scheme should appear for a small project")
        self.assertTrue(term, "term_loan scheme should appear for a small project")
        self.assertEqual(micro[0]["match_breakdown"]["tier_match"], 8)
        self.assertEqual(term[0]["match_breakdown"]["tier_match"], 0)
        self.assertLess(recs.index(micro[0]), recs.index(term[0]))

    def test_profile_endpoints_expose_project_type(self):
        token = self._token()
        self.client.post("/api/profile", json={
            "full_name": "Ravi Kumar",
            "phone_number": "9876500111",
            "state": "punjab",
            "social_category": "sc",
            "annual_family_income": "under_2.5l",
            "education_status": "undergraduate",
            "estimated_project_cost": 300000,
            "project_type": "education",
            "business_name": "Ravi Study",
            "business_sector": "education",
            "business_stage": "planning",
            "support_needs": ["loan"],
        }, headers=self._headers(token))
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertEqual(prof["project_type"], "education")
        up = self.client.put("/api/profile", json={"project_type": "business"}, headers=self._headers(token)).json()
        self.assertEqual(up["project_type"], "business")

    def test_profile_endpoints_expose_ideal_loan_category(self):
        token = self._token()
        self.client.post("/api/profile", json={
            "full_name": "Ravi Kumar",
            "phone_number": "9876500112",
            "state": "punjab",
            "social_category": "sc",
            "annual_family_income": "under_2.5l",
            "estimated_project_cost": 100000,
            "business_name": "Ravi Workshop",
            "business_sector": "all",
            "business_stage": "existing",
        }, headers=self._headers(token))
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertEqual(prof["ideal_loan_category"], "micro_finance")

    def test_profile_summary_exposes_ideal_loan_category(self):
        token = self._token()
        self.client.post("/api/ai/apply-from-description", json={
            "description": "I want an education loan to study in college",
            "social_category": "sc",
            "state": "punjab",
            "annual_family_income": "under_2.5l",
        }, headers=self._headers(token))
        data = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()
        self.assertEqual(data["profile_summary"]["project_type"], "education")
        self.assertEqual(data["profile_summary"]["ideal_loan_category"], "education")


class TestChannelFinance(ApiTestCase):
    def _sc_payload(self, **overrides):
        payload = {
            "full_name": "Ravi Kumar",
            "phone_number": "9876500001",
            "state": "maharashtra",
            "district": "Nagpur",
            "age_group": "26-35",
            "gender": "male",
            "social_category": "sc",
            "annual_family_income": "under_2.5l",
            "education_status": "not_applicable",
            "estimated_project_cost": 100000,
            "business_name": "Ravi Enterprises",
            "business_sector": "manufacturing",
            "business_stage": "existing",
            "annual_revenue": "under_10l",
            "employee_count": "1-5",
            "support_needs": ["loan"],
        }
        payload.update(overrides)
        return payload

    def _sc_setup(self, token_override=None, **overrides):
        token = token_override or self._token()
        r = self.client.post("/api/profile", json=self._sc_payload(**overrides), headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        return token

    def _scheme_ids(self, recs):
        return {x["scheme_id"] for x in recs}

    def test_profile_accepts_channel_finance_fields(self):
        token = self._sc_setup()
        prof = self.client.get("/api/profile", headers=self._headers(token)).json()
        self.assertEqual(prof["annual_family_income"], "under_2.5l")
        self.assertEqual(prof["education_status"], "not_applicable")
        self.assertEqual(prof["estimated_project_cost"], 100000)
        self.assertEqual(prof["social_category"], "sc")

    def test_profile_update_channel_finance_fields(self):
        token = self._sc_setup()
        r = self.client.put("/api/profile", json={
            "annual_family_income": "2.5l_5l",
            "education_status": "undergraduate",
            "estimated_project_cost": 250000,
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["annual_family_income"], "2.5l_5l")
        self.assertEqual(r.json()["education_status"], "undergraduate")
        self.assertEqual(r.json()["estimated_project_cost"], 250000)

    def test_scheme_list_exposes_channel_finance_fields(self):
        token = self._token()
        data = self.client.get("/api/schemes?limit=200", headers=self._headers(token)).json()
        cp = [s for s in data["schemes"] if s.get("loan_category")]
        self.assertTrue(cp, "catalog must expose concessional schemes")
        for s in cp:
            self.assertIn(s["loan_category"], ["micro_finance", "term_loan", "education"])
            self.assertTrue(s["channel_financed"])
            self.assertEqual(s["income_ceiling"], 500000)
            self.assertIsNotNone(s["interest_rate_min"])
            self.assertIsNotNone(s["max_coverage_pct"])

    def test_sc_user_sees_concessional_schemes(self):
        token = self._sc_setup(social_category="sc", annual_family_income="under_2.5l", estimated_project_cost=100000)
        recs = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()["recommendations"]
        concessional = [x for x in recs if x["scheme"].get("loan_category")]
        self.assertTrue(concessional, "SC user should see concessional loan schemes")

    def test_general_user_excluded_from_concessional(self):
        token = self._sc_setup(social_category="general", annual_family_income="under_2.5l", estimated_project_cost=100000)
        recs = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()["recommendations"]
        concessional = [x for x in recs if x["scheme"].get("loan_category")]
        self.assertFalse(concessional, "non-SC user must not get SC concessional schemes")

    def test_income_above_ceiling_excluded(self):
        token = self._sc_setup(social_category="sc", annual_family_income="above_5l", estimated_project_cost=100000)
        recs = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()["recommendations"]
        concessional = [x for x in recs if x["scheme"].get("loan_category")]
        self.assertFalse(concessional, "income above ₹5L must exclude concessional schemes")

    def test_project_cost_tiering_excludes_micro_for_larger_cost(self):
        token = self._sc_setup(social_category="sc", annual_family_income="under_2.5l", estimated_project_cost=300000)
        recs = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()["recommendations"]
        cats = {x["scheme"].get("loan_category") for x in recs}
        self.assertIn("term_loan", cats)
        self.assertNotIn("micro_finance", cats)

    def test_education_loan_requires_education(self):
        token = self._sc_setup(social_category="sc", annual_family_income="under_2.5l", estimated_project_cost=100000,
                                education_status="not_applicable")
        recs = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()["recommendations"]
        cats = {x["scheme"].get("loan_category") for x in recs}
        self.assertNotIn("education", cats)

    def test_education_loan_granted_to_student(self):
        token = self._sc_setup(social_category="sc", annual_family_income="under_2.5l", estimated_project_cost=200000,
                                education_status="undergraduate", project_type="education", business_sector="education")
        recs = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()["recommendations"]
        cats = {x["scheme"].get("loan_category") for x in recs}
        self.assertIn("education", cats)

    def test_general_user_excluded_from_sc_reserved_schemes(self):
        token = self._sc_setup(social_category="general", gender="male")
        recs = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()["recommendations"]
        names = {x["scheme"]["name"] for x in recs}
        reserved = {
            "National Scheduled Castes Finance and Development Corporation",
            "National SC-ST Hub Scheme",
            "Stand-Up India Scheme",
        }
        self.assertFalse(names & reserved, "general user must not get SC/ST-reserved schemes")

    def test_sc_user_sees_sc_reserved_schemes(self):
        token = self._sc_setup(social_category="sc", gender="male")
        recs = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()["recommendations"]
        names = {x["scheme"]["name"] for x in recs}
        self.assertIn("National Scheduled Castes Finance and Development Corporation", names)
        self.assertNotIn("Stand-Up India Scheme", names, "SC/ST women scheme must not be shown to a male SC applicant")

    def test_sc_woman_sees_women_only_combined_schemes(self):
        token = self._sc_setup(social_category="sc", gender="female")
        recs = self.client.post("/api/recommendations", json={}, headers=self._headers(token)).json()["recommendations"]
        names = {x["scheme"]["name"] for x in recs}
        self.assertIn("Stand-Up India Scheme", names)
        self.assertIn("National Scheduled Castes Finance and Development Corporation", names)


class TestSchemes(ApiTestCase):
    def test_list_schemes(self):
        token = self._token()
        r = self.client.get("/api/schemes?limit=200", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["total"], scheme_count())
        self.assertEqual(len(data["schemes"]), scheme_count())

    def test_filter_by_sector(self):
        token = self._token()
        r = self.client.get("/api/schemes", params={"sector": "food_processing"}, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(r.json()["total"], 5)

    def test_get_scheme_detail(self):
        token = self._token()
        r = self.client.get("/api/schemes/1", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertIn("benefits", r.json())

    def test_get_scheme_missing(self):
        token = self._token()
        r = self.client.get("/api/schemes/99999", headers=self._headers(token))
        self.assertEqual(r.status_code, 404)


class TestRecommendations(ApiTestCase):
    def test_recommendations(self):
        token = self._token()
        self._create_profile(token)
        r = self.client.post("/api/recommendations", json={
            "support_needs": ["loan", "training"],
            "language": "en",
            "min_score": 40,
            "max_results": 10,
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("recommendations", data)
        self.assertGreaterEqual(data["total_schemes"], 1)
        first = data["recommendations"][0]
        self.assertIn("match_score", first)
        self.assertIn("match_breakdown", first)
        self.assertIn("explanation", first)
        self.assertTrue(first["explanation"])

    def test_recommendations_without_profile(self):
        token = self._token()
        r = self.client.post("/api/recommendations", json={}, headers=self._headers(token))
        self.assertEqual(r.status_code, 400)

    def test_recommendations_hindi_explanation(self):
        token = self._token()
        self._create_profile(token)
        r = self.client.post("/api/recommendations", json={"language": "hi", "max_results": 5},
                             headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        for rec in r.json()["recommendations"]:
            self.assertTrue(rec["explanation"])


class TestSavedScheme(ApiTestCase):
    def test_save_and_list_and_remove(self):
        token = self._token()
        r = self.client.post("/api/saved-schemes/1", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["scheme"]["id"], 1)

        r2 = self.client.get("/api/saved-schemes", headers=self._headers(token))
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()["total"], 1)

        dup = self.client.post("/api/saved-schemes/1", headers=self._headers(token))
        self.assertEqual(dup.status_code, 400)

        r3 = self.client.delete("/api/saved-schemes/1", headers=self._headers(token))
        self.assertEqual(r3.status_code, 200)

        r4 = self.client.get("/api/saved-schemes", headers=self._headers(token))
        self.assertEqual(r4.json()["total"], 0)


class TestPreferences(ApiTestCase):
    def test_preferences_default(self):
        token = self._token()
        r = self.client.get("/api/preferences", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["language"], "en")
        self.assertEqual(r.json()["theme"], "light")

    def test_preferences_update(self):
        token = self._token()
        self._create_profile(token)
        r = self.client.put("/api/preferences", json={"language": "hi", "theme": "dark"},
                            headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["language"], "hi")
        self.assertEqual(r.json()["theme"], "dark")


class TestQuestionnaireProgress(ApiTestCase):
    def test_default_empty(self):
        token = self._token()
        r = self.client.get("/api/questionnaire/progress", headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["answers"], {})
        self.assertEqual(r.json()["step"], 0)

    def test_save_and_get(self):
        token = self._token()
        r = self.client.put("/api/questionnaire/progress", json={
            "answers": {"full_name": "Amit", "business_sector": "food_processing"},
            "step": 4,
        }, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["step"], 4)

        r2 = self.client.get("/api/questionnaire/progress", headers=self._headers(token))
        self.assertEqual(r2.json()["answers"]["business_sector"], "food_processing")

    def test_progress_isolation_between_users(self):
        t1 = self._token()
        t2 = self._token()
        self.client.put("/api/questionnaire/progress", json={"answers": {"full_name": "A"}, "step": 2}, headers=self._headers(t1))
        r2 = self.client.get("/api/questionnaire/progress", headers=self._headers(t2))
        self.assertEqual(r2.json()["answers"], {})

    def test_overwrite_and_clear(self):
        token = self._token()
        self.client.put("/api/questionnaire/progress", json={"answers": {"x": "1"}, "step": 1}, headers=self._headers(token))
        r = self.client.put("/api/questionnaire/progress", json={"answers": {"x": "2"}, "step": 3}, headers=self._headers(token))
        self.assertEqual(r.json()["step"], 3)
        self.assertEqual(r.json()["answers"]["x"], "2")

        d = self.client.delete("/api/questionnaire/progress", headers=self._headers(token))
        self.assertEqual(d.status_code, 204)
        r2 = self.client.get("/api/questionnaire/progress", headers=self._headers(token))
        self.assertEqual(r2.json()["step"], 0)

    def test_requires_auth(self):
        r = self.client.get("/api/questionnaire/progress")
        self.assertEqual(r.status_code, 401)


class TestHealth(ApiTestCase):
    def test_health(self):
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "ok")


if __name__ == "__main__":
    unittest.main()