import pytest
import json
from unittest.mock import patch, MagicMock
from app.models.domain import AnalyzeRequest, AnalyzeResponse, StructuredStep
from app.services.groq_service import GroqProvider
from app.services.agent_service import FusionProvider

def test_groq_generation_config_max_tokens():
    # A. Groq generation configuration never requests >900 output tokens.
    provider = GroqProvider()
    
    with patch.object(provider.client.chat.completions, 'create') as mock_create:
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = '{"type": "CHAT", "reply": "Test"}'
        mock_create.return_value = mock_response
        
        request = AnalyzeRequest(task="Test")
        provider.analyze(request, "Visual Context")
        
        mock_create.assert_called_once()
        kwargs = mock_create.call_args.kwargs
        assert 'max_tokens' in kwargs
        assert kwargs['max_tokens'] <= 900
        assert kwargs['max_tokens'] == 500
        assert 'response_format' in kwargs
        assert kwargs['response_format'] == {'type': 'json_object'}
        
        # Test reasoning config
        if 'qwen' in provider.model_name.lower():
            assert 'extra_body' in kwargs
            assert kwargs['extra_body']['reasoning_effort'] == 'none'
            assert kwargs['extra_body']['reasoning_format'] == 'hidden'

def test_json_parsing_with_think_block():
    provider = GroqProvider()
    with patch.object(provider.client.chat.completions, 'create') as mock_create:
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        json_content = json.dumps({"type": "ACTION", "action": {"type": "click", "target": {"text": "Submit"}}})
        mock_response.choices[0].message.content = f"<think>\nReasoning here\n</think>\n{json_content}"
        mock_create.return_value = mock_response
        
        request = AnalyzeRequest(task="Test")
        response = provider.analyze(request, "Visual Context")
        assert response.success is True
        assert response.status == "PLAN"
        assert response.steps[0].action.type == "click"

def test_json_parsing_pure_json():
    provider = GroqProvider()
    with patch.object(provider.client.chat.completions, 'create') as mock_create:
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        json_content = json.dumps({"type": "ACTION", "action": {"type": "click", "target": {"text": "Submit"}}})
        mock_response.choices[0].message.content = json_content
        mock_create.return_value = mock_response
        
        request = AnalyzeRequest(task="Test")
        response = provider.analyze(request, "Visual Context")
        assert response.success is True
        assert response.status == "PLAN"
        assert response.steps[0].action.type == "click"


def test_valid_structured_action_parses():
    # B. A valid structured action still parses correctly, even if wrapped in markdown block.
    provider = GroqProvider()
    
    with patch.object(provider.client.chat.completions, 'create') as mock_create:
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        json_content = json.dumps({
            "type": "ACTION",
            "reply": "Clicking button",
            "reasoning": "Reasoning here",
            "action": {
                "type": "click",
                "target": {"text": "Submit"}
            },
            "verify_type": "DOM_CHANGE"
        })
        mock_response.choices[0].message.content = f"```json\n{json_content}\n```"
        mock_create.return_value = mock_response
        
        request = AnalyzeRequest(task="Test")
        response = provider.analyze(request, "Visual Context")
        
        assert response.success is True
        assert response.status == "PLAN"
        assert response.steps[0].action.type == "click"
        assert response.steps[0].action.target.text == "Submit"

def test_malformed_response_controlled_failure():
    # C. A malformed/truncated response produces controlled failure.
    provider = GroqProvider()
    
    with patch.object(provider.client.chat.completions, 'create') as mock_create:
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        # Malformed JSON
        mock_response.choices[0].message.content = '{"type": "ACTION", "action": {"type": "click", ' 
        mock_create.return_value = mock_response
        
        request = AnalyzeRequest(task="Test")
        response = provider.analyze(request, "Visual Context")
        
        assert response.success is False
        assert response.status == "FAIL"
        assert "invalid JSON" in str(response.error).lower() or "json" in str(response.error).lower()

def test_gemini_fallback_on_429():
    # D. Gemini 401/429 still falls back to DOM perception.
    provider = FusionProvider()
    
    with patch.object(provider.gemini, 'perceive', return_value="Gemini perception failed: 429 Resource Exhausted"):
        with patch.object(provider.groq, 'analyze') as mock_analyze:
            request = AnalyzeRequest(task="Test task", sanitized_image="base64")
            provider.analyze(request)
            
            # Verify Groq was still called with the fallback context
            mock_analyze.assert_called_once()
            args, _ = mock_analyze.call_args
            visual_context = args[1]
            assert "Visual perception is currently unavailable" in visual_context

def test_groq_429_controlled_failure():
    # E. Groq 429 is converted into a controlled agent failure rather than an uncaught exception.
    provider = GroqProvider()
    
    with patch.object(provider.client.chat.completions, 'create', side_effect=Exception("Error code: 429 - Request too large for model")):
        request = AnalyzeRequest(task="Test")
        response = provider.analyze(request, "Visual Context")
        
        assert response.success is False
        assert response.status == "FAIL"
        assert "429" in response.error
