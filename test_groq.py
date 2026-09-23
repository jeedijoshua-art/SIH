import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'server'))
from app.services.groq_service import GroqProvider

provider = GroqProvider()
intent = provider.classify_intent("Open Google in a new tab", [])
print(f"Intent classified successfully: {intent}")
