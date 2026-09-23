with open("src/index.css", "r") as f:
    content = f.read()

content = content.replace('@import "tailwindcss";', '@import "tailwindcss";\n\n@custom-variant dark (&:is(.dark *));')

with open("src/index.css", "w") as f:
    f.write(content)
