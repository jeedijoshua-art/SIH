from app.models.domain import AnalyzeRequest, AnalyzeResponse
from app.services.gemini_service import GeminiProvider
from app.services.groq_service import GroqProvider

class FusionProvider:
    def __init__(self):
        self.gemini = GeminiProvider()
        self.groq = GroqProvider()
        
    def analyze(self, request: AnalyzeRequest) -> AnalyzeResponse:
        print("[AGENT] analyze request received")
        
        # Fast intent classification
        intent = self.groq.classify_intent(request.task, request.conversation_history)
        print(f"[AGENT] Intent classification: {intent}")
        
        if intent == "CHAT":
            visual_context = "No visual context. This is a conversational message."
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
