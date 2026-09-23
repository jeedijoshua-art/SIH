with open("tests/test_groq_limits.py", "r") as file:
    content = file.read()

content = content.replace('assert response.action.target.text == "Submit"', 'assert response.steps[0].action.target.text == "Submit"')

with open("tests/test_groq_limits.py", "w") as file:
    file.write(content)
