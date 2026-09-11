import os
import base64
import time

class GeminiProvider:
    def __init__(self):
        from dotenv import load_dotenv
        import os
        load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
        
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.cooldown_until = 0
        self.last_cache_key = None
        self.last_cache_result = None

        if self.api_key:
            from google import genai
            self.client = genai.Client(api_key=self.api_key)
            self.model_name = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
            print(f"[GEMINI] model={self.model_name}")
            print("[GEMINI] vision=enabled")
        else:
            self.client = None
            print("WARNING: GEMINI_API_KEY not set. Visual perception will be skipped.")

    def perceive(self, b64_image: str, task: str) -> str:
        if not self.client or not b64_image:
            return "No visual perception available (Gemini unavailable or image missing)."
            
        current_time = time.time()
        if current_time < self.cooldown_until:
            return "Visual perception is currently unavailable due to rate limits. Rely purely on DOM elements."
            
        # simple cache to avoid repeated calls for identical frames
        import hashlib
        cache_key = hashlib.md5((task + b64_image[:100]).encode()).hexdigest()
        if self.last_cache_key == cache_key:
            return self.last_cache_result
        
        try:
            if ',' in b64_image:
                b64_image = b64_image.split(',')[1]
            image_data = base64.b64decode(b64_image)
            
            prompt = f"The user task is '{task}'. Describe the high-level semantic layout of this page focusing on how to achieve the task. Mention any visible tables, rows, buttons, modals, or forms. Be concise."
            
            from PIL import Image
            import io
            
            image = Image.open(io.BytesIO(image_data))
            
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[image, prompt]
            )
            
            self.last_cache_key = cache_key
            self.last_cache_result = response.text
            return response.text
        except Exception as e:
            error_str = str(e).lower()
            if "429" in error_str or "quota" in error_str or "resource_exhausted" in error_str:
                print(f"[Gemini Error]: 429 RESOURCE_EXHAUSTED. Entering cooldown.")
                self.cooldown_until = time.time() + 60 # 60 second cooldown
            else:
                print(f"[Gemini Error]: {e}")
            return f"Gemini perception failed: {e}"
