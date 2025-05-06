const fs = require('fs');
const path = require('path');

module.exports = function handler(req, res) {
  try {
    // Read the HTML file
    const filePath = path.join(__dirname, 'n8n-test.html');
    const html = fs.readFileSync(filePath, 'utf8');
    
    // Set content type and return the HTML
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  } catch (error) {
    console.error('Error serving n8n test page:', error);
    res.status(500).send('Error loading n8n test page');
  }
} 