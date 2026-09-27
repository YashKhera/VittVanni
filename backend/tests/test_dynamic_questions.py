import os
import tempfile
import unittest
from types import SimpleNamespace
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
from app.services.dynamic_question_service import (  # noqa: E402
    DynamicQuestionService,
    _parse_llm,
    _matches,
)
from data.schemes_seed import seed_schemes  # noqa: E402

_BASE_QUESTION_IDS = {
    "full_name", "phone_number", "age_group", "gender", "business_sector",
    "state", "business_stage", "annual_revenue",
}


def fake_profile(**kw):
    defaults = dict(
        business_sector="food_processing",
        business_stage="existing",
        annual_family_income="2.5l_5l",
        social_category="sc",
        education_status="not_applicable",
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


class TestBankSelection(unittest.TestCase):
    def test_sector_scoped_questions(self):
        service = DynamicQuestionService()
        with mock.patch.object(service, "_ai_questions", return_value=([], "bank")):
            ids = [q["id"] for q in service.get_dynamic_questions(fake_profile(), {})[0]]
            self.assertIn("fp_raw_material", ids)
            self.assertIn("fp_cold_storage", ids)
            for other in ("hc_products", "dy_herd", "ec_platforms", "ag_land"):
                self.assertNotIn(other, ids)

    def test_never_asks_profile_basics(self):
        service = DynamicQuestionService()
        with mock.patch.object(service, "_ai_questions", return_value=([], "bank")):
            ids = [q["id"] for q in service.get_dynamic_questions(fake_profile(), {})[0]]
            self.assertFalse(set(ids) & _BASE_QUESTION_IDS)

    def test_skips_answered_questions(self):
        service = DynamicQuestionService()
        answered = {"existing_loan": "yes", "collateral": "none"}
        with mock.patch.object(service, "_ai_questions", return_value=([], "bank")):
            ids = [q["id"] for q in service.get_dynamic_questions(fake_profile(), answered)[0]]
            self.assertNotIn("existing_loan", ids)
            self.assertNotIn("collateral", ids)

    def test_new_stage_gets_start_capital_only(self):
        service = DynamicQuestionService()
        with mock.patch.object(service, "_ai_questions", return_value=([], "bank")):
            ids = [q["id"] for q in service.get_dynamic_questions(fake_profile(business_stage="new"), {})[0]]
            self.assertIn("start_capital", ids)
            self.assertNotIn("monthly_earnings", ids)
            self.assertNotIn("current_financing", ids)

    def test_existing_stage_gets_earnings_questions(self):
        service = DynamicQuestionService()
        with mock.patch.object(service, "_ai_questions", return_value=([], "bank")):
            ids = [q["id"] for q in service.get_dynamic_questions(fake_profile(business_stage="existing"), {})[0]]
            self.assertIn("monthly_earnings", ids)
            self.assertIn("current_financing", ids)
            self.assertNotIn("start_capital", ids)

    def test_education_gated_by_student_status(self):
        service = DynamicQuestionService()
        with mock.patch.object(service, "_ai_questions", return_value=([], "bank")):
            non_student = [
                q["id"] for q in service.get_dynamic_questions(fake_profile(education_status="not_applicable"), {})[0]
            ]
            self.assertNotIn("ed_loan_needed", non_student)
            student = [
                q["id"] for q in service.get_dynamic_questions(
                    fake_profile(business_sector="education", education_status="undergraduate"), {}
                )[0]
            ]
            self.assertIn("ed_loan_needed", student)
            self.assertIn("ed_course", student)
            self.assertNotIn("ed_course_goal", student)

    def test_caps_total_and_sector_count(self):
        service = DynamicQuestionService()
        with mock.patch.object(service, "_ai_questions", return_value=([], "bank")):
            questions, source = service.get_dynamic_questions(fake_profile(), {})
            self.assertEqual(source, "bank")
            self.assertLessEqual(len(questions), 8)
            sector_ids = [q["id"] for q in questions if q["id"].startswith("fp_")]
            self.assertLessEqual(len(sector_ids), 4)

    def test_bank_questions_have_simple_shape(self):
        service = DynamicQuestionService()
        with mock.patch.object(service, "_ai_questions", return_value=([], "bank")):
            for q in service.get_dynamic_questions(fake_profile(), {})[0]:
                self.assertTrue(q["id"])
                self.assertTrue(q["title"]["en"].strip())
                self.assertTrue(q["title"]["hi"].strip())
                if q["type"] in {"single", "multi"}:
                    self.assertTrue(q.get("options"), f"{q['id']} needs options")


class TestAIPath(unittest.TestCase):
    def test_ai_success_returns_source_ai(self):
        with mock.patch("app.config.settings.GEMINI_API_KEY", "test-key"):
            service = DynamicQuestionService()
            with mock.patch(
                "app.services.dynamic_question_service.call_gemini_text", return_value=json_sample()
            ):
                questions, source = service.get_dynamic_questions(fake_profile(), {})
        self.assertEqual(source, "ai")
        self.assertTrue(questions)
        self.assertEqual(questions[0]["id"], "ai_capacity")

    def test_ai_failure_falls_back_to_bank(self):
        with mock.patch("app.config.settings.GEMINI_API_KEY", "test-key"):
            service = DynamicQuestionService()
            with mock.patch(
                "app.services.dynamic_question_service.call_gemini_text", return_value=""
            ):
                questions, source = service.get_dynamic_questions(fake_profile(), {})
        self.assertEqual(source, "bank")
        self.assertTrue(questions)

    def test_ai_exception_falls_back_to_bank(self):
        with mock.patch("app.config.settings.GEMINI_API_KEY", "test-key"):
            service = DynamicQuestionService()
            with mock.patch(
                "app.services.dynamic_question_service.call_gemini_text",
                side_effect=RuntimeError("boom"),
            ):
                questions, source = service.get_dynamic_questions(fake_profile(), {})
        self.assertEqual(source, "bank")
        self.assertTrue(questions)

    def test_parse_llm_handles_fences_and_garbage(self):
        good = json_sample()
        self.assertEqual(_parse_llm("```json\n" + good + "\n```")[0]["id"], "ai_capacity")
        self.assertEqual(_parse_llm("not json at all"), [])
        self.assertEqual(_parse_llm("[1, 2, 3]"), [])
        bad_item = '[{"id": "x", "type": "single", "title": {"en": "T"}, "options": []}]'
        self.assertEqual(_parse_llm(bad_item), [])
        self.assertEqual(_parse_llm(""), [])


def json_sample():
    return (
        '[{"id": "ai_capacity", "type": "single", '
        '"title": {"en": "How many batches daily?", "hi": "रोज़ कितने बैच?"}, '
        '"help": {"en": "Capacity hint", "hi": "क्षमता संकेत"}, '
        '"options": [{"value": "one", "en": "1", "hi": "1"}, '
        '{"value": "two", "en": "2", "hi": "2"}]}]'
    )


class ApiTestCase(unittest.TestCase):
    _counter = 0

    @classmethod
    def setUpClass(cls):
        from app import models  # noqa: F401
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            seed_schemes(db)
        finally:
            db.close()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        try:
            os.unlink(_tmp.name)
        except OSError:
            pass

    def _email(self):
        ApiTestCase._counter += 1
        return f"dyn_{ApiTestCase._counter}@example.com"

    def _token(self):
        from unittest import mock
        email = self._email()
        with mock.patch("app.services.auth_service.secrets.randbelow", return_value=424242):
            self.client.post("/api/auth/otp/request-signup", json={"email": email})
        r = self.client.post("/api/auth/otp/verify-signup", json={"email": email, "otp": "424242"})
        return r.json()["access_token"]

    def _headers(self, token):
        return {"Authorization": f"Bearer {token}"}

    def _create_profile(self, token):
        payload = {
            "full_name": "Ravi Kumar",
            "phone_number": "9876543210",
            "state": "maharashtra",
            "district": "Nagpur",
            "age_group": "26-35",
            "gender": "male",
            "social_category": "sc",
            "annual_family_income": "2.5l_5l",
            "education_status": "not_applicable",
            "estimated_project_cost": 200000,
            "business_name": "Ravi Foods",
            "business_sector": "food_processing",
            "business_stage": "existing",
            "annual_revenue": "1_10",
            "employee_count": "1-5",
            "support_needs": ["loan"],
        }
        return self.client.post("/api/profile", json=payload, headers=self._headers(token))


class TestDynamicEndpoint(ApiTestCase):
    def test_returns_personalised_questions(self):
        token = self._token()
        self.assertEqual(self._create_profile(token).status_code, 200)
        r = self.client.post("/api/questionnaire/dynamic", json={"answers": {}}, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn(data["source"], {"ai", "bank"})
        ids = []
        for q in data["questions"]:
            self.assertIn(q["type"], {"single", "multi", "text"})
            self.assertIn("en", q["title"])
            self.assertIn("hi", q["title"])
            ids.append(q["id"])
        self.assertIn("fp_raw_material", ids)
        self.assertNotIn("full_name", ids)

    def test_answered_questions_not_returned(self):
        token = self._token()
        self.assertEqual(self._create_profile(token).status_code, 200)
        r = self.client.post(
            "/api/questionnaire/dynamic",
            json={"answers": {"fp_raw_material": "own_farm", "existing_loan": "no"}},
            headers=self._headers(token),
        )
        ids = [q["id"] for q in r.json()["questions"]]
        self.assertNotIn("fp_raw_material", ids)
        self.assertNotIn("existing_loan", ids)

    def test_no_profile_returns_empty(self):
        token = self._token()
        r = self.client.post("/api/questionnaire/dynamic", json={"answers": {}}, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["questions"], [])

    def test_progress_round_trip(self):
        token = self._token()
        self.assertEqual(self._create_profile(token).status_code, 200)
        progress = {"answers": {"fp_raw_material": "own_farm", "existing_loan": "no"}, "step": 2}
        r = self.client.put("/api/questionnaire/progress", json=progress, headers=self._headers(token))
        self.assertEqual(r.status_code, 200)
        saved = r.json()["answers"]
        self.assertEqual(saved["fp_raw_material"], "own_farm")
        self.assertEqual(saved["existing_loan"], "no")


if __name__ == "__main__":
    unittest.main()