const fs = require('fs');
const contentSrc = fs.readFileSync('src/content/content.ts', 'utf8');

// We'll extract the scoreElement function
const scoreRegex = /function scoreElement\(el.*?\{([\s\S]*?)\n\}\n/m;
const match = contentSrc.match(scoreRegex);

if (match) {
    console.log("Successfully extracted scoreElement");
} else {
    console.error("Failed to extract scoreElement");
}
