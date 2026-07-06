const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../client/src/components/Onboarding.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Fix colors
content = content.replace(/rgba\(255,255,255,0\.1\)/g, 'rgba(0,0,0,0.1)');
content = content.replace(/rgba\(255,255,255,0\.15\)/g, 'rgba(0,0,0,0.15)');

// Also replace the arrow emoji if considered one (it's not but it's an ASCII char)
content = content.replace(
  'Continue →',
  'Continue &rarr;'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Onboarding fixed!');
