const fs = require('fs');
const path = require('path');

// Handler to serve the n8n test page
module.exports = function handler(req, res) {
  // Redirect to the new URL to avoid file conflicts
  res.redirect(302, '/api/oauth2/n8n-oauth-test');
} 