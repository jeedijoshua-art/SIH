import pytest
import base64
import os
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_payload_structure():
    with open("test_payload.py", "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    payload = {
        "task": "Download INV-2026-005",
        "url": "http://example.com/invoices",
        "title": "Invoices",
        "sanitized_image": f"data:image/jpeg;base64,{b64}",
        "viewport": {"width": 1024, "height": 768},
        "safe_dom": [
            {"id": "inv-list", "tagName": "div", "visible_text": "Invoices", "attributes": {}},
            {"id": "row-005", "tagName": "tr", "visible_text": "INV-2026-005 $500 Pending", "attributes": {}},
            {"id": "btn-005", "tagName": "button", "visible_text": "Download", "attributes": {}},
        ],
        "detections": [],
        "history": []
    }

    response = client.post('/api/analyze', json=payload)
    print(response.status_code)
    print(response.text)
    assert response.status_code == 200
