import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_analyze_pipeline():
    payload = {
        "task": "Find the latest invoice and download it.",
        "url": "http://example.com",
        "title": "Example",
        "sanitized_image": "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        "viewport": {"width": 1024, "height": 768},
        "safe_dom": [
            {"id": "btn-1", "tagName": "BUTTON", "bbox": [10, 10, 100, 30], "visible_text": "Download Invoice 42", "attributes": {}}
        ],
        "detections": [
            {"type": "invoice_icon", "confidence": 0.9, "bbox": [12, 12, 10, 10], "source": "webgpu"}
        ],
        "history": []
    }

    response = client.post('/api/analyze', json=payload)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    assert response.status_code == 200
    
    data = response.json()
    assert "status" in data
    assert data["status"] in ["ACTION", "CHAT", "SUCCESS", "FAIL", "NEEDS_USER"]
