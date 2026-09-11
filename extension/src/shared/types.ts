export interface DOMElement {
  id: string;
  tagName: string;
  bbox: [number, number, number, number];
  attributes: Record<string, string>;
  visible_text: string | null;
}

export interface PrivacyDetection {
  type: string;
  bbox: [number, number, number, number];
  confidence: number;
  source: string;
}

export interface Action {
  type: string;
  target_id?: string;
  coordinates?: [number, number];
  value?: string;
}

export interface TargetConstraint {
    type?: string;
    text?: string;
    label?: string;
    row_contains?: string;
    container_contains?: string;
    containerContext?: string;
    action_text?: string;
    near_text?: string;
}

export interface StructuredStep {
    type: string;
    target?: TargetConstraint | string;
    value?: string;
    verify_type?: string; 
    verify_target?: TargetConstraint;
}

export interface StructuredTask {
    goal: string;
    entities: Record<string, string>;
    steps: StructuredStep[];
}

export interface VerificationStatus {
    passed: boolean;
    reason: string;
}

export interface ExecutionResult {
    success: boolean;
    action: string;
    target_id?: string;
    elementFound: boolean;
    elementVisible: boolean;
    elementEnabled: boolean;
    executed: boolean;
    verification: VerificationStatus;
    state_changed: boolean;
    before_url: string;
    after_url: string;
    state_fingerprint_before?: string;
    state_fingerprint_after?: string;
    actual_value?: string;
}
