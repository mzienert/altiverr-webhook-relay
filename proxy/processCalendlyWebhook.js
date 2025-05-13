// Get the input data 
const webhookData = $input.item.json;

// Different paths depending on payload structure (test vs production)
let actualPayload;

// First check if we have a test/development structure (deeply nested)
if (webhookData?.body?.body?.data?.payload?.original?.payload) {
  actualPayload = webhookData.body.body.data.payload.original.payload;
} 
// Then check if we have the production structure
else if (webhookData?.body?.data?.payload?.original?.payload) {
  actualPayload = webhookData.body.data.payload.original.payload;
}
// Try alternate paths if the expected ones don't work
else {
  // Try various possible paths
  actualPayload = 
    webhookData?.body?.data?.payload?.original?.payload ||
    webhookData?.data?.payload?.original?.payload ||
    webhookData?.body?.body?.payload?.original?.payload ||
    webhookData?.body?.payload?.original?.payload ||
    webhookData?.payload?.original?.payload;
}

// If we still don't have the payload, return error information
if (!actualPayload) {
  return {
    error: "Could not locate payload data",
    topLevelKeys: Object.keys(webhookData || {})
  };
}

// Function to safely search for data in the payload (wherever it is)
function findInPayload(payloadObj, path, defaultVal = "Not provided") {
  try {
    let current = payloadObj;
    const parts = path.split('.');
    
    for (const part of parts) {
      if (current[part] === undefined) return defaultVal;
      current = current[part];
    }
    
    return current || defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

// Look for questions_and_answers in a few possible locations
const questionsAndAnswers = 
  actualPayload.questions_and_answers || 
  actualPayload.scheduled_event?.questions_and_answers || 
  [];

// Helper function to find an answer
function findAnswer(question, defaultVal = "Not provided") {
  const qa = questionsAndAnswers.find(q => q.question === question);
  return qa ? qa.answer : defaultVal;
}

// Get answers to specific questions
const businessName = findAnswer("What is the name of your business?");
const industry = findAnswer("What industry are you in?");
const mrr = findAnswer("What is your current monthly revenue?");
const techStack = findAnswer("What is your current tech stack?");
const teamSize = findAnswer("What's your current team size?");
const decisionMaker = findAnswer("Are you the decision-maker for hiring external help?");

// Try to find the scheduled event
const scheduledEvent = actualPayload.scheduled_event || null;

// Format location
let location = "No location specified";
if (scheduledEvent?.location) {
  const locType = scheduledEvent.location.type || 'Unknown';
  const locUrl = scheduledEvent.location.join_url || 'no URL';
  location = `${locType} (${locUrl})`;
}

// Return the mapped data
const result = {
  name: actualPayload.name || "No name provided",
  email: actualPayload.email || "No email provided",
  "Company Name": businessName,
  "Industry": industry,
  "MRR": mrr,
  "Tech Stack": techStack,
  "Team Size": teamSize,
  "Decision Maker": decisionMaker,
  "Start Time": scheduledEvent?.start_time || null,
  "Location": location,
  "Reschedule URL": actualPayload.reschedule_url || "No reschedule URL"
};

return result; 