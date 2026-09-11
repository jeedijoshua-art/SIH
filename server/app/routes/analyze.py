from fastapi import APIRouter, HTTPException, Depends
from app.models.domain import AnalyzeRequest, AnalyzeResponse
from app.services.agent_service import get_vlm_provider, FusionProvider

router = APIRouter()

@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_screen(request: AnalyzeRequest, provider: FusionProvider = Depends(get_vlm_provider)):
    print("[AGENT] analyze request received")
    if not request.sanitized_image and request.task:
        pass # allow text-only chat requests (which might not have an image)
        
    try:
        response = provider.analyze(request)
        return response
    except HTTPException as e:
        import traceback
        print(f"[AGENT] HTTP Exception: {e.detail}")
        traceback.print_exc()
        raise e
    except Exception as e:
        import traceback
        print("[AGENT] analyze FAILED")
        print(f"[AGENT] Exception: {str(e)}")
        print(f"[AGENT] traceback:")
        traceback.print_exc()
        
        # Don't blindly raise 502/503, instead return a clean JSON FAIL response
        return AnalyzeResponse(
            success=False,
            status="FAIL",
            reply="I encountered an internal error and couldn't process your request.",
            reasoning=f"Backend Error: {str(e)}",
            error=str(e),
            provider={"vision": "gemini", "reasoning": "groq"}
        )
