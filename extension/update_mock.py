import re

with open('src/content/content.ts', 'r') as f:
    content = f.read()

# Extract scoreElement from content.ts
score_element_match = re.search(r'function scoreElement\(el.*?return score;\n}', content, re.DOTALL)
score_element = score_element_match.group(0)

# Remove type annotations (TypeScript to JavaScript)
score_element = score_element.replace(': any', '').replace(': StructuredStep', '').replace(': number', '')

with open('test_ambiguity.js', 'r') as f:
    test_content = f.read()

# Replace old scoreElement in test_ambiguity.js
new_test_content = re.sub(r'function scoreElement\(el, step\) \{.*?return score;\n\}', score_element, test_content, flags=re.DOTALL)

with open('test_ambiguity.js', 'w') as f:
    f.write(new_test_content)
