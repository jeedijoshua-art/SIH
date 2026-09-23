import os

for f in ["tests/test_groq_limits.py", "tests/test_llm_validation.py"]:
    with open(f, "r") as file:
        content = file.read()
    
    # We'll just replace response.status == "ACTION" with response.status == "PLAN"
    # Also for "assert res.status in ["ACTION", "FAIL"]"
    content = content.replace('== "ACTION"', '== "PLAN"')
    content = content.replace('["ACTION", "FAIL"]', '["PLAN", "FAIL"]')
    
    with open(f, "w") as file:
        file.write(content)
print("Tests fixed")
