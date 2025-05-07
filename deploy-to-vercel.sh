#!/bin/bash
# Script to deploy the webhook relay to Vercel

echo "Deploying webhook relay to Vercel..."
npx vercel deploy --prod

echo "Checking deployment status..."
npx vercel list

echo "Deployment complete!" 