import hashlib
import json
import re
from typing import Optional

from app.config import settings
from app.database import SessionLocal
from app.models.profile import EntrepreneurProfile
from app.models.scheme import Scheme
from app.models.scheme_explanation import SchemeExplanation
from app.services.gemini_client import call_gemini_text


class AIExplanationService:
    def __init__(self):
        self.client = None
        self.enabled = bool(settings.GEMINI_API_KEY or settings.AI_API_KEY)
        if not self.enabled:
            return
        if settings.AI_API_KEY:
            try:
                import anthropic
                self.client = anthropic.Anthropic(api_key=settings.AI_API_KEY)
            except Exception:
                self.client = None

    @staticmethod
    def _gemini_text(prompt: str) -> str:
        return call_gemini_text(prompt, max_tokens=1024)

    @staticmethod
    def _from_json(data) -> str:
        """Extract plain prose from a decoded JSON value (str/list/dict)."""
        if isinstance(data, str):
            return data.strip()
        if isinstance(data, list):
            parts = [AIExplanationService._from_json(x) for x in data]
            return " ".join(p for p in parts if p).strip()
        if isinstance(data, dict):
            for key in ("explanation", "text", "summary", "reason", "message", "content"):
                value = data.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            for value in data.values():
                s = AIExplanationService._from_json(value)
                if s:
                    return s
        return ""

    @staticmethod
    def _clean_text(text: str) -> str:
        """Force model output to plain prose; models sometimes return JSON."""
        if not text:
            return ""
        t = text.strip()
        if t.startswith("```"):
            t = re.sub(r"^```(?:json)?\s*", "", t)
            t = re.sub(r"\s*```$", "", t).strip()
        if (t.startswith("{") and t.endswith("}")) or (t.startswith("[") and t.endswith("]")):
            try:
                extracted = AIExplanationService._from_json(json.loads(t))
                if extracted:
                    return extracted
            except Exception:
                pass
        return t.strip()

    @staticmethod
    def criteria_key(profile: EntrepreneurProfile, matched_criteria: list[str]) -> str:
        parts = [
            (profile.business_sector or "").lower().strip(),
            (profile.state or "").lower().strip(),
            (profile.business_stage or "").lower().strip(),
            (profile.gender or "").lower().strip(),
        ]
        parts.extend(sorted((c or "").lower().strip() for c in (matched_criteria or [])))
        return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()

    def _cached_explanation(self, profile: EntrepreneurProfile, scheme: Scheme,
                            matched_criteria: list[str], language: str) -> Optional[str]:
        try:
            session = SessionLocal()
            try:
                row = (
                    session.query(SchemeExplanation)
                    .filter(
                        SchemeExplanation.scheme_id == scheme.id,
                        SchemeExplanation.language == language,
                        SchemeExplanation.criteria_key == self.criteria_key(profile, matched_criteria),
                    )
                    .first()
                )
                return row.explanation if row and row.explanation else None
            finally:
                session.close()
        except Exception:
            return None

    def _store_explanation(self, profile: EntrepreneurProfile, scheme: Scheme,
                           matched_criteria: list[str], language: str, explanation: str) -> None:
        try:
            session = SessionLocal()
            try:
                key = self.criteria_key(profile, matched_criteria)
                existing = (
                    session.query(SchemeExplanation)
                    .filter(
                        SchemeExplanation.scheme_id == scheme.id,
                        SchemeExplanation.language == language,
                        SchemeExplanation.criteria_key == key,
                    )
                    .first()
                )
                if existing:
                    existing.explanation = explanation
                else:
                    session.add(
                        SchemeExplanation(
                            scheme_id=scheme.id,
                            language=language,
                            criteria_key=key,
                            explanation=explanation,
                        )
                    )
                session.commit()
            finally:
                session.close()
        except Exception:
            pass

    def _fallback(self, profile: EntrepreneurProfile, scheme: Scheme, matched_criteria: list[str], language: str) -> str:
        joined = ", ".join(matched_criteria) if matched_criteria else "no specific matches yet"
        if language == "hi":
            return (
                f"{scheme.name} आपके व्यवसाय के लिए एक अच्छा विकल्प हो सकता है। "
                f"मेल होने के कारण: {joined}। अधिक जानकारी के लिए आधिकारिक लिंक देखें।"
            )
        return (
            f"{scheme.name} looks like a good fit for your business. "
            f"Match factors: {joined}. Check the official link for application details."
        )

    def generate_explanation(self, profile: EntrepreneurProfile, scheme: Scheme,
                             matched_criteria: list[str], language: str = "en") -> str:
        cached = self._cached_explanation(profile, scheme, matched_criteria, language)
        if cached:
            cleaned = self._clean_text(cached)
            if cleaned:
                if cleaned != cached:
                    self._store_explanation(profile, scheme, matched_criteria, language, cleaned)
                return cleaned
            # Cached value is unusable prose-wise: fall through and regenerate.
        if not self.enabled:
            return self._fallback(profile, scheme, matched_criteria, language)
        prompt = (
            "Generate a brief, helpful explanation (2-3 sentences) of why this government scheme "
            "is a good match for this entrepreneur.\n\n"
            f"Entrepreneur:\n- Sector: {profile.business_sector}\n- Location: {profile.state}\n"
            f"- Business Stage: {profile.business_stage}\n- Gender: {profile.gender}\n"
            f"- Business Description: {profile.description or 'Not provided'}\n"
            f"- AI-understood tags: {', '.join(profile.ai_tags or []) if profile.ai_confirmed else 'none'}\n\n"
            f"Scheme:\n- Name: {scheme.name}\n- Focus: {', '.join(scheme.sectors or [])}\n"
            f"- Support: {', '.join(scheme.support_types or [])}\n\n"
            f"Matched criteria: {', '.join(matched_criteria) if matched_criteria else 'none'}\n\n"
            f"Write in simple, encouraging language. Language: {language}"
        )
        try:
            text = ""
            if settings.GEMINI_API_KEY:
                text = self._gemini_text(prompt)
            if not text and self.client is not None:
                message = self.client.messages.create(
                    model=settings.AI_MODEL,
                    max_tokens=200,
                    messages=[{"role": "user", "content": prompt}],
                )
                text = message.content[0].text
            explanation = text.strip() if text else self._fallback(profile, scheme, matched_criteria, language)
            explanation = self._clean_text(explanation) or self._fallback(profile, scheme, matched_criteria, language)
            if explanation:
                self._store_explanation(profile, scheme, matched_criteria, language, explanation)
            return explanation
        except Exception:
            return self._fallback(profile, scheme, matched_criteria, language)


ai_service = AIExplanationService()