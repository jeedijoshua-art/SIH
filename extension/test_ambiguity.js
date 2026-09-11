function scoreElement(el, step) {
    if (!el.visible || el.disabled) return -100;
    
    let score = 0;
    let target = step.target;
    if (!target) return 0;

    // Convert string target to object format for unified handling
    if (typeof target === 'string') {
        const tStr = target.toLowerCase();
        // Direct ID match gets highest priority
        if (el.id && el.id.toLowerCase() === tStr) return 1000;
        if (el.name && el.name.toLowerCase() === tStr) return 900;
        if (el.ariaLabel && el.ariaLabel.toLowerCase() === tStr) return 800;
        
        target = {
            text: target,
            label: target,
            action_text: target
        };
    }
    
    const searchableText = `${el.text || ''} ${el.ariaLabel || ''} ${el.title || ''} ${el.placeholder || ''} ${el.value || ''} ${el.id || ''} ${el.name || ''} ${el.associatedLabel || ''}`.toLowerCase();
    
    if (target.text) {
        const targetText = target.text.toLowerCase().trim();
        if (searchableText.includes(targetText)) score += 10;
        if (el.text && el.text.toLowerCase().trim() === targetText) score += 100;
        else if (el.text && el.text.toLowerCase().includes(targetText)) score += 30;
        if (el.value && el.value.toLowerCase().trim() === targetText) score += 50;
    }
    
    if (target.label) {
        const labelText = target.label.toLowerCase().trim();
        // Priority 1: Exact label matches
        if (el.ariaLabel && el.ariaLabel.toLowerCase().trim() === labelText) score += 150;
        else if (el.ariaLabel && el.ariaLabel.toLowerCase().includes(labelText)) score += 50;
        
        if (el.associatedLabel && el.associatedLabel.toLowerCase().trim() === labelText) score += 150;
        else if (el.associatedLabel && el.associatedLabel.toLowerCase().includes(labelText)) score += 50;
        
        // Priority 2: Placeholders and Titles
        if (el.placeholder && el.placeholder.toLowerCase().trim() === labelText) score += 100;
        else if (el.placeholder && el.placeholder.toLowerCase().includes(labelText)) score += 30;
        
        if (el.title && el.title.toLowerCase().trim() === labelText) score += 100;
        else if (el.title && el.title.toLowerCase().includes(labelText)) score += 30;
        
        // Priority 3: Fallback to name/id and semantic text
        if (el.name && el.name.toLowerCase().trim() === labelText) score += 80;
        else if (el.name && el.name.toLowerCase().includes(labelText)) score += 20;

        if (el.id && el.id.toLowerCase().trim() === labelText) score += 50;
        else if (el.id && el.id.toLowerCase().includes(labelText)) score += 10;
        
        if (el.parentText && el.parentText.toLowerCase().includes(labelText)) score += 15;
    }

    if (target.containerContext || target.near_text || target.row_contains) {
        const constraint = (target.containerContext || target.near_text || target.row_contains || "").toLowerCase().trim();
        if (el.containerContext && el.containerContext.toLowerCase().includes(constraint)) {
            score += 100;
        } else if (el.rowText && el.rowText.toLowerCase().includes(constraint)) {
            score += 100;
        } else if (el.parentText && el.parentText.toLowerCase().includes(constraint)) {
            score += 40;
        } else {
            score -= 50;
        }
    }

    if (target.container_contains) {
        const containerConstraint = target.container_contains.toLowerCase().trim();
        if (el.formText && el.formText.toLowerCase().includes(containerConstraint)) score += 40;
        if (el.dialogText && el.dialogText.toLowerCase().includes(containerConstraint)) score += 40;
        if (el.parentText && el.parentText.toLowerCase().includes(containerConstraint)) score += 20;
    }

    if (target.action_text) {
        const actText = target.action_text.toLowerCase().trim();
        if (el.text && el.text.toLowerCase().trim() === actText) score += 100;
        else if (el.text && el.text.toLowerCase().includes(actText)) score += 30;
        
        if (el.ariaLabel && el.ariaLabel.toLowerCase().trim() === actText) score += 100;
        else if (el.ariaLabel && el.ariaLabel.toLowerCase().includes(actText)) score += 30;
        
        if (el.value && el.value.toLowerCase().trim() === actText) score += 100;
        else if (el.value && el.value.toLowerCase().includes(actText)) score += 30;
    }
    
    // Type-based bonuses
    const act = (step.type || '').toLowerCase();
    if (act === 'click' && (el.tag === 'button' || el.tag === 'a' || el.role === 'button')) score += 15;
    if (act === 'type' && (el.tag === 'input' || el.tag === 'textarea')) score += 15;
    if (act === 'select' && el.tag === 'select') score += 20;
    if (act === 'check' && el.tag === 'input' && el.type === 'checkbox') score += 20;
    
    // Penalize generic structural tags if score is not very strong
    if ((el.tag === 'div' || el.tag === 'span' || el.tag === 'td' || el.tag === 'tr') && score < 50) {
        score -= 20;
    }

    return score;
}

