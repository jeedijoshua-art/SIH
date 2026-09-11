import pytest
from app.models.domain import AnalyzeRequest, HistoryItem
from app.services.groq_service import GroqProvider

class MockGroqClient:
    class chat:
        class completions:
            @staticmethod
            def create(*args, **kwargs):
                class Message:
                    content = '{"type": "SUCCESS", "reply": "Done"}'
                class Choice:
                    message = Message()
                class Response:
                    choices = [Choice()]
                return Response()

class MockGroqClientInvalidAction:
    class chat:
        class completions:
            @staticmethod
            def create(*args, **kwargs):
                class Message:
                    content = '{"type": "ACTION", "action": {"type": "double_click"}}'
                class Choice:
                    message = Message()
                class Response:
                    choices = [Choice()]
                return Response()

def test_llm_validation_prevents_unverified_success():
    provider = GroqProvider()
    provider.client = MockGroqClient()
    
    # Simulate a history where the last action failed verification
    request = AnalyzeRequest(
        task="Test task",
        history=[
            HistoryItem(
                step=1,
                action_taken="click",
                verification_result="Failed: Element not found",
                state_changed=False
            )
        ]
    )
    
    response = provider.analyze(request, "visual context")
    
    # The GroqProvider should intercept the SUCCESS and raise an Exception, 
    # resulting in a FAIL status.
    assert response.success is False
    assert response.status == "FAIL"
    assert "claim" in response.error.lower() or "claim" in response.reasoning.lower() or "llm claimed success" in response.error.lower()


def test_llm_validation_rejects_invalid_actions():
    provider = GroqProvider()
    provider.client = MockGroqClientInvalidAction()
    
    request = AnalyzeRequest(task="Test task")
    response = provider.analyze(request, "visual context")
    
    # Pydantic should reject 'double_click' because it's not in the Literal definition
    assert response.success is False
    assert response.status == "FAIL"
    assert "Invalid action format" in response.error

def create_mock_client(json_content):
    class CustomMockClient:
        class chat:
            class completions:
                @staticmethod
                def create(*args, **kwargs):
                    class Message:
                        content = json_content
                    class Choice:
                        message = Message()
                    class Response:
                        choices = [Choice()]
                    return Response()
    return CustomMockClient()

def test_llm_validation_malformed_responses():
    provider = GroqProvider()
    request = AnalyzeRequest(task="Test")

    # 1. Invalid JSON
    provider.client = create_mock_client('{"type": "ACTION", "action": {')
    res = provider.analyze(request, "")
    assert res.status == "FAIL"
    assert "invalid JSON" in res.error

    # 2. Empty response
    provider.client = create_mock_client('')
    res = provider.analyze(request, "")
    assert res.status == "FAIL"
    
    # 3. Missing action but status ACTION (Pydantic allows it if Optional, wait, if action is missing but status is ACTION, the background script checks it)
    # Actually background.ts checks `if (!step)` and fails. Let's make sure it handles it safely.
    provider.client = create_mock_client('{"type": "ACTION"}')
    res = provider.analyze(request, "")
    assert res.status == "ACTION"
    assert res.action is None
    
    # 4. Invalid target schema
    provider.client = create_mock_client('{"type": "ACTION", "action": {"type": "click", "target": {"foo": "bar"}}}')
    res = provider.analyze(request, "")
    # Pydantic will allow extra fields if Config allows, but we just want to ensure it doesn't crash the server.
    assert res.status in ["ACTION", "FAIL"]
