<div align="center">

# VittVanni

### AI-Powered Government Scheme Analyzer for Marginalized Entrepreneurs & Students

[![Smart India Hackathon 2026](https://img.shields.io/badge/Smart_India_Hackathon-2026-blue)](https://sih.gov.in/sih2026PS)
[![Live Demo](https://img.shields.io/badge/Live_Demo-vitt--vaani.vercel.app-green)](https://vitt-vaani.vercel.app)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://docs.python.org/release/3.14.7/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Neon Postgres](https://img.shields.io/badge/Neon_Postgres-Production-00E599?logo=postgresql&logoColor=white)](https://neon.com/docs/introduction)

</div>

---

VittVanni helps **women, SC/ST/OBC, persons with disabilities, and rural micro-entrepreneurs** discover the **government schemes they are actually eligible for** — not just a generic list. Tell us about your background once, and get ranked, eligibility-scored recommendations with clear reasons, in your own language. Then **apply inside the portal** through a registered channel partner, track the application live, and chat with the partner until approval.

Supports both **business/entrepreneurship** schemes (MUDRA, PMEGP, Stand-Up India, etc.) and **education loan** schemes (Vidya Lakshmi, CSIS, Dr. Ambedkar CSS, scholarships for SC/ST/minority/PwD students, state-specific schemes).

---

## Key Features

| Feature | Description |
|---------|-------------|
| **AI Business Understanding** | Describe your business in plain words; Gemini extracts sector, stage, and support needs. Works with no API key via rule-based fallback. |
| **Education & Business Flows** | Students get education-specific questions and only see education loan/scholarship schemes. Business users see only entrepreneurship schemes. |
| **State-Aware Hard Filtering** | State-specific schemes (Maharashtra, Delhi, West Bengal, etc.) are blocked for users outside those states — recommendations are always actionable. |
| **90+ Government Schemes** | Central + state schemes: MUDRA, PMEGP, Vidya Lakshmi, CSIS, Dr. Ambedkar CSS, Post-Matric SC, 15+ state schemes (Maharashtra, Delhi, UP, Bihar, West Bengal, NE). |
| **Eligibility Matching Engine** | Hard eligibility-rule filter → weighted relevance scoring → ranked results with score breakdown per scheme. |
| **AI Explanations** | Top matches get a plain-language "why it fits you" summary generated concurrently, then cached for instant repeat loads. |
| **In-Portal Applications** | Apply for a scheme without leaving the site: pick a serving channel partner, fill a dynamic per-scheme document form (PAN/Aadhaar masked), get a unique `VV-YYYY-XXXXXX` application number. |
| **Live Application Tracking + Chat** | Watch status move submitted → under review → approved/rejected, and chat WhatsApp-style with the partner during review. |
| **Channel Partner Portal** | Partners register via OTP, pick the schemes they serve, see beneficiary counts, and approve/reject/review applicants — applicants outside their schemes are invisible to them. |
| **Passwordless OTP Auth** | No passwords anywhere: signup and login both run on single-use email codes (English + Hindi mails). |
| **Adaptive Questionnaire** | Profile basics are prefilled; dynamic follow-ups ask sector/stage/education-specific questions from a curated bank. |
| **Describe-First Onboarding** | Type or speak your business description — AI extracts everything, then a 2-tap pick completes the profile. |
| **Multilingual UI** | 23 Indian languages (English, Hindi, 11 full packs + 10 regional core packs with English fallback). |
| **Dark Mode** | OS-preference aware and persisted. |
| **Saved Schemes** | Bookmark and revisit schemes anytime. |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5 · CSS3 · Vanilla JavaScript (ES6+) — no build step |
| **Backend** | Python 3.10+ · FastAPI · Uvicorn |
| **Database** | Neon Postgres (production) · SQLite (local dev) |
| **ORM** | SQLAlchemy 2.x |
| **Auth** | Passwordless OTP (email codes, EN+HI) · JWT (`python-jose` + `bcrypt`) |
| **AI** | Google Gemini + built-in rule fallback |
| **Hosting** | Vercel (frontend + serverless functions) |
| **DB Hosting** | Neon (serverless Postgres with branching) |

---

## Project Structure

```
VittVanni/
├── backend/
│   ├── app/
│   │   ├── routers/          # auth (OTP-only), profile, questionnaire, schemes,
│   │   │                     # recommendations, saved, preferences, ai-understanding,
│   │   │                     # applications, partner_portal, calculator
│   │   ├── services/         # matching, understanding (Gemini + fallback), email,
│   │   │                     # auth, ai_service (cached explanations), application_service
│   │   ├── models/           # users (roles), schemes, applications, messages,
│   │   │                     # partner profiles/schemes, explanations, OTP codes
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── config.py         # settings (reads backend/.env)
│   │   └── main.py           # FastAPI app + CORS
│   ├── data/
│   │   └── schemes_seed.py   # curated schemes (central + state + SC concessional)
│   ├── frontend/             # static SPA served by Vercel
│   │   ├── index.html (landing), apply.html, my-applications.html,
│   │   │   partner-dashboard.html, questionnaire.html, results.html
│   │   ├── scheme-details.html, saved-schemes.html, login.html
│   │   ├── js/i18n/lang/     # 23 language packs
│   │   ├── css/              # design system (variables, themes, responsive)
│   │   └── js/pages/         # page controllers (apply, partner-dashboard, results, etc.)
│   ├── migrations/           # idempotent SQLite/Postgres migrations
│   ├── tests/                # pytest suite (OTP + applications flows)
│   ├── requirements.txt
│   └── run.py                # dev server → http://127.0.0.1:8001
├── 01-PRD.md … 13-contributing.md   # design docs
├── vercel.json                       # Vercel config (no rewrites needed)
└── README.md
```

---

## Quick Start

### Prerequisites

- Python 3.10+
- Git
- Neon account (for production Postgres) or SQLite for local dev

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate              # Windows
# source .venv/bin/activate        # macOS/Linux

pip install -r requirements.txt

# Configure environment (optional — defaults work for local dev)
copy .env.example .env              # Windows
# fill in GEMINI_API_KEY (optional), DATABASE_URL (for Neon/Postgres)

# Seed the scheme catalog (90+ schemes)
python -m data.schemes_seed

# Run the API on http://127.0.0.1:8001
python run.py
```

API docs available at `http://127.0.0.1:8001/docs` (Swagger UI).

### 2. Frontend

```bash
cd backend/frontend
python serve.py                     # → http://127.0.0.1:8080
```

Open `http://127.0.0.1:8080`, register, complete your profile, and view matched schemes.

### 3. Run Tests

```bash
cd backend
python -m pytest tests -q
```

Tests are hermetic — no live AI/network required.

---

## API Reference

Base: `http://127.0.0.1:8001/api` · Docs: `/docs`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/otp/request-signup` | Email a signup code (409 if account exists) |
| `POST` | `/auth/otp/verify-signup` | Verify code → create account + JWT |
| `POST` | `/auth/otp/request` | Email a login code |
| `POST` | `/auth/otp/login` | Verify code → JWT |
| `GET` | `/profile` | Get current profile |
| `POST` | `/profile` | Create profile |
| `PUT` | `/profile` | Update profile |
| `GET` | `/questionnaire/progress` | Get saved questionnaire answers |
| `PUT` | `/questionnaire/progress` | Save questionnaire progress |
| `POST` | `/questionnaire/dynamic` | Get personalized follow-up questions |
| `GET` | `/schemes` | List all schemes (paginated) |
| `GET` | `/schemes/stats` | Public scheme + partner counts (landing) |
| `GET` | `/schemes/{id}` | Get scheme details |
| `GET` | `/applications/doc-schema/{id}` | Dynamic document fields for a scheme |
| `GET` | `/applications/partners` | Partners serving a scheme (optional state filter) |
| `POST` | `/applications` | Submit an application (validated docs) |
| `GET` | `/applications` | My applications with live status |
| `GET/POST` | `/applications/{id}/messages` | Review-phase chat (both roles) |
| `GET/PUT` | `/partner/schemes` | Partner's schemes + beneficiary counts / set schemes |
| `GET` | `/partner/applications` | Applicant inbox (own schemes only) |
| `GET` | `/partner/applications/{id}` | Applicant detail (contact unlocks in review) |
| `POST` | `/partner/applications/{id}/status` | Approve / reject / mark in review |
| `GET/PUT` | `/partner/profile` | Partner organisation profile |
| `GET` | `/ai/understanding` | Get current AI understanding |
| `POST` | `/ai/understand` | AI infers sector/tags/stage from description |
| `POST` | `/ai/apply-from-description` | Auto-build profile from description |
| `POST` | `/ai/confirm` | Accept AI understanding (unlocks recommendations) |
| `POST` | `/recommendations` | Get ranked, personalized scheme recommendations |
| `POST` | `/saved-schemes/{id}` | Bookmark a scheme |
| `DELETE` | `/saved-schemes/{id}` | Remove bookmark |
| `GET` | `/saved-schemes` | List saved schemes |
| `GET` | `/preferences` | Get UI preferences |
| `PUT` | `/preferences` | Update UI preferences |

---

## Deployment

### Vercel (Production)

The app is deployed on Vercel with Neon Postgres as the database backend.

```bash
# Deploy to Vercel
npx vercel --prod --yes --name vitt-vaani

# Promote to production
npx vercel promote <deployment-url> --yes
```

**Environment Variables** (set in Vercel Dashboard):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon Postgres pooled connection string |
| `SECRET_KEY` | JWT signing key (64-char hex) |
| `ENVIRONMENT` | `production` |
| `FRONTEND_URL` | `https://vitt-vaani.vercel.app` |
| `GEMINI_API_KEY` | (optional) Google Gemini API key |
| `SMTP_HOST` / `SMTP_PORT` | SMTP server for OTP mails (e.g. `smtp.gmail.com` / `587`) |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | SMTP credentials (Gmail app password) |
| `EMAIL_FROM` | Sender address for OTP mails |

### Local Development

```bash
# Backend
cd backend
python run.py                      # → http://127.0.0.1:8001

# Frontend
cd backend/frontend
python serve.py                    # → http://127.0.0.1:8080
```

---

## Security

- `backend/.env` is git-ignored — never committed.
- `backend/*.db` (SQLite files) are git-ignored.
- Frontend is intentionally static and public.
- JWT tokens for auth; **no passwords are stored** — signup/login run on single-use OTP codes, new accounts get an unusable random secret.
- Sensitive IDs (PAN/Aadhaar) are masked for partners and gated by role; contact details unlock only during review.
- CORS restricted to configured origins in production.

For production hardening see [`10-security.md`](./10-security.md).

---

## Documentation

| # | Doc | Covers |
|---|-----|--------|
| 01 | [`01-PRD.md`](./01-PRD.md) | Product requirements, personas, success metrics |
| 02 | [`02-RD.md`](./02-RD.md) | Functional & non-functional requirements |
| 03 | [`03-tech-stack.md`](./03-tech-stack.md) | Stack rationale & versions |
| 04 | [`04-architecture.md`](./04-architecture.md) | Architecture, matching pipeline, data flow |
| 05 | [`05-api-contract.md`](./05-api-contract.md) | REST contract & error shapes |
| 06 | [`06-database-schema.md`](./06-database-schema.md) | Tables & relationships |
| 07 | [`07-user-stories.md`](./07-user-stories.md) | Stories & acceptance criteria |
| 08 | [`08-design-system.md`](./08-design-system.md) | UI/UX, components, i18n, theming |
| 09 | [`09-testing.md`](./09-testing.md) | Test strategy & commands |
| 10 | [`10-security.md`](./10-security.md) | Auth, secrets, data handling |
| 11 | [`11-deployment.md`](./11-deployment.md) | Deploy & runbooks |
| 12 | [`12-roadmap.md`](./12-roadmap.md) | Milestones & backlog |
| 13 | [`13-contributing.md`](./13-contributing.md) | Workflow & conventions |

---

## Team

**VittVanni** — Smart India Hackathon 2026

<div align="center">

Made with purpose for India's marginalized entrepreneurs and students.

</div>
