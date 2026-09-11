import pytest
import os
from unittest.mock import patch, MagicMock
from app.services.groq_service import GroqProvider
from app.models.domain import AnalyzeRequest, StructuredStep, HistoryItem
import json

@pytest.fixture
def groq_provider():
    # Force the API key for testing
    os.environ["GROQ_API_KEY"] = "fake_key"
    provider = GroqProvider()
    return provider

def test_success_completion(groq_provider):
    request = AnalyzeRequest(
        task="Search Google for artificial intelligence",
        original_task="Search Google for artificial intelligence",
        url="https://www.google.com/search?q=artificial+intelligence",
        safe_dom=[],
        history=[],
        conversation_history=[]
    )
    
    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(message=MagicMock(content=json.dumps({
            "type": "SUCCESS",
            "reply": "Searched for 'artificial intelligence' and opened the results.",
            "reasoning": "The URL shows the search query was submitted successfully."
        })))
    ]
    
    with patch.object(groq_provider.client.chat.completions, 'create', return_value=mock_response):
        response = groq_provider.analyze(request, "Search results page")
        assert response.status == "SUCCESS"
        assert response.reply == "Searched for 'artificial intelligence' and opened the results."

def test_failed_completion(groq_provider):
    request = AnalyzeRequest(
        task="Search Google for artificial intelligence",
        original_task="Search Google for artificial intelligence",
        url="https://www.google.com",
        safe_dom=[],
        history=[
            HistoryItem(
                step=1,
                action_taken="navigate",
                verification_result="Failed: Target not found."
            )
        ],
        conversation_history=[]
    )
    
    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(message=MagicMock(content=json.dumps({
            "type": "FAIL",
            "reply": "I couldn't find the search bar.",
            "reasoning": "Target not found."
        })))
    ]
    
    with patch.object(groq_provider.client.chat.completions, 'create', return_value=mock_response):
        response = groq_provider.analyze(request, "Google homepage")
        assert response.status == "FAIL"
        assert response.reply == "I couldn't find the search bar."
