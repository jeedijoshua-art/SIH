with open("src/background/background.ts", "r") as f:
    content = f.read()

# Fix the premature SUCCESS termination block
original_success_block = """        if (vlmRes.status === 'SUCCESS' || vlmRes.success === true && !vlmRes.action && vlmRes.status !== 'NEEDS_USER' && vlmRes.status !== 'ACTION') {"""

new_success_block = """        // Extract step from steps array if it exists
        if (vlmRes.steps && vlmRes.steps.length > 0) {
            vlmRes.action = vlmRes.steps[0].action;
        }

        if (vlmRes.status === 'SUCCESS' || (vlmRes.success === true && !vlmRes.action && vlmRes.status !== 'NEEDS_USER' && vlmRes.status !== 'PLAN' && vlmRes.status !== 'ACTION')) {"""

content = content.replace(original_success_block, new_success_block)

with open("src/background/background.ts", "w") as f:
    f.write(content)
