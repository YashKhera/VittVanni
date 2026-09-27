"""Vercel serverless entrypoint for VittVanni."""
import os
import sys
import traceback

# Fix Neon channel_binding on Vercel (causes write failures)
_db_url = os.environ.get("DATABASE_URL", "")
if "channel_binding=require" in _db_url and os.environ.get("VERCEL"):
    os.environ["DATABASE_URL"] = _db_url.replace("&channel_binding=require", "").replace("?channel_binding=require", "")

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from fastapi import Request  # noqa: E402
from fastapi.routing import APIRoute  # noqa: E402
from starlette.responses import JSONResponse, RedirectResponse  # noqa: E402
from starlette.staticfiles import StaticFiles  # noqa: E402

from app.main import app as _api_app  # noqa: E402
from data.schemes_seed import seed_schemes  # noqa: E402
from data.partners_seed import seed_partners  # noqa: E402

# Seed DB on first cold start
if os.environ.get("VERCEL"):
    try:
        from app.database import SessionLocal
        from app.models.scheme import Scheme
        from app.models.channel_partner import ChannelPartner
        with SessionLocal() as db:
            if db.query(Scheme).count() == 0:
                seed_schemes(db)
            if db.query(ChannelPartner).count() == 0:
                seed_partners(db)
    except Exception as exc:
        print("DB bootstrap skipped:", exc)

# Remove inner root "/" route (conflicts with static index.html)
_api_app.router.routes = [
    r for r in _api_app.router.routes
    if not (isinstance(r, APIRoute) and r.path == "/")
]

# Exception handler: always log + return error detail
async def _on_error(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"UNHANDLED {type(exc).__name__}: {exc}")
    print(tb)
    return JSONResponse(
        {"error": f"{type(exc).__name__}: {exc}"},
        status_code=500,
    )

_api_app.add_exception_handler(Exception, _on_error)

# Clean-URL support: serve /partners from partners.html (address bar stays
# clean) and 301-redirect legacy .html URLs to their clean form.
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_static_dir = None
for _d in ("backend/frontend", "frontend"):
    _dir = os.path.join(_root, _d)
    if os.path.isdir(_dir):
        _static_dir = _dir
        break

# Friendly slugs shown in the address bar (files stay as-is on disk).
SLUGS = {
    "home": "index.html",
    "login": "login.html",
    "signup": "register.html",
    "find-schemes": "questionnaire.html",
    "my-schemes": "results.html",
    "scheme": "scheme-details.html",
    "saved": "saved-schemes.html",
    "emi-calculator": "calculator.html",
    "partners": "partners.html",
    "profile": "profile-view.html",
    "profile/edit": "profile.html",
    "oauth/callback": "oauth/callback.html",
}

# Retired paths (first clean-URL pass + legacy .html) -> current slugs.
LEGACY = {
    "index": "home",
    "register": "signup",
    "questionnaire": "find-schemes",
    "results": "my-schemes",
    "scheme-details": "scheme",
    "saved-schemes": "saved",
    "calculator": "emi-calculator",
    "profile-view": "profile",
}

_API_PREFIXES = ("/api", "/docs", "/openapi", "/redoc")


@_api_app.middleware("http")
async def _clean_urls(request: Request, call_next):
    path = request.url.path
    if path.endswith(".html"):
        legacy = path[1:-5] or "index"
        slug = "/" + LEGACY.get(legacy, legacy)
        return RedirectResponse(url=str(request.url.replace(path=slug)), status_code=301)
    if path == "/":
        return await call_next(request)  # StaticFiles serves index.html
    if path == "/home":
        request.scope["path"] = "/index.html"
        request.scope["raw_path"] = b"/index.html"
        return await call_next(request)
    if (
        path.endswith("/")
        and not path.startswith(_API_PREFIXES)
        and "." not in path.rsplit("/", 1)[-1]
    ):
        return RedirectResponse(
            url=str(request.url.replace(path=path.rstrip("/"))), status_code=301)
    stripped = path.strip("/")
    if stripped in LEGACY:
        return RedirectResponse(
            url=str(request.url.replace(path="/" + LEGACY[stripped])), status_code=301)
    if (
        _static_dir
        and not path.startswith(_API_PREFIXES)
        and "." not in path.rsplit("/", 1)[-1]  # not a file asset
        and stripped in SLUGS
    ):
        target = "/" + SLUGS[stripped]
        request.scope["path"] = target
        request.scope["raw_path"] = target.encode("latin-1")
    return await call_next(request)


# Mount static frontend
if _static_dir:
    _api_app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")

app = _api_app