#!/bin/bash

# Generate new private key to match the existing certificate
openssl genrsa -out certs/salesforce_private.key 2048

# Generate a new certificate signing request (CSR)
openssl req -new -key certs/salesforce_private.key -out certs/salesforce.csr -subj "/C=US/ST=CA/L=San Francisco/O=Salesforce.com/OU=N8N Integration/CN=N8N_Integration_Cert"

# Generate a new certificate that matches our private key
openssl x509 -req -days 365 -in certs/salesforce.csr -signkey certs/salesforce_private.key -out certs/salesforce_cert.crt

# Clean up CSR as it's no longer needed
rm certs/salesforce.csr

echo "✅ New key pair generated:"
echo "Private Key: certs/salesforce_private.key"
echo "Certificate: certs/salesforce_cert.crt"

echo ""
echo "Next steps:"
echo "1. Go to your Salesforce Connected App"
echo "2. Click 'Edit Policies'"
echo "3. Check 'Use Digital Signatures'"
echo "4. Generate and upload a new certificate using this private key" 