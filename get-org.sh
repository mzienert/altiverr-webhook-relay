#!/bin/bash

# Replace with your access token
source .env

curl --request GET \
  --url https://api.calendly.com/users/me \
  --header "Authorization: Bearer ${CALENDLY_TOKEN}" 