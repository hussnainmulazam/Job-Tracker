import asyncio
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.db import init_db, engine
from sqlmodel import Session, select
from app.routers import (
    ai,
    api_router,
    auth_google,
    health_router,
    integrations_google,
    debug,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _periodic_gmail_sync_worker():
    """Background task that runs automatic Gmail sync every 15 minutes for connected accounts."""
    logger.info("Periodic Gmail sync worker initiated (every 15 minutes).")
    # Initial sleep to allow application to fully start
    await asyncio.sleep(15)
    while True:
        try:
            from app.models.google_account import GoogleAccount
            from app.services.google_service import GoogleService

            with Session(engine) as session:
                accounts = session.exec(select(GoogleAccount)).all()
                for account in accounts:
                    if account.last_sync_status == "token_revoked":
                        continue
                    try:
                        logger.info("Automatic Gmail sync starting for %s (user: %s)...", account.email, account.user_id)

                        def _sync_user(target_user_id):
                            with Session(engine) as sync_session:
                                s = GoogleService(sync_session)
                                return s.sync_gmail(user_id=target_user_id)

                        res = await asyncio.to_thread(_sync_user, account.user_id)
                        logger.info(
                            "Automatic Gmail sync for %s complete: %s found, %s processed, %s candidates created.",
                            account.email,
                            res.messages_found,
                            res.messages_processed,
                            res.candidates_created,
                        )
                    except Exception as sync_err:
                        logger.warning("Automatic Gmail sync error for user %s (%s): %s", account.user_id, account.email, sync_err)
        except asyncio.CancelledError:
            logger.info("Periodic Gmail sync worker cancelled.")
            break
        except Exception as exc:
            logger.error("Periodic Gmail sync unexpected loop exception: %s", exc)

        # 15 minutes interval = 900 seconds
        await asyncio.sleep(900)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up %s (v%s)...", settings.PROJECT_NAME, settings.VERSION)
    if os.getenv("TESTING") != "true":
        try:
            init_db()
            logger.info("Database tables initialized successfully via Supabase.")
        except Exception as exc:
            logger.warning("Could not connect to database at startup: %s", exc)

    sync_task = None
    if os.getenv("TESTING") != "true":
        sync_task = asyncio.create_task(_periodic_gmail_sync_worker())

        # Validate WhatsApp Cloud API token on startup
        try:
            from app.services.whatsapp_service import whatsapp_service
            wa_status = whatsapp_service.validate_token()
            if wa_status.get("is_expired"):
                logger.warning(
                    "⚠️  WhatsApp Token Expired on startup: %s",
                    wa_status.get("status_message"),
                )
            elif wa_status.get("valid"):
                logger.info(
                    "WhatsApp Cloud API connected: %s (%s, Rating: %s)",
                    wa_status.get("verified_name"),
                    wa_status.get("display_phone_number"),
                    wa_status.get("quality_rating"),
                )
            else:
                logger.info("WhatsApp Cloud API status: %s", wa_status.get("status_message"))
        except Exception as wa_exc:
            logger.warning("Could not validate WhatsApp token on startup: %s", wa_exc)

    yield

    if sync_task:
        sync_task.cancel()
        try:
            await sync_task
        except asyncio.CancelledError:
            pass
    logger.info("Shutting down %s...", settings.PROJECT_NAME)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS for frontend access (e.g. http://localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server exception processing %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )

# Health endpoint (available at /health)
app.include_router(health_router)

# Direct AI endpoint aliases (available at /ai/tailor-cv and /ai/interview-questions)
app.include_router(ai.router)

# Direct root-level endpoints for Google OAuth2 and integrations as requested
app.include_router(auth_google.router)
app.include_router(integrations_google.router)
from app.routers import job_openings
app.include_router(job_openings.router)
app.include_router(job_openings.openings_alias_router)
from app.routers import whatsapp as whatsapp_router_module
app.include_router(whatsapp_router_module.router)

# Temporary debug diagnostic router
app.include_router(debug.router)

# API v1 routes (available under /api/v1)
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/health",
    }
