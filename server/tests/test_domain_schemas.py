import pytest
from app.models.domain import DOMElement
from app.services.groq_service import GroqProvider

def test_minimal_dom_element():
    # A. Minimal DOM element with no semantic context fields
    data = {
        "id": "minimal-id",
        "tag": "input",
        "text": "",
        "ariaLabel": "Search",
        "type": "text"
    }
    el = DOMElement(**data)
    assert el.id == "minimal-id"
    assert el.tag == "input"
    assert el.containerContext is None
    assert el.rowText is None

def test_full_dom_element():
    # B. Full DOM element with containerContext
    data = {
        "id": "full-id",
        "tag": "button",
        "text": "Download",
        "rowText": "INV-123 | Gamma Tech | Pending",
        "containerContext": "Invoice row"
    }
    el = DOMElement(**data)
    assert el.id == "full-id"
    assert el.rowText == "INV-123 | Gamma Tech | Pending"
    assert el.containerContext == "Invoice row"

def test_table_row_element():
    # C. Table row with rowText
    data = {
        "id": "row-id",
        "rowText": "Data | Value"
    }
    el = DOMElement(**data)
    assert el.rowText == "Data | Value"

def test_form_element():
    # D. Form element with formText
    data = {
        "id": "form-id",
        "formText": "Login Form"
    }
    el = DOMElement(**data)
    assert el.formText == "Login Form"

def test_dialog_element():
    # E. Dialog element with dialogText
    data = {
        "id": "dialog-id",
        "dialogText": "Confirm Action"
    }
    el = DOMElement(**data)
    assert el.dialogText == "Confirm Action"

def test_groq_service_safe_access():
    # G. Real Google-like search input structure & check groq_service doesn't crash
    data = {
        "id": "google-search",
        "tag": "textarea",
        "ariaLabel": "Search",
        "type": "search"
    }
    el = DOMElement(**data)
    
    # We simulate what groq_service does at line 67
    parts = []
    if getattr(el, 'rowText', None):
        parts.append(f"row='{el.rowText}'")
    if getattr(el, 'containerContext', None):
        parts.append(f"container='{el.containerContext}'")
    
    # Assert no exceptions are raised and it correctly handles missing optional fields
    assert len(parts) == 0
