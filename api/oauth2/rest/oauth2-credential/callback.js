const https = require('https');

// OAuth2 configuration
const config = {
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  redirectUri: process.env.OAUTH_REDIRECT_URI || 'https://altiverr-webhook-relay.vercel.app/api/oauth2/rest/oauth2-credential/callback'
};

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

    // Return the token response in the format n8n expects
    return res.json({
      access_token: tokenResponse.access_token,
      token_type: tokenResponse.token_type,
      scope: tokenResponse.scope,
      team: tokenResponse.team,
      authed_user: tokenResponse.authed_user
    });
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