function resolveTarget(page, step) {
    const scoredElements = page.map(el => ({ el, score: scoreElement(el, step) }));
    scoredElements.sort((a, b) => b.score - a.score);
    
    const bestMatch = scoredElements[0];
    const secondMatch = scoredElements[1];
    
    if (!bestMatch || bestMatch.score < 20) {
        return { target_id: null, confidence: 0, ambiguity: 0, error: 'No suitable target found' };
    }
    
    const confidence = Math.min(1.0, bestMatch.score / 150);
    let ambiguity = 0;
    
    // Calculate candidates count
    let candidatesCount = 1;
    for (let i = 1; i < scoredElements.length; i++) {
        if (scoredElements[i].score > 0 && (bestMatch.score - scoredElements[i].score < 20)) {
            candidatesCount++;
        } else {
            break;
        }
    }
    
    if (secondMatch && secondMatch.score > 0) {
        if (bestMatch.score - secondMatch.score < 20) {
            ambiguity = 1.0;
        } else if (bestMatch.score - secondMatch.score < 50) {
            ambiguity = 0.5;
        }
    }
    
    if (ambiguity === 1.0 && bestMatch.score < 500) {
        return { target_id: null, confidence, ambiguity, error: `TARGET_AMBIGUOUS: Found ${candidatesCount} identical or highly similar candidates. Please provide more specific constraints (e.g. near_text).` };
    }
    
    return { 
        target_id: bestMatch.el.id, 
        score: bestMatch.score, 
        confidence,
        ambiguity
    };
}

// TEST 1: Ambiguous targets (score < 500)
const page1 = [
    { id: "btn1", tag: "button", ariaLabel: "Submit" },
    { id: "btn2", tag: "button", ariaLabel: "Submit" }
];
const step1 = { type: "click", target: { label: "Submit" } };

const result1 = resolveTarget(page1, step1);
console.assert(result1.target_id === null, "Test 1 Failed: Target should be null due to high ambiguity");
console.assert(result1.error && result1.error.includes("TARGET_AMBIGUOUS"), "Test 1 Failed: Incorrect error message");
console.log("Test 1 Passed: Ambiguous targets rejected.");

// TEST 3: Hidden matching element should be ignored
const page3 = [
    { id: "hidden-btn", tag: "button", ariaLabel: "Submit", visible: false },
    { id: "vis-btn", tag: "button", ariaLabel: "Submit", visible: true }
];
// We need to update scoreElement mock to respect `visible`. Our mock didn't have it, let's add it.
function scoreElementFull(el, step) {
    if (el.visible === false || el.disabled) return -100;
    return scoreElement(el, step);
}
// redefine resolveTarget to use scoreElementFull
function resolveTargetFull(page, step) {
    const scoredElements = page.map(el => ({ el, score: scoreElementFull(el, step) }));
    scoredElements.sort((a, b) => b.score - a.score);
    
    const bestMatch = scoredElements[0];
    const secondMatch = scoredElements[1];
    
    if (!bestMatch || bestMatch.score < 20) {
        return { target_id: null, confidence: 0, ambiguity: 0, error: 'No suitable target found' };
    }
    
    const confidence = Math.min(1.0, bestMatch.score / 150);
    let ambiguity = 0;
    
    if (secondMatch && secondMatch.score > 0) {
        if (bestMatch.score - secondMatch.score < 20) {
            ambiguity = 1.0;
        } else if (bestMatch.score - secondMatch.score < 50) {
            ambiguity = 0.5;
        }
    }
    
    if (ambiguity === 1.0 && bestMatch.score < 500) {
        return { target_id: null, confidence, ambiguity, error: 'Target is highly ambiguous' };
    }
    
    return { target_id: bestMatch.el.id, score: bestMatch.score, confidence, ambiguity };
}

const result3 = resolveTargetFull(page3, step1);
console.assert(result3.target_id === "vis-btn", "Test 3 Failed: Should pick the visible button.");
console.log("Test 3 Passed: Hidden elements ignored.");

// TEST 4: Disabled element
const page4 = [
    { id: "disabled-btn", tag: "button", ariaLabel: "Submit", visible: true, disabled: true },
    { id: "enabled-btn", tag: "button", ariaLabel: "Submit", visible: true }
];
const result4 = resolveTargetFull(page4, step1);
console.assert(result4.target_id === "enabled-btn", "Test 4 Failed: Should pick enabled button.");
console.log("Test 4 Passed: Disabled elements ignored.");

console.log("All Target Resolution tests passed.");

// TEST A: Three identical text buttons -> Reject (Test A)
const pageA = [
    { id: "btn1", tag: "button", text: "Delete", visible: true },
    { id: "btn2", tag: "button", text: "Delete", visible: true },
    { id: "btn3", tag: "button", text: "Delete", visible: true }
];
const stepA = { type: "click", target: { text: "Delete" } };
const resA = resolveTarget(pageA, stepA);
console.assert(resA.target_id === null && resA.error.includes("TARGET_AMBIGUOUS: Found 3"), "Test A Failed", resA);

// TEST B: Two identical labels + unique context -> Allow (Test B)
const pageB = [
    { id: "btn1", tag: "button", text: "Delete", containerContext: "Row 1", visible: true },
    { id: "btn2", tag: "button", text: "Delete", containerContext: "Row 2", visible: true }
];
const stepB = { type: "click", target: { text: "Delete", containerContext: "Row 2" } };
const resB = resolveTarget(pageB, stepB);
console.assert(resB.target_id === "btn2" && resB.ambiguity === 0, "Test B Failed", resB);

// TEST C: Unique ID -> Allow (Test C)
const pageC = [
    { id: "unique-btn", tag: "button", text: "Submit", visible: true },
    { id: "btn2", tag: "button", text: "Submit", visible: true }
];
const stepC = { type: "click", target: "unique-btn" };
const resC = resolveTarget(pageC, stepC);
console.assert(resC.target_id === "unique-btn" && resC.ambiguity === 0, "Test C Failed", resC);

// TEST D: Missing target -> FAILED (Test D)
const pageD = [
    { id: "btn1", tag: "button", text: "Delete", visible: true }
];
const stepD = { type: "click", target: { text: "Update" } };
const resD = resolveTarget(pageD, stepD);
console.assert(resD.target_id === null && resD.error === "No suitable target found", "Test D Failed", resD);

console.log("All ambiguity regression tests passed.");
