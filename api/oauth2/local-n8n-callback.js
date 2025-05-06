export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    // Parse state if available
    let credentialId = '';
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        console.log('State data for local n8n callback:', stateData);
        credentialId = stateData.cid || '';
      } catch (e) {
        console.error('Error parsing state:', e);
      }
    }

    // Log the request details for debugging
    console.log('Local n8n callback request:', { code, state, credentialId });

    // Make token exchange request to Google
    const tokenData = await exchangeTokenWithGoogle(code);
    console.log('Received token data from Google');

    // Create a user-friendly response with clear instructions
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>n8n Local Authentication</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
          }
          h1 { color: #ff6d5a; }
          h2 { color: #333; margin-top: 30px; }
          pre {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            overflow: auto;
            max-height: 200px;
          }
          .credential-data {
            background: #e9f7fe;
            border: 1px solid #b3e0ff;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
          }
          .token {
            word-break: break-all;
            font-family: monospace;
            font-size: 12px;
          }
          .instructions {
            background: #fff8e1;
            border: 1px solid #ffe0b2;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
          }
          .step {
            margin-bottom: 10px;
            padding-left: 20px;
          }
          button {
            background: #4285F4;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <h1>Google OAuth Successful!</h1>
        
        <div class="instructions">
          <h2>How to use these credentials in your local n8n:</h2>
          <div class="step">1. In n8n, create a new Google Sheets credential</div>
          <div class="step">2. For Authentication, select "OAuth2"</div>
          <div class="step">3. Enter your Client ID and Client Secret</div>
          <div class="step">4. For the Access Token, copy this value: 
            <pre class="token">${tokenData.access_token}</pre>
          </div>
          <div class="step">5. For the Refresh Token, copy this value: 
            <pre class="token">${tokenData.refresh_token}</pre>
          </div>
          <div class="step">6. Click "Save" in n8n</div>
        </div>
        
        <div class="credential-data">
          <h2>Complete Credential Data:</h2>
          <button onclick="copyToClipboard('credential-json')">Copy JSON</button>
          <pre id="credential-json">
{
  "access_token": "${tokenData.access_token}",
  "refresh_token": "${tokenData.refresh_token}",
  "scope": "${tokenData.scope}",
  "token_type": "${tokenData.token_type}",
  "expires_in": ${tokenData.expires_in},
  "expiry_date": ${Date.now() + (tokenData.expires_in * 1000)}
}
          </pre>
        </div>
        
        <script>
          function copyToClipboard(elementId) {
            const element = document.getElementById(elementId);
            const text = element.textContent;
            navigator.clipboard.writeText(text).then(function() {
              alert('Copied to clipboard!');
            }).catch(function(err) {
              console.error('Could not copy text: ', err);
            });
          }
        </script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    return res.send(htmlResponse);
  } catch (error) {
    console.error('Error in local n8n callback:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Exchange the authorization code for tokens with Google
 */
async function exchangeTokenWithGoogle(code) {
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const redirectUri = 'https://altiverr-webhook-relay.vercel.app/api/oauth2/local-n8n-callback';
  
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Token exchange failed: ${errorData.error_description || errorData.error || response.statusText}`);
  }

  return response.json();
} 