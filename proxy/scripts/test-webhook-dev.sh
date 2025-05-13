#!/bin/bash

# Create test payload file
cat > webhook-test-payload.json << 'EOL'
{
  "headers": {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json",
    "user-agent": "Altiverr-Webhook-Proxy/1.0",
    "x-webhook-source": "proxy-service",
    "content-length": "3389",
    "accept-encoding": "gzip, compress, deflate, br",
    "host": "localhost:5678",
    "connection": "keep-alive"
  },
  "params": {},
  "query": {},
  "body": {
    "id": "calendly_cb17521e-6d9f-4348-9e3d-5b1910f0bd95",
    "data": {
      "metadata": {
        "id": "calendly_cb17521e-6d9f-4348-9e3d-5b1910f0bd95",
        "receivedAt": "2025-05-12T21:17:13.170Z",
        "source": "calendly"
      },
      "event": {
        "name": "invitee.created",
        "type": "calendly.event",
        "time": "2025-05-12T21:17:13.000000Z"
      },
      "payload": {
        "original": {
          "created_at": "2025-05-12T21:17:13.000000Z",
          "created_by": "https://api.calendly.com/users/dadbc523-d6f9-4008-a9a9-58cc11ed564c",
          "event": "invitee.created",
          "payload": {
            "cancel_url": "https://calendly.com/cancellations/9cbca8f8-c422-48fb-8fd7-60a8d1bc5c6e",
            "created_at": "2025-05-12T21:17:12.421314Z",
            "email": "mzienert@gmail.com",
            "event": "https://api.calendly.com/scheduled_events/5f443a67-564e-4e90-a900-b0e92c02ec25",
            "first_name": null,
            "invitee_scheduled_by": null,
            "last_name": null,
            "name": "asd",
            "new_invitee": null,
            "no_show": null,
            "old_invitee": null,
            "payment": null,
            "questions_and_answers": [
              {
                "answer": "asd",
                "position": 0,
                "question": "What is the name of your business?"
              },
              {
                "answer": "asd",
                "position": 1,
                "question": "What industry are you in?"
              },
              {
                "answer": "$10K - $30K",
                "position": 2,
                "question": "What is your current monthly revenue?"
              },
              {
                "answer": "asd",
                "position": 3,
                "question": "What is your current tech stack?"
              },
              {
                "answer": "6 - 15",
                "position": 4,
                "question": "What's your current team size?"
              },
              {
                "answer": "Yes",
                "position": 5,
                "question": "Are you the decision-maker for hiring external help?"
              },
              {
                "answer": "Yes",
                "position": 6,
                "question": "Do you have budget available to invest in solving this now?"
              },
              {
                "answer": "Yes",
                "position": 7,
                "question": "You agree to show up to our scheduled event and that missing without notice will result in you being blacklisted in our system?"
              }
            ],
            "reconfirmation": null,
            "reschedule_url": "https://calendly.com/reschedulings/9cbca8f8-c422-48fb-8fd7-60a8d1bc5c6e",
            "rescheduled": false,
            "routing_form_submission": null,
            "scheduled_event": {
              "created_at": "2025-05-12T21:17:12.402046Z",
              "end_time": "2025-05-14T16:00:00.000000Z",
              "event_guests": [],
              "event_memberships": [
                {
                  "user": "https://api.calendly.com/users/dadbc523-d6f9-4008-a9a9-58cc11ed564c",
                  "user_email": "matt@altiverr.com",
                  "user_name": "Matthew Zienert"
                }
              ],
              "event_type": "https://api.calendly.com/event_types/706a491b-3a3b-462b-9705-0a8527645061",
              "invitees_counter": {
                "total": 1,
                "active": 1,
                "limit": 1
              },
              "location": {
                "join_url": "https://calendly.com/events/5f443a67-564e-4e90-a900-b0e92c02ec25/google_meet",
                "status": "processing",
                "type": "google_conference"
              },
              "meeting_notes_html": null,
              "meeting_notes_plain": null,
              "name": "30 Minute Meeting",
              "start_time": "2025-05-14T15:30:00.000000Z",
              "status": "active",
              "updated_at": "2025-05-12T21:17:12.402046Z",
              "uri": "https://api.calendly.com/scheduled_events/5f443a67-564e-4e90-a900-b0e92c02ec25"
            },
            "scheduling_method": null,
            "status": "active",
            "text_reminder_number": null,
            "timezone": "America/Denver",
            "tracking": {
              "utm_campaign": "cta_click",
              "utm_source": "header-top-right",
              "utm_medium": "website",
              "utm_content": null,
              "utm_term": null,
              "salesforce_uuid": null
            },
            "updated_at": "2025-05-12T21:17:12.421314Z",
            "uri": "https://api.calendly.com/scheduled_events/5f443a67-564e-4e90-a900-b0e92c02ec25/invitees/9cbca8f8-c422-48fb-8fd7-60a8d1bc5c6e"
          }
        },
        "event": "https://api.calendly.com/scheduled_events/5f443a67-564e-4e90-a900-b0e92c02ec25",
        "invitee": null,
        "tracking": {
          "utm_campaign": "cta_click",
          "utm_source": "header-top-right",
          "utm_medium": "website",
          "utm_content": null,
          "utm_term": null,
          "salesforce_uuid": null
        }
      }
    },
    "timestamp": "2025-05-12T21:17:13.170Z"
  },
  "webhookUrl": "http://localhost:5678/webhook-test/calendly",
  "executionMode": "development"
}
EOL

# Send to development endpoint
echo "Sending webhook to development endpoint..."
curl -X POST -H "Content-Type: application/json" -d @webhook-test-payload.json http://localhost:5678/webhook-test/calendly

echo ""
echo "Done!" 