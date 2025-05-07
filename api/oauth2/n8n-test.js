const fs = require('fs');
const path = require('path');

// Handler to serve the n8n test page
export default function handler(req, res) {
  // Redirect to the HTML page to avoid file conflicts
  res.redirect(302, '/api/oauth2/n8n-test-page');
} 