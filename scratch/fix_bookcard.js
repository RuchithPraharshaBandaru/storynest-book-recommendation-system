const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../client/src/components/BookCard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace ✨
content = content.replace(
  '✨ Analyzing your reading history…',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Analyzing your reading history…'
);
content = content.replace(
  'Analyzing your reading history…',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Analyzing your reading history…'
);

// Replace ✕
content = content.replace(
  '✕',
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
);

// Fix modal background
content = content.replace(/rgba\(0, 0, 0, 0\.8\)/g, 'rgba(44, 30, 22, 0.8)');

fs.writeFileSync(filePath, content, 'utf8');
console.log('BookCard fixed!');
