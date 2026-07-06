const fs = require('fs');
const path = require('path');

// 1. client/index.html
const indexHtmlPath = path.join(__dirname, '../client/index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
indexHtml = indexHtml.replace('<title>BookRec — AI Book Recommendations</title>', '<title>Story Nest</title>');
fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');

// 2. AuthPage.jsx
const authPagePath = path.join(__dirname, '../client/src/components/AuthPage.jsx');
let authPage = fs.readFileSync(authPagePath, 'utf8');
authPage = authPage.replace(/<div[\s\S]*?width: 56,[\s\S]*?height: 56,[\s\S]*?<\/svg>\s*<\/div>/, ''); // Remove the logo div
authPage = authPage.replace('BookRec', 'Story Nest');
fs.writeFileSync(authPagePath, authPage, 'utf8');

// 3. Dashboard.jsx
const dashboardPath = path.join(__dirname, '../client/src/components/Dashboard.jsx');
let dashboard = fs.readFileSync(dashboardPath, 'utf8');
dashboard = dashboard.replace(/<div style={{\s*width: 34,\s*height: 34,[\s\S]*?<\/svg>\s*<\/div>/, ''); // Remove the logo div
dashboard = dashboard.replace('BookRec', 'Story Nest');
fs.writeFileSync(dashboardPath, dashboard, 'utf8');

console.log('Renamed to Story Nest and removed logos!');
