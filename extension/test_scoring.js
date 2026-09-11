const target = { label: "Search" };
const el = {
    tag: "textarea",
    ariaLabel: "Search",
    type: "search"
};

let score = 0;
const searchableText = `${el.text || ''} ${el.ariaLabel || ''} ${el.title || ''} ${el.placeholder || ''} ${el.value || ''} ${el.id || ''} ${el.name || ''} ${el.associatedLabel || ''}`.toLowerCase();

if (target.label) {
    const labelText = target.label.toLowerCase().trim();
    if (el.ariaLabel && el.ariaLabel.toLowerCase().trim() === labelText) score += 150;
    else if (el.ariaLabel && el.ariaLabel.toLowerCase().includes(labelText)) score += 50;
}

const act = 'type';
if (act === 'type' && (el.tag === 'input' || el.tag === 'textarea')) score += 15;

console.log("Score for aria-label='Search' with target.label='Search':", score);

const target2 = { label: "Full Name" };
const el2 = {
    tag: "input",
    associatedLabel: "Full Name"
};

let score2 = 0;
if (target2.label) {
    const labelText = target2.label.toLowerCase().trim();
    if (el2.associatedLabel && el2.associatedLabel.toLowerCase().trim() === labelText) score2 += 150;
}
if (act === 'type' && (el2.tag === 'input' || el2.tag === 'textarea')) score2 += 15;
console.log("Score for associatedLabel='Full Name' with target.label='Full Name':", score2);
