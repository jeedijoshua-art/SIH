import pytest
from app.models.domain import AnalyzeRequest
from app.services.agent_service import FusionProvider
from unittest.mock import patch

def test_fusion_provider_gemini_fallback():
    provider = FusionProvider()
    
    # Mock Gemini to return failure
    with patch.object(provider.gemini, 'perceive', return_value="Gemini perception failed: 429"):
        with patch.object(provider.groq, 'analyze') as mock_analyze:
            request = AnalyzeRequest(task="Test task", sanitized_image="base64")
            provider.analyze(request)
            
            # Verify Groq was still called with the fallback context
            mock_analyze.assert_called_once()
            args, _ = mock_analyze.call_args
            visual_context = args[1]
            assert "Visual perception is currently unavailable" in visual_context

def test_fusion_provider_groq_exception():
    provider = FusionProvider()
    
    with patch.object(provider.gemini, 'perceive', return_value="Visual context"):
        with patch.object(provider.groq, 'analyze', side_effect=Exception("Groq API Timeout")):
            request = AnalyzeRequest(task="Test task", sanitized_image="base64")
            with pytest.raises(Exception) as excinfo:
                provider.analyze(request)
            assert "Groq API Timeout" in str(excinfo.value)
