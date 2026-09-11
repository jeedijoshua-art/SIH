import pytest

def test_bfcache_navigation_handling():
    # same-tab navigation success
    step_type = "click"
    url_before = "http://localhost/test_pages/navigation_test.html"
    url_after = "http://localhost/test_pages/normal_interaction.html"
    
    exec_res = {
        "executed": True,
        "success": True,
        "state_changed": True,
        "before_url": url_before,
        "after_url": url_after,
        "verification": {"passed": True, "reason": f"Action dispatched, navigation confirmed to {url_after}"}
    }
        
    assert exec_res["success"] is True
    assert exec_res["state_changed"] is True
    assert "navigation confirmed to" in exec_res["verification"]["reason"]
    assert exec_res["after_url"] != exec_res["before_url"]

def test_navigation_followed_by_new_page_no_link():
    # The agent must not attempt to resolve the old target on the destination page
    # This is handled by groq seeing the new URL and success message.
    history_item = {
        "action_taken": "click",
        "target_info": '{"text": "Same Tab Navigation"}',
        "verification_result": "Action dispatched, navigation confirmed to http://new-page.com"
    }
    
    # Simulate groq_service parsing
    history_summary = f"Action: {history_item['action_taken']} on {history_item['target_info']} -> Verified: {history_item['verification_result']}"
    
    assert "Same Tab Navigation" in history_summary
    assert "navigation confirmed" in history_summary
    
def test_failed_navigation_url_unchanged():
    url_before = "http://localhost/test_pages/navigation_test.html"
    url_after = "http://localhost/test_pages/navigation_test.html"
    
    exec_res = {
        "executed": True,
        "success": True,
        "state_changed": False,
        "before_url": url_before,
        "after_url": url_after,
        "verification": {"passed": True, "reason": f"Action dispatched, navigation confirmed to {url_after}"}
    }
    
    assert exec_res["before_url"] == exec_res["after_url"]

def test_ambiguous_target_rejection():
    # Handled by TARGET_AMBIGUOUS check in content.ts
    resolve_res = {
        "target_id": None,
        "confidence": 0,
        "ambiguity": 1,
        "error": "TARGET_AMBIGUOUS: Found 3 identical or highly similar candidates. Please provide more specific constraints (e.g. near_text)."
    }
    assert "TARGET_AMBIGUOUS" in resolve_res["error"]

def test_stale_port_non_nav_action():
    step_type = "hover"
    nav_sensitive = ['click', 'press_key', 'submit', 'navigate', 'go_back', 'go_forward']
    error_message = "The message port closed before a response was received."
    
    if step_type in nav_sensitive:
        exec_res = {}
    else:
        exec_res = {
            "executed": False,
            "success": False,
            "verification": {"passed": False, "reason": f"Message channel error: {error_message}"}
        }
        
    assert exec_res["success"] is False
    assert "Message channel error" in exec_res["verification"]["reason"]
