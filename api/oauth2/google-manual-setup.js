export default async function handler(req, res) {
  // If code is provided, this is a callback from Google OAuth
  if (req.query.code) {
    try {
      // Exchange the code for tokens
      const tokenData = await exchangeTokenWithGoogle(req.query.code);
      
      // Display the tokens for manual configuration
      return renderTokenPage(res, tokenData);
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      return res.status(500).send(`<html><body><h1>Error</h1><p>${error.message}</p></body></html>`);
    }
  }
  
  // Otherwise, show the setup page
  return renderSetupPage(res);
}

/**
 * Exchange the authorization code for tokens with Google
 */
async function exchangeTokenWithGoogle(code) {
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const redirectUri = 'https://altiverr-webhook-relay.vercel.app/api/oauth2/google-manual-setup';
  
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

/**
 * Render the initial setup page with instructions and auth button
 */
function renderSetupPage(res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = 'https://altiverr-webhook-relay.vercel.app/api/oauth2/google-manual-setup';
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly')}` +
    `&access_type=offline` +
    `&prompt=consent`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>n8n Google Sheets Manual Setup</title>
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
        .card {
          background: #fff;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .step {
          margin-bottom: 15px;
          padding-left: 20px;
          position: relative;
        }
        .step:before {
          content: "→";
          position: absolute;
          left: 0;
          color: #ff6d5a;
        }
        .auth-button {
          display: inline-block;
          background: #4285F4;
          color: white;
          font-weight: bold;
          padding: 10px 20px;
          border-radius: 4px;
          text-decoration: none;
          margin: 20px 0;
        }
        .info {
          background: #e8f4fd;
          border-left: 4px solid #4285F4;
          padding: 10px 15px;
          margin: 15px 0;
        }
      </style>
    </head>
    <body>
      <h1>n8n Google Sheets Manual Setup</h1>
      
      <div class="card">
        <h2>Why this method?</h2>
        <p>This page helps you obtain Google OAuth tokens for your local n8n instance, particularly when automatic OAuth flow isn't working.</p>
        
        <div class="info">
          <p><strong>Note:</strong> This is a workaround for local n8n installations where the standard OAuth flow is not completing successfully.</p>
        </div>
      </div>
      
      <div class="card">
        <h2>Step 1: Authorize with Google</h2>
        <p>Click the button below to authorize with your Google account and generate the necessary tokens:</p>
        
        <a href="${authUrl}" class="auth-button">Authorize with Google</a>
      </div>
      
      <div class="card">
        <h2>After authorization</h2>
        <p>You'll receive access and refresh tokens that you can copy directly into your n8n Google Sheets credential.</p>
      </div>
    </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  return res.send(html);
}

/**
 * Render the page showing tokens after successful authorization
 */
function renderTokenPage(res, tokenData) {
  const expiryDate = Date.now() + (tokenData.expires_in * 1000);
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Google OAuth Tokens</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
          line-height: 1.6;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          color: #333;
        }
        h1 { color: #4285F4; }
        h2 { color: #333; margin-top: 30px; }
        pre {
          background: #f5f5f5;
          padding: 15px;
          border-radius: 4px;
          overflow: auto;
          max-height: 200px;
          word-break: break-all;
        }
        .card {
          background: #fff;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .token-container {
          background: #e8f4fd;
          border: 1px solid #4285F4;
          border-radius: 4px;
          padding: 10px;
          margin: 10px 0;
        }
        .token {
          font-family: monospace;
          font-size: 12px;
          word-break: break-all;
        }
        .copy-btn {
          background: #4285F4;
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          margin-top: 5px;
        }
        .step {
          margin-bottom: 15px;
          padding-left: 25px;
          position: relative;
        }
        .step:before {
          content: "→";
          position: absolute;
          left: 5px;
          color: #4285F4;
        }
        .success-banner {
          background-color: #d4edda;
          color: #155724;
          padding: 15px;
          border-radius: 4px;
          margin-bottom: 20px;
          border-left: 5px solid #28a745;
        }
      </style>
    </head>
    <body>
      <div class="success-banner">
        <h1>✅ Google Authorization Successful!</h1>
        <p>Your Google account has been successfully authorized. Follow the steps below to use these tokens in n8n.</p>
      </div>
      
      <div class="card">
        <h2>Instructions for n8n</h2>
        
        <div class="step">
          <p>In n8n, create a new Google Sheets credential with OAuth2 authentication</p>
        </div>
        
        <div class="step">
          <p>Enter your Client ID and Client Secret</p>
        </div>
        
        <div class="step">
          <p>For the Access Token, copy this value:</p>
          <div class="token-container">
            <div class="token" id="access-token">${tokenData.access_token}</div>
            <button class="copy-btn" onclick="copyToClipboard('access-token')">Copy Access Token</button>
          </div>
        </div>
        
        <div class="step">
          <p>For the Refresh Token, copy this value:</p>
          <div class="token-container">
            <div class="token" id="refresh-token">${tokenData.refresh_token}</div>
            <button class="copy-btn" onclick="copyToClipboard('refresh-token')">Copy Refresh Token</button>
          </div>
        </div>
        
        <div class="step">
          <p>Click "Save" in n8n</p>
        </div>
      </div>
      
      <div class="card">
        <h2>Complete Token Information</h2>
        <button class="copy-btn" onclick="copyToClipboard('token-json')">Copy Complete JSON</button>
        <pre id="token-json">{
  "access_token": "${tokenData.access_token}",
  "refresh_token": "${tokenData.refresh_token}",
  "scope": "${tokenData.scope}",
  "token_type": "${tokenData.token_type}",
  "expires_in": ${tokenData.expires_in},
  "expiry_date": ${expiryDate}
}</pre>
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
  return res.send(html);
} 