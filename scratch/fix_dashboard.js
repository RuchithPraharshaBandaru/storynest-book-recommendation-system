const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../client/src/components/Dashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace ✓ Liked with SVG
content = content.replace(
  '✓ Liked',
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 4, verticalAlign: "text-bottom" }}><polyline points="20 6 9 17 4 12"></polyline></svg>Liked'
);

// Replace navbar ❤️
content = content.replace(
  '>\n            ❤️\n          </button>',
  '>\n            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>\n          </button>'
);

// Replace ❤️ Your Liked Books
content = content.replace(
  '❤️ Your Liked Books',
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="var(--accent-primary)" stroke="none" style={{ display: "inline-block", marginRight: 12, verticalAlign: "middle" }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg> Your Liked Books'
);

// Replace error ⚠️
content = content.replace(
  '<span>⚠️</span>',
  '<span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></span>'
);

// Replace empty state 📚
content = content.replace(
  '<div style={{ fontSize: "3rem", marginBottom: 16 }}>📚</div>',
  '<div style={{ color: "var(--accent-primary)", display: "flex", justifyContent: "center", marginBottom: 16 }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg></div>'
);

content = content.replace(
  '<div className="animate-float" style={{ fontSize: "3rem", marginBottom: 16 }}>\n                  📚\n                </div>',
  '<div className="animate-float" style={{ color: "var(--accent-primary)", display: "flex", justifyContent: "center", marginBottom: 16 }}>\n                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>\n                </div>'
);

// Replace 🌀
content = content.replace(
  '<div className="animate-spin" style={{ fontSize: "2rem" }}>🌀</div>',
  '<div className="animate-spin" style={{ color: "var(--text-secondary)", display: "flex", justifyContent: "center" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg></div>'
);

// Replace backgrounds
content = content.replace(/rgba\(255,255,255,0\.03\)/g, 'rgba(0,0,0,0.04)');
content = content.replace(/rgba\(255,255,255,0\.05\)/g, 'rgba(0,0,0,0.06)');
content = content.replace(/rgba\(0,0,0,0\.2\)/g, 'rgba(0,0,0,0.03)');
content = content.replace(/rgba\(255, 255, 255, 0\.05\)/g, 'rgba(0,0,0,0.06)');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Dashboard fixed!');
