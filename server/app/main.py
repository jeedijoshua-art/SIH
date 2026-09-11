import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import analyze

app = FastAPI(title="LocalSight Server API")

# Setup CORS to allow extension to communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For demo, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.models.domain import AnalyzeResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    print(f"[AGENT] 422 Validation Error: {exc.errors()}")
    return JSONResponse(
        status_code=200,
        content=AnalyzeResponse(
            success=False,
            status="FAIL",
            reply="I encountered a data validation error.",
            reasoning="The extension payload schema did not match the expected API contract.",
            error=str(exc.errors()),
            provider={"vision": "gemini", "reasoning": "groq"}
        ).model_dump()
    )

app.include_router(analyze.router, prefix="/api")

@app.get("/")
def read_root():
    return {"status": "ok", "app": "LocalSight Server"}

@app.get("/api/health")
async def health_check():
    import os
    from app.services.gemini_service import GeminiProvider
    from app.services.groq_service import GroqProvider

    gemini_key = os.getenv("GEMINI_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")

    gemini_status = "OFFLINE"
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    gemini_reason = None
    if gemini_key:
        try:
            gp = GeminiProvider()
            b64_img = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
            res = gp.perceive(b64_img, "test")
            if res and not res.startswith("Gemini perception failed"):
                gemini_status = "ONLINE"
            else:
                gemini_status = "DEGRADED"
                gemini_reason = res
        except Exception as e:
            gemini_status = "DEGRADED"
            gemini_reason = str(e)

    groq_status = "OFFLINE"
    groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    if groq_key:
        try:
            gq = GroqProvider()
            from app.models.domain import AnalyzeRequest
            req = AnalyzeRequest(
                task="test", url="http://test", title="test",
                sanitized_image="", safe_dom=[], detections=[], viewport={"width":100,"height":100}
            )
            res = gq.analyze(req, "test context")
            if res.status in ["ACTION", "CHAT", "SUCCESS", "FAIL", "NEEDS_USER"]:
                groq_status = "ONLINE"
            else:
                groq_status = "DEGRADED"
        except Exception:
            groq_status = "DEGRADED"
            
    return {
        "status": "ONLINE",
        "gemini": {
            "status": gemini_status,
            "model": gemini_model if gemini_key else None,
            "reason": gemini_reason
        },
        "groq": {
            "status": groq_status,
            "model": groq_model if groq_key else None
        }
    }
