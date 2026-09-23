filepath = "/Users/jeedijoshua/.gemini/antigravity-ide/brain/5a7ff459-7d57-4bba-9d04-ba8b36f7abab/task.md"
with open(filepath, "r") as f:
    content = f.read()

content = content.replace("[ ]", "[x]").replace("[/]", "[x]")

with open(filepath, "w") as f:
    f.write(content)
