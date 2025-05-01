const https = require('https');

// OAuth2 configuration
const config = {
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  // Vercel automatically provides HTTPS
  redirectUri: process.env.OAUTH_REDIRECT_URI
-};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Exchange the authorization code for an access token
    const tokenResponse = await exchangeCodeForToken(code);

    // Here you would typically:
    // 1. Store the access token securely
    // 2. Associate it with your n8n instance
    // 3. Redirect back to n8n with success

    return res.redirect(302, '/oauth/success');
  } catch (error) {
    console.error('OAuth error:', error);
    return res.status(500).json({ 
      error: 'OAuth authentication failed',
      details: error.message 
    });
  }
}

async function exchangeCodeForToken(code) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code,
      redirect_uri: config.redirectUri
    });

    const options = {
      hostname: 'slack.com',
      path: '/api/oauth.v2.access',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.toString().length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          if (!parsedData.ok) {
            reject(new Error(parsedData.error || 'Failed to exchange code for token'));
          } else {
            resolve(parsedData);
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(data.toString());
    req.end();
  });
} 