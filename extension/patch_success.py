with open("src/background/background.ts", "r") as f:
    content = f.read()

original = """        // Extract step from steps array if it exists
        if (vlmRes.steps && vlmRes.steps.length > 0) {
            vlmRes.action = vlmRes.steps[0].action;
        }

        if (vlmRes.status === 'SUCCESS' || (vlmRes.success === true && !vlmRes.action && vlmRes.status !== 'NEEDS_USER' && vlmRes.status !== 'PLAN' && vlmRes.status !== 'ACTION')) {"""

new = """        // Extract step from steps array if it exists
        if (vlmRes.steps && vlmRes.steps.length > 0) {
            vlmRes.action = vlmRes.steps[0].action;
        }
        
        // Prevent LLM hallucinating SUCCESS when it actually provided an action to execute
        if (vlmRes.status === 'SUCCESS' && vlmRes.action) {
            console.log(`[LocalSight] LLM hallucinated SUCCESS but provided an action. Forcing status to PLAN.`);
            vlmRes.status = 'PLAN';
        }

        if (vlmRes.status === 'SUCCESS' || (vlmRes.success === true && !vlmRes.action && vlmRes.status !== 'NEEDS_USER' && vlmRes.status !== 'PLAN' && vlmRes.status !== 'ACTION')) {"""

content = content.replace(original, new)

with open("src/background/background.ts", "w") as f:
    f.write(content)
