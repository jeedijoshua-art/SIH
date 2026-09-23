from app.models.domain import AnalyzeRequest, AnalyzeResponse
from app.services.gemini_service import GeminiProvider
from app.services.groq_service import GroqProvider

class FusionProvider:
    def __init__(self):
        self.gemini = GeminiProvider()
        self.groq = GroqProvider()
        
    def analyze_intent(self, request: 'IntentRequest') -> AnalyzeResponse:
        print("[AGENT] intent request received")
        intent = self.groq.classify_intent(request.task, request.conversation_history)
        print(f"[AGENT] Intent classification: {intent}")
        
        if intent in ["OPEN_TAB", "CLOSE_TAB", "SWITCH_TAB", "NAVIGATE", "RELOAD", "GO_BACK", "GO_FORWARD", "LIST_TABS", "READ_PAGE", "SCROLL", "SEARCH"]:
            print(f"[AGENT] Bypassing VLM for deterministic intent: {intent}")
            from app.models.domain import PlannedStep, StructuredStep
            
            action_type = intent.lower()
            verify_type = "NONE"
            if intent in ["OPEN_TAB", "NAVIGATE", "SEARCH", "GO_BACK", "GO_FORWARD", "RELOAD", "SWITCH_TAB"]:
                verify_type = "URL_CHANGE"
            
            return AnalyzeResponse(
                success=True,
                status="PLAN",
                reply=f"Executing {intent.lower().replace('_', ' ')}...",
                reasoning=f"Fast-path execution for {intent}",
                steps=[PlannedStep(
                    action=StructuredStep(
                        type=action_type,
                        value=request.task
                    ),
                    verify_type=verify_type
                )],
                provider={"vision": "none", "reasoning": "fast-router"}
            )
            
        return AnalyzeResponse(
            success=True,
            status="OBSERVE",
            reply="Observation required.",
            reasoning="Intent requires visual perception or DOM analysis.",
            provider={"vision": "none", "reasoning": "fast-router"}
        )

    def analyze(self, request: AnalyzeRequest) -> AnalyzeResponse:
        print("[AGENT] analyze request received")
        
        # We can still do a basic check for CHAT intent just in case
        intent = self.groq.classify_intent(request.task, request.conversation_history)
        
        if intent == "CHAT":
            visual_context = "No visual context. This is a conversational message."
        else:
            # DOM-First Perception Strategy
            if request.safe_dom and len(request.safe_dom) > 0:
                print("[AGENT] DOM information available, skipping Gemini vision to save latency.")
                visual_context = "Visual context omitted to save latency. Rely on the provided DOM elements. If you absolutely cannot find the target in the DOM and require visual perception, reply with FAIL or NEEDS_USER."
            else:
                print("[AGENT] observation started")
                visual_context = self.gemini.perceive(request.sanitized_image, request.task)
                if "Gemini perception failed" in visual_context or "No visual perception available" in visual_context:
                    print(f"[GEMINI] unavailable - {visual_context}")
                    print("[AGENT] falling back to DOM perception")
                    visual_context = "Visual perception is currently unavailable due to an error or rate limit. Rely purely on the DOM elements and semantic structure provided to complete the task."
                else:
                    print("[GEMINI] perception completed")
            
        print("[GROQ] reasoning started")
        return self.groq.analyze(request, visual_context)

def get_vlm_provider():
    return FusionProvider()
