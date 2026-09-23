import os

for f in ["tests/test_groq_limits.py", "tests/test_llm_validation.py"]:
    with open(f, "r") as file:
        content = file.read()
    
    # Replace response.action.type with response.steps[0].action.type
    content = content.replace("response.action.type", "response.steps[0].action.type")
    
    # test 3. Missing action but status ACTION (now PLAN)
    # The response will have status ACTION (or PLAN if converted), and steps = None.
    # We should update test_llm_validation.py specific check
    content = content.replace('res.status == "PLAN"\n    assert res.action is None', 'res.status == "ACTION"\n    assert res.steps is None')
    
    with open(f, "w") as file:
        file.write(content)
print("Tests fixed")
