export default function handler(req, res) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>n8n Google OAuth Test</title>
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
    button, input[type="submit"] {
      background: #ff6d5a;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      margin: 10px 0;
    }
    input[type="text"] {
      width: 100%;
      padding: 8px;
      margin: 5px 0 15px;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-sizing: border-box;
    }
    label {
      font-weight: bold;
      display: block;
    }
    pre {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 4px;
      overflow: auto;
      max-height: 400px;
    }
    .success { color: #0f9d58; }
    .error { color: #db4437; }
    .panel {
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 15px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>n8n Google OAuth Test</h1>
  
  <p>This page simulates the exact n8n OAuth flow for Google Sheets.</p>
  
  <div class="panel">
    <h2>Step 1: Set up OAuth parameters</h2>
    <form id="oauthForm">
      <div>
        <label for="clientId">Google Client ID:</label>
        <input type="text" id="clientId" required>
      </div>
      <div>
        <label for="credentialId">n8n Credential ID (can be made up for testing):</label>
        <input type="text" id="credentialId" placeholder="TEST_CRED_123" value="TEST_CRED_123">
      </div>
      <input type="submit" value="Start OAuth Flow">
    </form>
  </div>
  
  <div class="panel">
    <h2>Step 2: Results</h2>
    <div id="result">
      <p>No OAuth flow has been initiated yet.</p>
    </div>
  </div>
  
  <div class="panel">
    <h2>Step 3: Test Data in LocalStorage</h2>
    <button id="checkStorage">Check n8n Data in LocalStorage</button>
    <div id="storageResult"></div>
  </div>
  
  <script>
    // Handle the form submission
    document.getElementById('oauthForm').addEventListener('submit', function(e) {
      e.preventDefault();
      
      const clientId = document.getElementById('clientId').value;
      const credentialId = document.getElementById('credentialId').value;
      const redirectUri = 'https://altiverr-webhook-relay.vercel.app/api/oauth2/rest/oauth2-credential/callback';
      
      // Create state object in n8n format
      const stateObj = {
        cid: credentialId,
        token: Math.random().toString(36).substr(2, 36),  // n8n uses this format for PKCE code verifier
        createdAt: Date.now()
      };
      
      const state = btoa(JSON.stringify(stateObj));
      
      // Store state for verification
      localStorage.setItem('oauth_test_state', state);
      localStorage.removeItem('n8n-oauth-state');
      localStorage.removeItem('n8n-oauth-response');
      
      // Construct OAuth URL
      const authUrl = \`https://accounts.google.com/o/oauth2/v2/auth?\` +
        \`client_id=\${encodeURIComponent(clientId)}\` +
        \`&redirect_uri=\${encodeURIComponent(redirectUri)}\` +
        \`&response_type=code\` +
        \`&scope=\${encodeURIComponent('https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly')}\` +
        \`&access_type=offline\` +
        \`&state=\${encodeURIComponent(state)}\` +
        \`&prompt=consent\`;
      
      // Start OAuth flow
      document.getElementById('result').innerHTML = \`
        <p>Starting OAuth flow with state:</p>
        <pre>\${JSON.stringify(stateObj, null, 2)}</pre>
        <p>Opening popup window...</p>
      \`;
      
      // Open the OAuth window
      const authWindow = window.open(authUrl, 'oauth', 'width=600,height=800');
      
      // Set up message listener for OAuth callback
      window.addEventListener('message', function messageHandler(event) {
        if (event.data && (
            event.data.type === 'oauth-credential-auth-complete' || 
            event.data.type === 'oauth-credential-auth-error'
          )) {
          
          const resultDiv = document.getElementById('result');
          
          if (event.data.type === 'oauth-credential-auth-complete') {
            resultDiv.innerHTML = \`
              <p class="success">✅ OAuth flow completed successfully!</p>
              <p>Token data received from the callback:</p>
              <pre>\${JSON.stringify(event.data, null, 2)}</pre>
            \`;
          } else {
            resultDiv.innerHTML = \`
              <p class="error">❌ OAuth flow failed!</p>
              <p>Error message: \${event.data.error || 'Unknown error'}</p>
            \`;
          }
          
          // Check localStorage
          document.getElementById('checkStorage').click();
          
          // Remove event listener
          window.removeEventListener('message', messageHandler);
        }
      });
    });
    
    // Check localStorage for OAuth data
    document.getElementById('checkStorage').addEventListener('click', function() {
      const storageDiv = document.getElementById('storageResult');
      const oauthState = localStorage.getItem('n8n-oauth-state');
      const oauthResponse = localStorage.getItem('n8n-oauth-response');
      
      let html = '<h3>LocalStorage OAuth Data:</h3>';
      
      if (oauthState) {
        try {
          const stateData = JSON.parse(oauthState);
          html += '<p class="success">✅ Found n8n-oauth-state in localStorage</p>';
          html += \`<pre>\${JSON.stringify(stateData, null, 2)}</pre>\`;
        } catch (e) {
          html += \`<p class="error">Error parsing n8n-oauth-state: \${e.message}</p>\`;
        }
      } else {
        html += '<p class="error">❌ No n8n-oauth-state found in localStorage</p>';
      }
      
      if (oauthResponse) {
        try {
          const responseData = JSON.parse(oauthResponse);
          html += '<p class="success">✅ Found n8n-oauth-response in localStorage</p>';
          html += \`<pre>\${JSON.stringify(responseData, null, 2)}</pre>\`;
        } catch (e) {
          html += \`<p class="error">Error parsing n8n-oauth-response: \${e.message}</p>\`;
        }
      } else {
        html += '<p class="error">❌ No n8n-oauth-response found in localStorage</p>';
      }
      
      storageDiv.innerHTML = html;
    });
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
} 