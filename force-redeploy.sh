#!/bin/bash

# Script to force a clean deployment on Vercel by creating a timestamp file

# Create a timestamp file to invalidate cache
echo "Forcing redeployment at $(date)" > .force-redeploy-$(date +%Y%m%d%H%M%S).txt

# Commit and push changes
git add .
git commit -m "Force redeployment $(date)"
git push

echo "Added timestamp file to force redeployment. Changes have been committed and pushed."
echo "Now trigger a new deployment in your Vercel dashboard." 