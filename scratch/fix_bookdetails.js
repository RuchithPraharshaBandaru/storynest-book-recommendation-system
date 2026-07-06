const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../client/src/components/BookDetails.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace 📚
content = content.replace(
  '<div className="animate-float" style={{ fontSize: "3rem" }}>📚</div>',
  '<div className="animate-float" style={{ color: "var(--accent-primary)" }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg></div>'
);

// Replace ←
content = content.replace(
  '← Back to Dashboard',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }}><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg> Back to Dashboard'
);

// Replace ⭐
content = content.replace(
  '<span style={{ fontSize: "1.4rem" }}>⭐</span>',
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="var(--warning)" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginLeft: 4, verticalAlign: "middle" }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
);

// Fix colors
content = content.replace(/rgba\(255,255,255,0\.03\)/g, 'rgba(0,0,0,0.03)');
content = content.replace(/rgba\(255, 255, 255, 0\.05\)/g, 'rgba(0,0,0,0.05)');

fs.writeFileSync(filePath, content, 'utf8');
console.log('BookDetails fixed!');
