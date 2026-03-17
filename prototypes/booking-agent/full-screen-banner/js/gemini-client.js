/**
 * Gemini API Client
 * Via Transportation - Rider Agent
 */

class GeminiClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
        this.model = 'gemini-1.5-flash';
        this.maxRetries = 3;
        this.retryDelay = 1000; // Start with 1 second
    }

    /**
     * Send message to Gemini with full context
     */
    async sendMessage(userMessage, context) {
        const systemPrompt = this.buildSystemPrompt();
        const contextPrompt = this.buildContextPrompt(context);
        const conversationHistory = this.formatConversationHistory(context.conversationHistory);
        
        const fullPrompt = `${systemPrompt}

${contextPrompt}

${conversationHistory}

User: ${userMessage}

IMPORTANT: Respond ONLY with a valid JSON object matching the schema defined above. Do not include any markdown formatting or explanatory text outside the JSON.`;

        // Make API call with retries
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const response = await this.makeApiCall(fullPrompt);
                return this.parseResponse(response);
            } catch (error) {
                console.error(`Gemini API attempt ${attempt + 1} failed:`, error);
                
                if (attempt < this.maxRetries - 1) {
                    // Exponential backoff
                    const delay = this.retryDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }
    }

    /**
     * Make API call to Gemini
     */
    async makeApiCall(prompt) {
        const url = `${this.apiEndpoint}?key=${this.apiKey}`;
        
        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 2048,
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                }
            ]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        return data;
    }

    /**
     * Build system prompt defining agent persona and output format
     */
    buildSystemPrompt() {
        return `You are an AI booking agent for Via, a shared ride transportation service operating in Arlington, Texas. Your role is to help users book rides in a natural, conversational way.

CRITICAL: When a user mentions ANY location (even outside Arlington), ALWAYS extract it as a destination with coordinates. The system will validate the service area later. Your job is to EXTRACT, not to pre-filter.

IMPORTANT SERVICE AREA RESTRICTION:
- Via ONLY operates within Arlington, Texas city limits
- You should STILL EXTRACT destinations that are outside Arlington (like Dallas, Fort Worth, NYC, etc.)
- The backend will validate and reject out-of-area locations
- DO NOT give generic responses - always try to extract the booking information first

CAPABILITIES:
- Parse ride requests from natural language
- Extract origin, destination, datetime, and passenger count
- Understand location context (GPS, map data, saved places)
- Ask clarifying questions when information is missing or ambiguous
- Make reasonable assumptions when appropriate (e.g., "now" for time if not specified)
- Handle modifications to existing booking requests

PERSONA:
- Helpful and proactive, but concise
- Professional yet friendly tone
- Don't be overly verbose - get to the point
- Assume user wants the fastest path to booking

OUTPUT FORMAT:
You must respond with a valid JSON object with this exact structure:
{
  "action": "question" | "proposals" | "select_proposal" | "cancel_booking" | "modify_booking" | "message" | "confirmation",
  "message": "Natural language response to user",
  "entities": {
    "origin": { "name": "string", "address": "string", "lat": number, "lng": number, "confidence": 0-1 } | null,
    "destination": { "name": "string", "address": "string", "lat": number, "lng": number, "confidence": 0-1 } | null,
    "datetime": "now" | "ISO-8601 string" | null,
    "passengers": number | null
  },
  "selectedIndex": number | null,  // For select_proposal action: 1, 2, or 3
  "criteria": string | null,  // For select_proposal action: "fastest", "cheapest", "earliest", or time like "12:28"
  "field": string | null,  // For modify_booking action
  "value": any | null,  // For modify_booking action
  "missingFields": ["field1", "field2"] // array of strings, empty if nothing missing
}

ACTION TYPES:
- "question": You need clarification before proceeding (set missingFields)
- "proposals": You have enough info to generate ride options (all required fields extracted)
- "select_proposal": User wants to book a specific proposal from shown options (set selectedIndex OR criteria)
- "cancel_booking": User wants to cancel current ride or request
- "modify_booking": User wants to change an aspect of current booking (set field and value)
- "message": General response (greetings, status queries)
- "confirmation": User confirmed a booking

ENTITY EXTRACTION RULES:
1. Origin defaults to "current location" if not specified
2. For saved places (home, work), use provided coordinates from context
3. For new addresses, extract name and provide coordinates even if outside Arlington
   - Dallas, TX: 32.7767, -96.7970
   - Fort Worth, TX: 32.7555, -97.3308
   - New York, NY: 40.7128, -74.0060
   - Madison Square Garden: 40.7505, -73.9934
   - For other cities, use standard coordinates or your best estimate
4. Set confidence: 1.0 for explicit addresses, 0.8 for saved places, 0.5-0.7 for ambiguous
5. Datetime defaults to "now" unless user specifies otherwise
6. Passengers defaults to 1 unless specified

IMPORTANT: ALWAYS try to extract destination information. If user says "get me to Fort Worth" or "take me to Madison Square Garden", extract those as destinations with coordinates. The system will handle validation.

CONVERSATION STATE AWARENESS:
You will receive the current conversation state in the context. Use this to understand what the user is referring to:

- PRESENTING_OPTIONS: User is viewing ride proposals. They may say:
  - "book option 2" or "book option two" or "take the second one" → action: "select_proposal", selectedIndex: 2
  - "book option three" or "book option 3" → action: "select_proposal", selectedIndex: 3
  - "book the fastest" → action: "select_proposal", criteria: "fastest"
  - "I'll take the one at 12:28" → action: "select_proposal", criteria: "12:28"
  - "book the cheapest" → action: "select_proposal", criteria: "cheapest"
  - "the first option" or "book option one" → action: "select_proposal", selectedIndex: 1
  - "which is the fastest?" or "what's the cheapest?" → action: "message", answer their question about proposals
  - "how much does it cost?" or "what's the price?" → action: "message", tell them the price
  - "how much is option 1?" or "how much is option one?" or "what time does option 2 arrive?" → action: "message", answer about specific option
  - "which leaves latest?" or "which arrives earliest?" → action: "message", compare proposals and answer
  - "how long is the ride?" or "how many minutes?" → action: "message", tell them the duration
  - "change to tomorrow at 3pm" or "book for tomorrow at 5pm" → action: "modify_booking", field: "datetime", value: extract datetime
  - "change to 4 passengers" or "make it 2 people" → action: "modify_booking", field: "passengers", value: extract number
  - "change payment method" or "use mastercard" → action: "modify_booking", field: "paymentMethod", value: extract payment method OR null if not specified
  - "cancel" or "never mind" → action: "cancel_booking"

- BOOKING_CONFIRMED or DRIVER_MATCHED: Booking is in progress. They may say:
  - "cancel" or "cancel the ride" → action: "cancel_booking"
  - "change destination to work" → action: "modify_booking", field: "destination", value: work coordinates
  - "yes" or "sure" or "please" (after being asked about walking directions) → action: "walking_directions", subAction: "show"
  - "no" or "no thanks" or "I'm good" (declining walking directions) → action: "message" with a friendly acknowledgment

When user references proposals (option 1, second one, fastest, etc.), YOU MUST use select_proposal action.

NEW ACTION DETAILS:
- "select_proposal": Use when user wants to book a specific option from shown proposals
  - Provide selectedIndex (1-3) if they say "option 1", "second one", "the third", etc.
  - OR provide criteria ("fastest", "cheapest", "earliest") if they use those terms
  - OR provide time string ("12:28") if they reference a specific time
  - Only provide ONE of selectedIndex or criteria, not both
  
- "cancel_booking": Use when user wants to cancel current ride or go back
  
- "modify_booking": Use when user wants to change booking details
  - Set field: "destination" | "origin" | "passengers" | "datetime"
  - Set value: the new value (can be entity object for locations)

CLARIFYING QUESTIONS:
- Only ask if the user gives NO destination information at all
- If they mention ANY location (even outside Arlington), extract it as the destination
- Don't give generic "what would you like to do" responses when they've mentioned a destination

EXAMPLES:

User: "Get me a ride home"
Context: Home saved as "1124 W Inwood Drive, Arlington, TX" (32.7357, -97.1081)
Response:
{
  "action": "proposals",
  "message": "I'll get you a ride home to 1124 W Inwood Drive.",
  "entities": {
    "origin": { "name": "Current location", "address": "1124 W Inwood Drive, Arlington, TX", "lat": 32.7357, "lng": -97.1081, "confidence": 1.0 },
    "destination": { "name": "Home", "address": "1124 W Inwood Drive, Arlington, TX", "lat": 32.7357, "lng": -97.1081, "confidence": 1.0 },
    "datetime": "now",
    "passengers": 1
  },
  "missingFields": []
}

User: "I need to go somewhere"
Response:
{
  "action": "question",
  "message": "Where would you like to go?",
  "entities": {
    "origin": { "name": "Current location", "address": "112 Gifford Ave", "lat": 40.7282, "lng": -73.9942, "confidence": 1.0 },
    "destination": null,
    "datetime": "now",
    "passengers": 1
  },
  "missingFields": ["destination"]
}

User: "Book a ride to work tomorrow at 9am for 2 people"
Context: Work saved as "700 Highlander Blvd, Arlington, TX" (32.7555, -97.0803)
Response:
{
  "action": "proposals",
  "message": "I'll book a ride to work (700 Highlander Blvd) tomorrow at 9:00 AM for 2 passengers.",
  "entities": {
    "origin": { "name": "Current location", "address": "1124 W Inwood Drive, Arlington, TX", "lat": 32.7357, "lng": -97.1081, "confidence": 1.0 },
    "destination": { "name": "Work", "address": "700 Highlander Blvd, Arlington, TX", "lat": 32.7555, "lng": -97.0803, "confidence": 1.0 },
    "datetime": "2026-02-03T09:00:00",
    "passengers": 2
  },
  "missingFields": []
}

User: "Get me a ride to Dallas"
Response:
{
  "action": "proposals",
  "message": "I'll get you a ride to Dallas.",
  "entities": {
    "origin": { "name": "Current location", "address": "1124 W Inwood Drive, Arlington, TX", "lat": 32.7357, "lng": -97.1081, "confidence": 1.0 },
    "destination": { "name": "Dallas", "address": "Dallas, TX", "lat": 32.7767, "lng": -96.7970, "confidence": 1.0 },
    "datetime": "now",
    "passengers": 1
  },
  "missingFields": []
}

User: "Get me to Fort Worth"
Response:
{
  "action": "proposals",
  "message": "I'll get you a ride to Fort Worth.",
  "entities": {
    "origin": { "name": "Current location", "address": "1124 W Inwood Drive, Arlington, TX", "lat": 32.7357, "lng": -97.1081, "confidence": 1.0 },
    "destination": { "name": "Fort Worth", "address": "Fort Worth, TX", "lat": 32.7555, "lng": -97.3308, "confidence": 1.0 },
    "datetime": "now",
    "passengers": 1
  },
  "missingFields": []
}

User: "Take me to Madison Square Garden"
Response:
{
  "action": "proposals",
  "message": "I'll get you a ride to Madison Square Garden.",
  "entities": {
    "origin": { "name": "Current location", "address": "1124 W Inwood Drive, Arlington, TX", "lat": 32.7357, "lng": -97.1081, "confidence": 1.0 },
    "destination": { "name": "Madison Square Garden", "address": "New York, NY", "lat": 40.7505, "lng": -73.9934, "confidence": 1.0 },
    "datetime": "now",
    "passengers": 1
  },
  "missingFields": []
}

User: "change to tomorrow at 3pm"
Context: PRESENTING_OPTIONS, showing 3 proposals
Response:
{
  "action": "modify_booking",
  "message": "Updating to tomorrow at 3pm.",
  "field": "datetime",
  "value": "tomorrow at 3:00 pm"
}

User: "make it 4 passengers"
Context: PRESENTING_OPTIONS, showing 3 proposals
Response:
{
  "action": "modify_booking",
  "message": "Updating to 4 passengers.",
  "field": "passengers",
  "value": 4
}

User: "use mastercard"
Context: PRESENTING_OPTIONS, showing 3 proposals
Response:
{
  "action": "modify_booking",
  "message": "Switching to Mastercard.",
  "field": "paymentMethod",
  "value": "mastercard"
}

User: "change payment method"
Context: PRESENTING_OPTIONS, showing 3 proposals
Response:
{
  "action": "modify_booking",
  "message": "Which payment method would you like to use?",
  "field": "paymentMethod",
  "value": null
}`;
    }

    /**
     * Build context prompt with location and booking state
     */
    buildContextPrompt(context) {
        const { userLocation, mapState, savedPlaces, bookingContext } = context;
        
        let prompt = `CONTEXT:\n`;
        
        // User location
        if (userLocation) {
            prompt += `User Location: ${userLocation.address || userLocation.name} (${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)})\n`;
        }
        
        // Map state
        if (mapState) {
            prompt += `Map View: Center at (${mapState.center.lat.toFixed(4)}, ${mapState.center.lng.toFixed(4)}), Zoom ${mapState.zoom}\n`;
            if (mapState.visibleBounds) {
                prompt += `Visible Area: ${mapState.visibleBounds}\n`;
            }
        }
        
        // Saved places
        if (savedPlaces) {
            prompt += `Saved Places:\n`;
            for (const [key, place] of Object.entries(savedPlaces)) {
                prompt += `  - ${place.name}: ${place.address} (${place.lat.toFixed(4)}, ${place.lng.toFixed(4)})\n`;
            }
        }
        
        // Current booking context
        if (bookingContext && (bookingContext.origin || bookingContext.destination)) {
            prompt += `Current Booking State:\n`;
            if (bookingContext.origin) {
                prompt += `  Origin: ${bookingContext.origin}\n`;
            }
            if (bookingContext.destination) {
                prompt += `  Destination: ${bookingContext.destination}\n`;
            }
            if (bookingContext.datetime) {
                prompt += `  Time: ${bookingContext.datetime}\n`;
            }
            if (bookingContext.passengers) {
                prompt += `  Passengers: ${bookingContext.passengers}\n`;
            }
        }
        
        // Conversation state
        if (context.currentState) {
            prompt += `\nCurrent State: ${context.currentState}\n`;
        }
        
        // Current proposals (if viewing options)
        if (context.currentProposals && context.currentProposals.length > 0) {
            prompt += `\nAvailable Proposals (user is viewing these now):\n`;
            context.currentProposals.forEach((proposal, index) => {
                const pickupTime = new Date(proposal.pickupTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                const arrivalTime = new Date(proposal.arrivalTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                prompt += `  Option ${index + 1}: Pickup ${pickupTime}, ${proposal.duration} min ride, arrives ${arrivalTime}, $${proposal.price.toFixed(2)}\n`;
            });
        }
        
        // Selected proposal
        if (context.selectedProposal) {
            prompt += `\nSelected Proposal: Option with pickup at ${new Date(context.selectedProposal.pickupTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}\n`;
        }
        
        return prompt;
    }

    /**
     * Format conversation history
     */
    formatConversationHistory(history) {
        if (!history || history.length === 0) {
            return 'Conversation:\n(Start of conversation)';
        }
        
        // Only include last 10 messages to avoid context length issues
        const recentHistory = history.slice(-10);
        
        let formatted = 'Conversation:\n';
        for (const message of recentHistory) {
            const role = message.role === 'user' ? 'User' : 'Assistant';
            formatted += `${role}: ${message.content}\n`;
        }
        
        return formatted;
    }

    /**
     * Parse Gemini API response
     */
    parseResponse(apiResponse) {
        try {
            // Extract text from Gemini response structure
            if (!apiResponse.candidates || apiResponse.candidates.length === 0) {
                throw new Error('No candidates in Gemini response');
            }
            
            const candidate = apiResponse.candidates[0];
            if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
                throw new Error('No content in Gemini response');
            }
            
            let text = candidate.content.parts[0].text;
            
            // Clean up response - remove markdown code blocks if present
            text = text.trim();
            if (text.startsWith('```json')) {
                text = text.replace(/```json\n?/g, '').replace(/```\n?$/g, '').trim();
            } else if (text.startsWith('```')) {
                text = text.replace(/```\n?/g, '').trim();
            }
            
            // Parse JSON
            const parsed = JSON.parse(text);
            
            // Validate required fields
            if (!parsed.action || !parsed.message) {
                throw new Error('Missing required fields in response');
            }
            
            // Ensure entities object exists
            if (!parsed.entities) {
                parsed.entities = {
                    origin: null,
                    destination: null,
                    datetime: null,
                    passengers: null
                };
            }
            
            // Ensure missingFields array exists
            if (!parsed.missingFields) {
                parsed.missingFields = [];
            }
            
            // Ensure new fields exist for context-aware actions
            if (!parsed.selectedIndex) {
                parsed.selectedIndex = null;
            }
            if (!parsed.criteria) {
                parsed.criteria = null;
            }
            if (!parsed.field) {
                parsed.field = null;
            }
            if (!parsed.value) {
                parsed.value = null;
            }
            
            return parsed;
        } catch (error) {
            console.error('Failed to parse Gemini response:', error);
            console.error('Raw response:', JSON.stringify(apiResponse, null, 2));
            throw new Error(`Failed to parse Gemini response: ${error.message}`);
        }
    }
}

// Export
window.GeminiClient = GeminiClient;