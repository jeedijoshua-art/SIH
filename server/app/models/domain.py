from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class Viewport(BaseModel):
    width: int
    height: int

class PrivacyDetection(BaseModel):
    type: str
    bbox: List[float]
    confidence: float
    source: str

class DOMElement(BaseModel):
    id: str
    tag: Optional[str] = None
    role: Optional[str] = None
    text: Optional[str] = None
    ariaLabel: Optional[str] = None
    title: Optional[str] = None
    placeholder: Optional[str] = None
    value: Optional[str] = None
    href: Optional[str] = None
    type: Optional[str] = None
    name: Optional[str] = None
    disabled: Optional[bool] = None
    checked: Optional[bool] = None
    selected: Optional[bool] = None
    visible: Optional[bool] = None
    rect: Optional[List[float]] = None
    parentText: Optional[str] = None
    rowText: Optional[str] = None
    formText: Optional[str] = None
    dialogText: Optional[str] = None
    associatedLabel: Optional[str] = None
    containerContext: Optional[str] = None

class HistoryItem(BaseModel):
    step: int
    action_taken: str
    target_info: Optional[str] = None
    value: Optional[str] = None
    verification_result: str
    state_changed: bool = False
    state_fingerprint_before: Optional[str] = None
    state_fingerprint_after: Optional[str] = None

class Message(BaseModel):
    role: str
    content: Optional[str] = None
    traces: Optional[List[str]] = None

class AnalyzeRequest(BaseModel):
    task: str
    original_task: Optional[str] = None
    url: Optional[str] = None
    title: Optional[str] = None
    sanitized_image: Optional[str] = None  
    safe_dom: List[DOMElement] = []
    detections: List[PrivacyDetection] = []
    viewport: Optional[Viewport] = None
    history: List[HistoryItem] = []
    conversation_history: List[Message] = []

class IntentRequest(BaseModel):
    task: str
    conversation_history: List[Message] = []

class Target(BaseModel):
    text: Optional[str] = None
    label: Optional[str] = None
    near_text: Optional[str] = None
    action_text: Optional[str] = None
    row_contains: Optional[str] = None
    container_contains: Optional[str] = None

from typing import Literal

class StructuredStep(BaseModel):
    type: Literal["click", "type", "clear", "select", "check", "uncheck", "scroll", "hover", "focus", "submit", "wait", "navigate", "go_back", "go_forward", "press_key", "no_op", "open_tab", "close_tab", "switch_tab", "list_tabs", "get_active_tab", "reload", "read_page", "find_text", "search"] = Field(description="Action type")
    target: Optional[Union[str, Target]] = None
    value: Optional[str] = None

class PlannedStep(BaseModel):
    action: StructuredStep
    verify_type: Literal["URL_CHANGE", "VALUE_CHANGE", "DOM_CHANGE", "NONE"]

from typing import Union
StructuredStep.model_rebuild()

class AnalyzeResponse(BaseModel):
    success: bool
    status: str # ACTION, PLAN, CHAT, SUCCESS, FAIL, NEEDS_USER
    reply: Optional[str] = None
    reasoning: Optional[str] = None
    action: Optional[StructuredStep] = None
    steps: Optional[List[PlannedStep]] = None
    error: Optional[str] = None
    provider: Optional[Dict[str, str]] = None
