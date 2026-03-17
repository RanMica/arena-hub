/**
 * AI Agent Logic
 * Via Transportation - Rider Agent
 */

// Conversation states
const STATES = {
    INITIAL: 'INITIAL',
    PRESENTING_OPTIONS: 'PRESENTING_OPTIONS',
    PROPOSAL_SELECTED: 'PROPOSAL_SELECTED',
    BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
    DRIVER_MATCHED: 'DRIVER_MATCHED'
};

class AIAgent {
    constructor(bookingService) {
        this.bookingService = bookingService;
        this.conversationHistory = [];
        this.bookingContext = {
            origin: null,
            destination: null,
            datetime: 'now',
            passengers: 1,
            paymentMethod: CONFIG.mockData.paymentMethods[0]
        };
        this.currentState = STATES.INITIAL;
        this.ttsUtterance = null;
        this.currentProposals = null;  // Store proposals when presented
        this.selectedProposal = null;  // Store selected proposal
        this.pendingQuestion = null;  // Track if we're waiting for user to answer a question
        this.pendingDestination = null;  // Store potential destination for confirmation
        this.pendingWalkingDirectionsOffer = false;  // Track if we're waiting for walking directions response
        this.pendingCancellationReason = false;  // Track if we're waiting for cancellation reason
        this.pendingCancellationConfirmation = false;  // Track if we're waiting for cancellation confirmation
        this.selectedCancellationReason = null;  // Store selected cancellation reason
        
        // Initialize Gemini client if API key is available
        this.geminiClient = null;
        if (CONFIG.gemini && CONFIG.gemini.apiKey) {
            try {
                this.geminiClient = new GeminiClient(CONFIG.gemini.apiKey);
                console.log('Gemini client initialized');
            } catch (error) {
                console.error('Failed to initialize Gemini client:', error);
            }
        }
        
        // Initialize location context provider (will be set by app)
        this.locationContext = null;
        
        // Initialize TTS voice selection
        this.selectedVoice = null;
        this.initializeTTSVoice();
    }
    
    /**
     * Initialize TTS voice - select the best available voice
     */
    initializeTTSVoice() {
        if (!('speechSynthesis' in window)) {
            return;
        }
        
        // Voices may not be loaded immediately, so we need to handle both cases
        const loadVoices = () => {
            this.selectedVoice = this.getBestVoice();
            if (this.selectedVoice) {
                console.log('TTS voice selected:', this.selectedVoice.name);
            }
        };
        
        // Try to get voices immediately (may work if already loaded)
        loadVoices();
        
        // Also listen for voices changed event (fires when voices are loaded)
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    /**
     * Get the best available voice for TTS
     * Prefers natural-sounding voices over robotic ones
     */
    getBestVoice() {
        const voices = window.speechSynthesis.getVoices();
        
        if (!voices || voices.length === 0) {
            return null;
        }
        
        // Preferred voices in order (natural-sounding ones)
        // These are known to sound more human-like across different platforms
        const preferredVoices = [
            'Google US English',           // Chrome's natural voice (best quality)
            'Google UK English Female',    // Chrome's UK female voice
            'Google UK English Male',      // Chrome's UK male voice
            'Samantha',                    // macOS natural voice (excellent)
            'Karen',                       // macOS Australian voice
            'Daniel',                      // macOS British voice
            'Moira',                       // macOS Irish voice
            'Tessa',                       // macOS South African voice
            'Microsoft Zira',              // Windows natural female
            'Microsoft David',             // Windows natural male
            'Microsoft Mark',              // Windows natural male
        ];
        
        // Try to find a preferred voice
        for (const preferred of preferredVoices) {
            const voice = voices.find(v => v.name.includes(preferred));
            if (voice) {
                return voice;
            }
        }
        
        // Fallback: prefer any English voice that's not "default"
        const englishVoice = voices.find(v => 
            v.lang.startsWith('en') && !v.name.toLowerCase().includes('default')
        );
        if (englishVoice) {
            return englishVoice;
        }
        
        // Last resort: first available voice
        return voices[0] || null;
    }

    /**
     * Process user message
     */
    async processMessage(message) {
        this.conversationHistory.push({
            role: 'user',
            content: message,
            timestamp: new Date()
        });

        if (CONFIG.aiMode === 'real') {
            return await this.processWithGemini(message);
        } else {
            return await this.processSimulated(message);
        }
    }

    /**
     * Process quick action from the welcome screen chips
     */
    async processQuickAction(action, data = {}) {
        // Simulate thinking delay
        await this.delay(CONFIG.timing.aiThinkingDelay);

        switch (action) {
            case 'book-home':
                return await this.handleQuickBookHome(data);
            case 'book-work':
                return await this.handleQuickBookWork(data);
            case 'book-recent':
                return await this.handleQuickBookRecent();
            case 'schedule-ride':
                return await this.handleQuickScheduleRide();
            case 'view-upcoming':
                return await this.handleQuickViewUpcoming();
            case 'service-info':
                return await this.handleQuickServiceInfo();
            default:
                return {
                    text: "I'm not sure how to help with that. Would you like to book a ride?",
                    speak: true
                };
        }
    }

    /**
     * Handle "Book a ride home" quick action
     */
    async handleQuickBookHome(data) {
        const home = data.destination || CONFIG.mockData.savedPlaces.home;
        const origin = CONFIG.mockData.currentLocation;
        
        // Set booking context
        this.bookingContext.origin = origin;
        this.bookingContext.destination = home;
        this.bookingContext.datetime = 'now';
        
        try {
            // Generate proposals
            const proposals = await this.bookingService.generateProposals(
                origin,
                home,
                'now',
                this.bookingContext.passengers
            );
            
            this.currentProposals = proposals;
            this.currentState = STATES.PRESENTING_OPTIONS;
            
            return {
                text: `Great! I found ${proposals.length} ride options to get you home. Here are your choices:`,
                proposals: proposals,
                speak: true
            };
        } catch (error) {
            console.error('Error booking ride home:', error);
            return {
                text: "I'm sorry, I couldn't find ride options to your home address right now. Please try again.",
                speak: true
            };
        }
    }

    /**
     * Handle "Book a ride to work" quick action
     */
    async handleQuickBookWork(data) {
        const work = data.destination || CONFIG.mockData.savedPlaces.work;
        const origin = CONFIG.mockData.currentLocation;
        
        // Set booking context
        this.bookingContext.origin = origin;
        this.bookingContext.destination = work;
        this.bookingContext.datetime = 'now';
        
        try {
            // Generate proposals
            const proposals = await this.bookingService.generateProposals(
                origin,
                work,
                'now',
                this.bookingContext.passengers
            );
            
            this.currentProposals = proposals;
            this.currentState = STATES.PRESENTING_OPTIONS;
            
            return {
                text: `Perfect! I found ${proposals.length} ride options to get you to work. Here are your choices:`,
                proposals: proposals,
                speak: true
            };
        } catch (error) {
            console.error('Error booking ride to work:', error);
            return {
                text: "I'm sorry, I couldn't find ride options to your work address right now. Please try again.",
                speak: true
            };
        }
    }

    /**
     * Handle "Book a recent ride" quick action
     */
    async handleQuickBookRecent() {
        // Mock recent rides data
        const recentRides = [
            {
                id: 'recent-1',
                origin: CONFIG.mockData.savedPlaces.home,
                destination: CONFIG.mockData.savedPlaces.work,
                date: 'Yesterday, 8:30 AM',
                price: '$4.00'
            },
            {
                id: 'recent-2',
                origin: CONFIG.mockData.savedPlaces.work,
                destination: CONFIG.mockData.savedPlaces.home,
                date: 'Yesterday, 5:45 PM',
                price: '$4.00'
            },
            {
                id: 'recent-3',
                origin: CONFIG.mockData.currentLocation,
                destination: CONFIG.mockData.savedPlaces.stadium,
                date: 'Last Saturday, 6:00 PM',
                price: '$2.00'
            }
        ];
        
        return {
            text: "Here are your recent rides. Which one would you like to book again?",
            recentRides: recentRides,
            speak: true
        };
    }

    /**
     * Handle "Schedule a ride" quick action
     */
    async handleQuickScheduleRide() {
        return {
            text: "Sure! I can help you schedule a ride. Please select a date and time for your trip (at least 30 minutes from now), and let me know where you'd like to go.",
            action: 'open-scheduler',
            speak: true
        };
    }

    /**
     * Handle "View upcoming rides" quick action
     */
    async handleQuickViewUpcoming() {
        // Mock upcoming rides data
        const upcomingRides = [
            {
                id: 'upcoming-1',
                origin: { name: '720 Washington St', address: '720 Washington St, Arlington, TX' },
                destination: { name: '1011 Harrison Ave', address: '1011 Harrison Ave, Arlington, TX' },
                datetime: 'Tomorrow, 8:00 AM',
                pickupTime: '4:45 - 5:15 PM',
                arrivalTime: '5:05 - 5:35 PM',
                status: 'scheduled',
                passengers: 1,
                walkToPickup: 4,
                walkFromDropoff: 2,
                price: '$4.00'
            },
            {
                id: 'upcoming-2',
                origin: CONFIG.mockData.savedPlaces.home,
                destination: CONFIG.mockData.savedPlaces.stadium,
                datetime: 'Saturday, Feb 14, 5:30 PM',
                pickupTime: '5:15 - 5:45 PM',
                arrivalTime: '5:45 - 6:15 PM',
                status: 'scheduled',
                passengers: 2,
                walkToPickup: 3,
                walkFromDropoff: 5,
                price: '$2.00'
            }
        ];
        
        const count = upcomingRides.length;
        
        return {
            text: `You have ${count} upcoming ride${count !== 1 ? 's' : ''} scheduled:`,
            upcomingRides: upcomingRides,
            showViewAllLink: true,
            speak: true
        };
    }

    /**
     * Handle "Service info" quick action
     */
    async handleQuickServiceInfo() {
        const serviceHours = CONFIG.serviceHours.regular;
        
        // Format service hours
        const hoursText = Object.entries(serviceHours)
            .filter(([day, hours]) => !hours.closed)
            .map(([day, hours]) => `${hours.label}: ${hours.open} - ${hours.close}`)
            .slice(0, 1)[0]; // Just show weekday hours as example
        
        return {
            text: `Via Arlington is a shared ride service that provides affordable transportation within Arlington, Texas.\n\n**Service Hours:**\nMonday - Friday: 7:30 AM - 6:30 PM\nWeekends: Closed\n\n**How it works:**\n• Request a ride through the app\n• Share your ride with others going the same direction\n• Enjoy affordable flat-rate pricing at $2 per passenger\n\n**Service Area:**\nWe serve all of Arlington, TX including AT&T Stadium, Globe Life Field, and UT Arlington.`,
            speak: true,
            serviceInfo: true
        };
    }

    /**
     * Handle natural language query for recent rides
     */
    async handleRecentRidesQuery() {
        // Use the same data as the quick action
        const recentRides = [
            {
                id: 'recent-1',
                origin: CONFIG.mockData.savedPlaces.home,
                destination: CONFIG.mockData.savedPlaces.work,
                date: 'Yesterday, 8:30 AM',
                price: '$4.00'
            },
            {
                id: 'recent-2',
                origin: CONFIG.mockData.savedPlaces.work,
                destination: CONFIG.mockData.savedPlaces.home,
                date: '2 days ago, 5:45 PM',
                price: '$4.00'
            },
            {
                id: 'recent-3',
                origin: CONFIG.mockData.currentLocation,
                destination: CONFIG.mockData.savedPlaces.stadium,
                date: 'Last Saturday, 6:00 PM',
                price: '$2.00'
            }
        ];
        
        return {
            type: 'recent_rides',
            content: "Here are your recent rides. Would you like to book any of these again?",
            recentRides: recentRides,
            speak: true
        };
    }

    /**
     * Handle natural language query for upcoming rides
     */
    async handleUpcomingRidesQuery() {
        // Use the same data as the quick action
        const upcomingRides = [
            {
                id: 'upcoming-1',
                origin: { name: '720 Washington St', address: '720 Washington St, Arlington, TX' },
                destination: { name: '1011 Harrison Ave', address: '1011 Harrison Ave, Arlington, TX' },
                datetime: 'Tomorrow, 8:00 AM',
                pickupTime: '4:45 - 5:15 PM',
                arrivalTime: '5:05 - 5:35 PM',
                status: 'scheduled',
                passengers: 1,
                walkToPickup: 4,
                walkFromDropoff: 2,
                price: '$2.00'
            },
            {
                id: 'upcoming-2',
                origin: { name: 'AT&T Stadium', address: '1 AT&T Way, Arlington, TX' },
                destination: { name: 'Home', address: '1104 W Inwood Dr, Arlington, TX' },
                datetime: 'Saturday, 5:00 PM',
                pickupTime: '5:00 - 5:30 PM',
                arrivalTime: '5:20 - 5:50 PM',
                status: 'scheduled',
                passengers: 2,
                walkToPickup: 3,
                walkFromDropoff: 5,
                price: '$2.00'
            }
        ];
        
        const count = upcomingRides.length;
        
        return {
            type: 'upcoming_rides',
            content: `You have ${count} upcoming ride${count !== 1 ? 's' : ''} scheduled. Here they are:`,
            upcomingRides: upcomingRides,
            showViewAllLink: true,
            speak: true
        };
    }

    /**
     * Handle natural language query for points of interest
     */
    async handlePointsOfInterestQuery() {
        const pointsOfInterest = [
            {
                id: 'poi-1',
                name: 'CentrePort/DFW Airport Station',
                description: 'TEXRail station with direct service to DFW Airport',
                lat: 32.8982,
                lng: -97.0469
            },
            {
                id: 'poi-2',
                name: 'AT&T Stadium',
                description: 'Home of the Dallas Cowboys - major sports & events venue',
                lat: 32.7473,
                lng: -97.0945
            },
            {
                id: 'poi-3',
                name: 'Globe Life Field',
                description: 'Home of the Texas Rangers - baseball stadium',
                lat: 32.7474,
                lng: -97.0826
            },
            {
                id: 'poi-4',
                name: 'UT Arlington Campus',
                description: 'University of Texas at Arlington main campus',
                lat: 32.7299,
                lng: -97.1139
            },
            {
                id: 'poi-5',
                name: 'Arlington Convention Center',
                description: 'Event and convention space in downtown Arlington',
                lat: 32.7357,
                lng: -97.1081
            },
            {
                id: 'poi-6',
                name: 'Arlington City Hall',
                description: 'City government offices and services',
                lat: 32.7357,
                lng: -97.1081
            },
            {
                id: 'poi-7',
                name: 'Medical District - Texas Health',
                description: 'Texas Health Arlington Memorial Hospital area',
                lat: 32.7185,
                lng: -97.0858
            },
            {
                id: 'poi-8',
                name: 'Parks Mall at Arlington',
                description: 'Major shopping and dining destination',
                lat: 32.6954,
                lng: -97.1316
            }
        ];
        
        return {
            type: 'points_of_interest',
            content: "Here are some popular points of interest in Arlington. Would you like me to book a ride to any of these locations?",
            pointsOfInterest: pointsOfInterest,
            speak: true
        };
    }

    /**
     * Simulated AI processing
     */
    async processSimulated(message) {
        const intent = this.detectIntent(message);
        
        // Simulate thinking delay
        await this.delay(CONFIG.timing.aiThinkingDelay);
        
        switch (intent.type) {
            case 'proposal_question':
                return await this.handleProposalQuestion(intent.criteria, intent.optionIndex);
            
            case 'select_proposal':
                return await this.handleProposalSelection({
                    message: null,
                    selectedIndex: intent.selectedIndex,
                    criteria: intent.criteria
                });
            
            case 'modify_params':
                return await this.handleParamModification(intent.field, intent.value);
            
            case 'ask_payment_method':
                return await this.askPaymentMethod();
            
            case 'ask_passengers':
                return await this.askPassengers();
            
            case 'service_hours':
                return await this.handleServiceHoursQuery(intent);
            
            case 'service_hours_voice_yes':
                return await this.handleServiceHoursVoiceResponse(true);
            
            case 'service_hours_voice_no':
                return await this.handleServiceHoursVoiceResponse(false);
            
            case 'unknown_payment':
                return await this.handleUnknownPayment(intent.message);
            
            case 'book_ride':
                return await this.handleBookingRequest(intent);
            
            case 'clarify_destination':
                return await this.handleClarifyDestination(intent);
            
            case 'confirm_destination':
                return await this.handleConfirmDestination(intent);
            
            case 'cancel':
                return await this.handleCancelRequest();
            
            case 'modify':
                return await this.handleModifyRequest(intent);
            
            case 'status':
                return await this.handleStatusRequest();
            
            case 'walking_directions_accept':
                return await this.handleWalkingDirectionsAccept();
            
            case 'walking_directions_decline':
                return await this.handleWalkingDirectionsDecline();
            
            case 'cancellation_reason_selected':
                return await this.handleCancellationReasonSelected(intent.reason);
            
            case 'cancellation_confirmed':
                return await this.handleCancellationConfirmed();
            
            case 'cancellation_declined':
                return await this.handleCancellationDeclined();
            
            case 'payment_method_selected':
                return await this.handlePaymentMethodSelected(intent.paymentMethod);
            
            case 'recent_rides':
                return await this.handleRecentRidesQuery();
            
            case 'upcoming_rides':
                return await this.handleUpcomingRidesQuery();
            
            case 'points_of_interest':
                return await this.handlePointsOfInterestQuery();
            
            default:
                return {
                    type: 'message',
                    content: "I can help you book a ride, check your trip status, or make changes to your booking. What would you like to do?"
                };
        }
    }

    /**
     * Detect user intent
     */
    detectIntent(message) {
        const lower = message.toLowerCase();
        
        console.log('[detectIntent] Processing message:', message);
        console.log('[detectIntent] Current state:', this.currentState);
        console.log('[detectIntent] Has proposals:', !!this.currentProposals);
        console.log('[detectIntent] Pending question:', this.pendingQuestion);
        
        // Check if we're waiting for an answer to a pending question
        if (this.pendingQuestion) {
            console.log('[detectIntent] Handling pending question response');
            return this.handlePendingQuestionResponse(message);
        }
        
        // Check if we're waiting for walking directions response
        if (this.pendingWalkingDirectionsOffer) {
            console.log('[detectIntent] Handling walking directions response');
            // Accept patterns: yes, sure, please, okay, yeah, yep, show me, give me directions
            if (/^(yes|sure|please|okay|ok|yeah|yep|yup|absolutely|definitely|show me|give me|that would be|i'd like|i would like)/i.test(lower)) {
                this.pendingWalkingDirectionsOffer = false;
                return { type: 'walking_directions_accept' };
            }
            // Decline patterns: no, nope, nah, I'm good, no thanks, skip, don't need
            if (/^(no|nope|nah|i'm good|no thanks|skip|don't need|do not need|i don't|not now|maybe later)/i.test(lower)) {
                this.pendingWalkingDirectionsOffer = false;
                return { type: 'walking_directions_decline' };
            }
        }
        
        // Check if we're waiting for cancellation confirmation (yes/no)
        if (this.pendingCancellationConfirmation) {
            console.log('[detectIntent] Handling cancellation confirmation');
            // Yes patterns
            if (/^(yes|sure|yeah|yep|yup|absolutely|definitely|confirm|do it|go ahead|cancel it)/i.test(lower)) {
                this.pendingCancellationConfirmation = false;
                return { type: 'cancellation_confirmed' };
            }
            // No patterns
            if (/^(no|nope|nah|don't|do not|keep|nevermind|never mind|wait|stop|actually)/i.test(lower)) {
                this.pendingCancellationConfirmation = false;
                return { type: 'cancellation_declined' };
            }
        }
        
        // Check if we're waiting for cancellation reason
        if (this.pendingCancellationReason) {
            console.log('[detectIntent] Handling cancellation reason');
            const matchedReason = this.matchCancellationReason(message);
            if (matchedReason) {
                return { type: 'cancellation_reason_selected', reason: matchedReason };
            }
            // If no match, treat as "other"
            return { type: 'cancellation_reason_selected', reason: CONFIG.cancellationReasons.find(r => r.id === 'other') };
        }
        
        // Proposal-related intents - check if user is interacting with shown proposals
        if (this.currentState === STATES.PRESENTING_OPTIONS && this.currentProposals) {
            console.log('[detectIntent] In PRESENTING_OPTIONS state, checking intents...');
            
            // PRIORITY 0: Cancel intent - check first in all states
            if (/\bcancel\b|nevermind|never mind|stop the ride|abort/i.test(lower)) {
                console.log('[detectIntent] Matched cancel intent in PRESENTING_OPTIONS');
                return { type: 'cancel' };
            }
            
            // PRIORITY 1: Selection intents (must come first to avoid conflicts)
            // Helper: Convert word numbers to digits
            const wordToNum = { 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5 };
            
            // Pattern 1: "book/take/choose/select option X" or just "option X"
            const optionMatch = lower.match(/(?:book|take|choose|select|pick|i(?:'d| would) like(?: to take)?|let(?:'s| us) go with)?\s*option\s+(\d+|one|two|three|four|five)/i);
            if (optionMatch) {
                const indexStr = optionMatch[1];
                const selectedIndex = isNaN(indexStr) ? wordToNum[indexStr.toLowerCase()] : parseInt(indexStr);
                console.log('[detectIntent] Matched "option X" pattern, raw:', indexStr, 'converted:', selectedIndex);
                return { type: 'select_proposal', selectedIndex };
            }
            
            // Pattern 2: "the first/second/third one" or "first/second/third" alone or with action verbs
            // Also handles: "I'll take the first one", "let's go with the second", "the third one please"
            const ordinalMatch = lower.match(/(?:book|take|choose|select|pick|i(?:'d| would) like(?: to take)?|let(?:'s| us) go with|i'll take)?\s*(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)(?:\s+(?:one|option|ride|choice))?/i);
            if (ordinalMatch) {
                const ordinalMap = { 'first': 1, '1st': 1, 'second': 2, '2nd': 2, 'third': 3, '3rd': 3, 'fourth': 4, '4th': 4, 'fifth': 5, '5th': 5 };
                const selectedIndex = ordinalMap[ordinalMatch[1].toLowerCase()];
                console.log('[detectIntent] Matched ordinal selection:', ordinalMatch[1], '-> index:', selectedIndex);
                return { type: 'select_proposal', selectedIndex };
            }
            
            // Pattern 3: "number X" or just standalone number when clearly referring to options
            // "number 2", "2 please", "#3"
            const numberMatch = lower.match(/(?:number\s*|#)(\d+)|^(\d+)(?:\s+please)?$/i);
            if (numberMatch) {
                const selectedIndex = parseInt(numberMatch[1] || numberMatch[2]);
                if (selectedIndex >= 1 && selectedIndex <= 5) {
                    console.log('[detectIntent] Matched number selection:', selectedIndex);
                    return { type: 'select_proposal', selectedIndex };
                }
            }
            
            // Pattern 4: Criteria-based selection (fastest, cheapest, earliest, etc.)
            // With or without action verbs
            if (/(fastest|quickest)/i.test(lower)) {
                console.log('[detectIntent] Matched "fastest/quickest" criteria');
                return { type: 'select_proposal', criteria: 'fastest' };
            }
            if (/cheapest/i.test(lower)) {
                console.log('[detectIntent] Matched "cheapest" criteria');
                return { type: 'select_proposal', criteria: 'cheapest' };
            }
            if (/(earliest|soonest|leaves?\s+(?:the\s+)?(?:earliest|first|soonest))/i.test(lower)) {
                console.log('[detectIntent] Matched "earliest/soonest" criteria');
                return { type: 'select_proposal', criteria: 'earliest' };
            }
            
            // Pattern 5: Context-aware selection by ETA
            // "the one in 4 minutes", "the one arriving in 5 min", "4 minute one"
            const etaMatch = lower.match(/(?:the\s+)?(?:one\s+)?(?:in|arriving\s+in|that\s+(?:arrives|leaves|comes)\s+in)?\s*(\d+)\s*(?:min(?:ute)?s?)/i);
            if (etaMatch) {
                const minutes = parseInt(etaMatch[1]);
                console.log('[detectIntent] Matched ETA-based selection:', minutes, 'minutes');
                return { type: 'select_proposal', criteria: 'eta', etaMinutes: minutes };
            }
            
            // Pattern 6: "the $X one" or "the X dollar one" - price-based
            // MUST have either $ symbol OR "dollar" word to avoid matching dates like "February 19"
            const priceWithDollarSign = lower.match(/\$(\d+(?:\.\d{2})?)\s*(?:one|option|ride)?/i);
            const priceWithDollarWord = lower.match(/(?:the\s+)?(\d+(?:\.\d{2})?)\s*dollar\s*(?:one|option|ride)?/i);
            const priceMatch = priceWithDollarSign || priceWithDollarWord;
            if (priceMatch && !lower.includes('passenger') && !lower.includes('people')) {
                const price = parseFloat(priceMatch[1]);
                if (price > 0 && price < 100) { // Reasonable price range
                    console.log('[detectIntent] Matched price-based selection:', price);
                    return { type: 'select_proposal', criteria: 'price', targetPrice: price };
                }
            }
            
            // PRIORITY 2: Modification intents (passengers FIRST, then datetime, then payment)
            // Check passengers FIRST because "change to 5 passengers" could incorrectly match datetime pattern
            
            // "change to 4 passengers", "make it 2 people", "change to four passengers", "5 passengers please"
            if (/(?:passenger|people|person)/i.test(lower)) {
                // Check if user specified a number
                const hasNumber = /\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve/i.test(lower);
                
                // If user just says "change passengers" or "update passengers" without a number, show the widget
                if (/(?:change|update|modify|edit)\s+(?:the\s+)?(?:number\s+of\s+)?(?:passengers?|people|persons?)/i.test(lower) && !hasNumber) {
                    console.log('[detectIntent] Matched passenger change request without number - showing widget');
                    return { type: 'ask_passengers' };
                }
                
                const passengers = this.extractPassengers(message);
                console.log('[detectIntent] Matched passenger modification, extracted:', passengers);
                return {
                    type: 'modify_params',
                    field: 'passengers',
                    value: passengers
                };
            }
            
            // "change to tomorrow at 3pm", "update to November 12 at 5pm", "schedule for today"
            // Only match datetime if NOT a passenger message
            // Handle common typos like "tommorow"
            const datetimeModifyPattern = /(?:change|update|make it|switch|schedule|set).*(tomm?or+ow|today|tonight|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/i;
            // Match "at 5pm", "at 5:15", "for 3pm" - but require "at" or "for" keyword with time
            const datetimeAtPattern = /(?:at|for)\s+\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?(?!\s*(?:passenger|people|person))/i;
            
            if (datetimeModifyPattern.test(lower) || datetimeAtPattern.test(lower)) {
                const datetime = this.extractDatetime(message);
                console.log('[detectIntent] Matched datetime modification, extracted:', datetime);
                return { 
                    type: 'modify_params',
                    field: 'datetime',
                    value: datetime
                };
            }
            
            // "change payment method", "use different card", "switch to mastercard"
            if (/(?:change|switch|use).*(payment|card|method)/i.test(lower)) {
                // Check if they specified which payment method
                const paymentMethod = this.extractPaymentMethod(message);
                if (paymentMethod) {
                    return {
                        type: 'modify_params',
                        field: 'paymentMethod',
                        value: paymentMethod
                    };
                } else {
                    // Ask which payment method
                    return {
                        type: 'ask_payment_method'
                    };
                }
            }
            
            // PRIORITY 3: Questions about proposals
            // "which is the fastest?", "what's the cheapest?"
            if (/(?:which|what|what's|whats).*(fastest|quickest|earliest|soonest|cheapest|latest|slowest)/i.test(lower)) {
                const criteriaMatch = lower.match(/(fastest|quickest|earliest|soonest|cheapest|latest|slowest)/i);
                return { type: 'proposal_question', criteria: criteriaMatch[1].toLowerCase() };
            }
            
            // Specific questions about individual options: "how much is option 1?", "what time does option 2 arrive?"
            // Support both digits and words: "option 1" OR "option one"
            const optionQuestionMatch = lower.match(/(?:option|number)\s+(\d+|one|two|three|four|five)/i);
            if (optionQuestionMatch) {
                const indexStr = optionQuestionMatch[1];
                const wordToNum = { 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5 };
                const optionNum = isNaN(indexStr) ? wordToNum[indexStr.toLowerCase()] : parseInt(indexStr);
                
                if (optionNum >= 1 && optionNum <= this.currentProposals.length) {
                    // Determine what they're asking about
                    if (/(?:cost|price|much)/i.test(lower)) {
                        return { type: 'proposal_question', criteria: 'price', optionIndex: optionNum };
                    } else if (/(?:arrive|arrival|get there)/i.test(lower)) {
                        return { type: 'proposal_question', criteria: 'arrival', optionIndex: optionNum };
                    } else if (/(?:pickup|pick up|leaves|depart)/i.test(lower)) {
                        return { type: 'proposal_question', criteria: 'pickup', optionIndex: optionNum };
                    } else if (/(?:duration|long|minutes|time)/i.test(lower)) {
                        return { type: 'proposal_question', criteria: 'duration', optionIndex: optionNum };
                    }
                }
            }
            
            // General questions about price/cost: "how much does it cost?", "what's the price?"
            if (/(?:how much|cost|price)/i.test(lower) && !optionQuestionMatch) {
                return { type: 'proposal_question', criteria: 'price' };
            }
            
            // Questions about arrival time: "what time do they arrive?", "when will I get there?"
            if (/(?:what time|when|arrival)/i.test(lower) && /(?:arrive|get there)/i.test(lower)) {
                return { type: 'proposal_question', criteria: 'arrival' };
            }
            
            // Questions about duration: "how long is the ride?", "how many minutes?"
            if (/(?:how long|duration|minutes)/i.test(lower)) {
                return { type: 'proposal_question', criteria: 'duration' };
            }
        }
        
        // Cancel intent - CHECK FIRST before book_ride to avoid misinterpretation
        // Matches: "cancel", "cancel my ride", "cancel it", "cancel the ride", "please cancel", 
        // "I want to cancel", "can you cancel", "nevermind", "stop", etc.
        if (/\bcancel\b|nevermind|never mind|stop the ride|abort/i.test(lower)) {
            console.log('[detectIntent] Matched cancel intent');
            return { type: 'cancel' };
        }
        
        // Book ride intent - EXPANDED patterns
        // Pattern 1: Explicit ride request - "book me a ride", "get me a ride", "I need a ride"
        if (/(?:get|book|need|want|schedule|take|grab|find|order|request|arrange|call).+(?:ride|trip|drive|car|uber|lyft|taxi|transport)/i.test(message)) {
            console.log('[detectIntent] Matched explicit ride request');
            
            // Try to extract both origin and destination using improved extraction
            const { origin, destination } = this.extractOriginAndDestination(message);
            
            return {
                type: 'book_ride',
                origin: origin,
                destination: destination,
                datetime: this.extractDatetime(message),
                passengers: this.extractPassengers(message)
            };
        }
        
        // Pattern 2: "from [origin] to [destination]" - MUST CHECK FIRST for two-address patterns
        // Handles: "from 123 Main St to 456 Oak Ave", "I want to go from X to Y", "ride from A to B"
        const fromToPattern = message.match(/(?:from|starting\s+(?:at|from)|pickup\s+(?:at|from)|pick\s+me\s+up\s+(?:at|from))\s+(.+?)\s+(?:to|going\s+to|headed\s+to|heading\s+to)\s+(.+)/i);
        if (fromToPattern) {
            let origin = fromToPattern[1].trim();
            let destination = fromToPattern[2].trim().replace(/[?.!,]+$/, '');
            
            // Clean up origin - remove trailing words like "and", "then"
            origin = origin.replace(/\s+(?:and|then|to)\s*$/i, '').trim();
            // Clean destination of datetime/passenger info
            destination = this.cleanDestinationText(destination);
            
            console.log('[detectIntent] Matched "from X to Y" pattern, origin:', origin, 'destination:', destination);
            return {
                type: 'book_ride',
                origin: origin,
                destination: destination,
                datetime: this.extractDatetime(message),
                passengers: this.extractPassengers(message)
            };
        }
        
        // Pattern 3: "I want/need to go to [place]", "take me to [place]", "go to [place]"
        // Only destination provided - origin will default to current location
        const goToMatch = lower.match(/(?:i\s+)?(?:want|wanna|need|gotta|have)\s+(?:to\s+)?(?:go|get|head|travel|ride)\s+to\s+(.+)/i) ||
                          lower.match(/(?:take|bring|drop)\s+me\s+(?:to|at)\s+(.+)/i) ||
                          lower.match(/(?:can\s+you\s+)?(?:take|bring|get)\s+me\s+to\s+(.+)/i) ||
                          lower.match(/(?:let'?s?\s+)?go\s+to\s+(.+)/i) ||
                          lower.match(/(?:i'?m\s+)?(?:going|heading|headed)\s+to\s+(.+)/i) ||
                          lower.match(/(?:how\s+(?:do\s+i|can\s+i)\s+)?get\s+to\s+(.+)/i);
        
        if (goToMatch) {
            let destinationText = goToMatch[1].trim().replace(/[?.!,]+$/, '');
            // Strip datetime and passenger info from destination
            destinationText = this.cleanDestinationText(destinationText);
            console.log('[detectIntent] Matched "go to" pattern, destination:', destinationText);
            return {
                type: 'book_ride',
                origin: null, // Will default to current location
                destination: destinationText,
                datetime: this.extractDatetime(message),
                passengers: this.extractPassengers(message)
            };
        }
        
        // Pattern 4: "I'm at [origin] and need to get to [destination]"
        const atAndToMatch = lower.match(/(?:i'?m\s+)?(?:at|from)\s+(.+?)\s+(?:and\s+)?(?:need|want|going)\s+(?:to\s+)?(?:go\s+)?(?:to|get\s+to)\s+(.+)/i);
        if (atAndToMatch) {
            let destination = atAndToMatch[2].trim().replace(/[?.!,]+$/, '');
            destination = this.cleanDestinationText(destination);
            console.log('[detectIntent] Matched "at X and to Y" pattern');
            return {
                type: 'book_ride',
                origin: atAndToMatch[1].trim(),
                destination: destination,
                datetime: this.extractDatetime(message),
                passengers: this.extractPassengers(message)
            };
        }
        
        // Pattern 5: Detect POIs and addresses as potential destinations
        // Common POIs: stores, stations, airports, hospitals, universities, etc.
        const poiPatterns = /\b(walmart|target|costco|home\s*depot|lowes?|cvs|walgreens|starbucks|mcdonald'?s|airport|station|hospital|medical\s*center|university|college|mall|shopping\s*center|downtown|city\s*hall|library|park|arena|stadium|convention\s*center|hotel|motel|centerport|at&t\s*stadium|globe\s*life|six\s*flags|uta|ut\s*arlington|arlington\s*highlands?|lincoln\s*square|parks\s*mall)\b/i;
        const poiMatch = lower.match(poiPatterns);
        
        // Check for address-like patterns (numbers followed by street names)
        const addressPattern = /\b(\d{1,5}\s+(?:[nsew]\.?\s+)?(?:[a-z]+\s+){1,3}(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|circle|cir|place|pl|highway|hwy|parkway|pkwy))\b/i;
        const addressMatch = message.match(addressPattern);
        
        if (poiMatch || addressMatch) {
            const detectedPlace = poiMatch ? poiMatch[1] : addressMatch[1];
            
            // Check if this seems like a ride request context
            const hasRideContext = /(?:go|get|take|need|want|ride|trip|book|head|travel|drop|pick)/i.test(lower);
            
            if (hasRideContext) {
                // Try to extract origin as well (might have "from X to POI")
                const { origin } = this.extractOriginAndDestination(message);
                console.log('[detectIntent] POI/address with ride context:', detectedPlace, 'origin:', origin);
                return {
                    type: 'book_ride',
                    origin: origin, // Could be null, will default to current location
                    destination: detectedPlace,
                    datetime: this.extractDatetime(message),
                    passengers: this.extractPassengers(message)
                };
            } else {
                // No clear ride context - ask for clarification
                console.log('[detectIntent] POI/address without clear context, asking clarification:', detectedPlace);
                return {
                    type: 'clarify_destination',
                    potentialDestination: detectedPlace,
                    originalMessage: message
                };
            }
        }
        
        // Pattern 5: Simple destination mention without ride keywords
        // "Centerport Station", "1234 Main Street" - when it looks like just a place
        const standaloneAddressMatch = message.match(/^(\d{1,5}\s+[a-z\s]+(?:street|st|avenue|ave|road|rd|blvd|dr|ln|way|ct|cir|pl)\.?)$/i);
        if (standaloneAddressMatch) {
            console.log('[detectIntent] Standalone address detected:', standaloneAddressMatch[1]);
            return {
                type: 'clarify_destination',
                potentialDestination: standaloneAddressMatch[1],
                originalMessage: message
            };
        }
        
        // Modify intent
        if (/change|modify|edit|update/i.test(message)) {
            return { type: 'modify' };
        }
        
        // Service hours intent
        if (/service\s*hours?|operat(?:ing|e|ion)|open|close|hours?\s*(?:of\s*)?(?:operation|service)|when.*(?:start|open|close|available)|what\s*time.*(?:start|open|close|run)|schedule|working\s*hours/i.test(lower)) {
            // Determine if asking about specific day
            let dayQuery = null;
            if (/today/i.test(lower)) {
                dayQuery = 'today';
            } else if (/tomorrow/i.test(lower)) {
                dayQuery = 'tomorrow';
            } else if (/monday/i.test(lower)) {
                dayQuery = 'monday';
            } else if (/tuesday/i.test(lower)) {
                dayQuery = 'tuesday';
            } else if (/wednesday/i.test(lower)) {
                dayQuery = 'wednesday';
            } else if (/thursday/i.test(lower)) {
                dayQuery = 'thursday';
            } else if (/friday/i.test(lower)) {
                dayQuery = 'friday';
            } else if (/saturday/i.test(lower)) {
                dayQuery = 'saturday';
            } else if (/sunday/i.test(lower)) {
                dayQuery = 'sunday';
            }
            return { type: 'service_hours', dayQuery };
        }
        
        // Status intent
        if (/where|status|eta|how long|arrive/i.test(message)) {
            return { type: 'status' };
        }
        
        // Recent rides intent
        // "show my recent rides", "what rides have I taken", "previous trips", "past rides", "ride history"
        if (/(?:recent|past|previous|last|history|taken|completed)\s*(?:ride|trip|journey|booking)s?|(?:ride|trip|journey|booking)\s*(?:history|log)|show\s*(?:me\s+)?(?:my\s+)?(?:recent|past|previous)\s*(?:ride|trip)s?|what\s*(?:ride|trip)s?\s*(?:have\s+i|did\s+i)\s*(?:take|book|complete)/i.test(lower)) {
            console.log('[detectIntent] Matched recent rides intent');
            return { type: 'recent_rides' };
        }
        
        // Upcoming rides intent
        // "show my upcoming rides", "scheduled rides", "future trips", "do I have any rides booked"
        if (/(?:upcoming|scheduled|future|booked|planned|pending)\s*(?:ride|trip|journey|booking)s?|(?:ride|trip|journey|booking)s?\s*(?:coming\s*up|scheduled|booked)|(?:do\s+i\s+have|are\s+there)\s*(?:any\s+)?(?:upcoming|scheduled|future|booked)\s*(?:ride|trip)s?|what\s*(?:ride|trip)s?\s*(?:do\s+i\s+have|are)\s*(?:upcoming|scheduled|coming|booked)|my\s*(?:next|upcoming)\s*(?:ride|trip)s?/i.test(lower)) {
            console.log('[detectIntent] Matched upcoming rides intent');
            return { type: 'upcoming_rides' };
        }
        
        // Points of interest intent
        // "points of interest", "places to visit", "what can I see", "attractions", "things to do"
        if (/(?:point|place)s?\s*(?:of\s+)?interest|(?:place|thing|attraction|destination|location)s?\s*(?:to\s+)?(?:visit|see|go|explore)|what\s*(?:can\s+i|should\s+i|to)\s*(?:see|visit|do|explore)|attraction|landmark|popular\s*(?:place|destination|spot)s?|things?\s*to\s*do|where\s*(?:can|should)\s*i\s*(?:go|visit)|explore\s*(?:arlington|the\s*(?:city|area))/i.test(lower)) {
            console.log('[detectIntent] Matched points of interest intent');
            return { type: 'points_of_interest' };
        }
        
        return { type: 'unknown' };
    }

    /**
     * Handle response to a pending question
     */
    handlePendingQuestionResponse(message) {
        const lower = message.toLowerCase();
        
        if (this.pendingQuestion === 'payment_method') {
            // User is answering which payment method
            const paymentMethod = this.extractPaymentMethod(message);
            if (paymentMethod) {
                return { type: 'payment_method_selected', paymentMethod };
            } else {
                // Couldn't understand which payment method
                return {
                    type: 'unknown_payment',
                    message: lower
                };
            }
        }
        
        if (this.pendingQuestion === 'service_hours_voice') {
            // User is answering whether to read full schedule
            if (/^(yes|sure|yeah|yep|yup|please|ok|okay|go ahead)/i.test(lower)) {
                return { type: 'service_hours_voice_yes' };
            } else if (/^(no|nope|nah|don't|do not|nevermind|never mind|i'm good|that's ok)/i.test(lower)) {
                return { type: 'service_hours_voice_no' };
            }
        }
        
        if (this.pendingQuestion === 'confirm_destination') {
            // User is confirming if they want to book a ride to the detected destination
            if (/^(yes|sure|yeah|yep|yup|please|ok|okay|that'?s?\s*(?:right|correct)|correct|exactly|book\s*it)/i.test(lower)) {
                return { type: 'confirm_destination', confirmed: true, originalMessage: message };
            } else if (/^(no|nope|nah|don't|do not|not\s*(?:that|there)|wrong|incorrect|actually)/i.test(lower)) {
                return { type: 'confirm_destination', confirmed: false, originalMessage: message };
            }
            // If they provide a different destination, treat it as a new booking request
            // Check if they're giving a new destination
            if (lower.includes('to ') || lower.includes('want ') || lower.includes('going ')) {
                this.pendingQuestion = null;
                this.pendingDestination = null;
                return { type: 'book_ride', destination: message };
            }
        }
        
        return { type: 'unknown' };
    }
    
    /**
     * Extract payment method from message
     */
    extractPaymentMethod(message) {
        const lower = message.toLowerCase();
        
        // Check for specific payment method mentions
        if (/visa/i.test(lower) || /4671/i.test(lower)) {
            return CONFIG.mockData.paymentMethods.find(pm => pm.type === 'visa');
        }
        if (/mastercard|master card/i.test(lower) || /1234/i.test(lower)) {
            return CONFIG.mockData.paymentMethods.find(pm => pm.type === 'mastercard');
        }
        if (/credit|ride credit/i.test(lower)) {
            return CONFIG.mockData.paymentMethods.find(pm => pm.type === 'ride-credit');
        }
        
        // Check for ordinal references: "the first one", "second", etc.
        if (/(?:first|1st)/i.test(lower)) {
            return CONFIG.mockData.paymentMethods[0];
        }
        if (/(?:second|2nd)/i.test(lower)) {
            return CONFIG.mockData.paymentMethods[1];
        }
        if (/(?:third|3rd)/i.test(lower)) {
            return CONFIG.mockData.paymentMethods[2];
        }
        
        return null;
    }

    /**
     * Extract both origin and destination from a message
     * Handles patterns like "from X to Y", "ride from A to B", etc.
     */
    extractOriginAndDestination(message) {
        let origin = null;
        let destination = null;
        
        // Pattern 1: "from [origin] to [destination]"
        const fromToMatch = message.match(/(?:from|starting\s+(?:at|from)|pickup\s+(?:at|from))\s+(.+?)\s+(?:to|going\s+to)\s+(.+?)(?:\s+(?:at|for|with|\d)|\s*[?.!,]|$)/i);
        if (fromToMatch) {
            origin = fromToMatch[1].trim();
            destination = this.cleanDestinationText(fromToMatch[2].trim().replace(/[?.!,]+$/, ''));
            console.log('[extractOriginAndDestination] Found from/to pattern:', origin, '->', destination);
            return { origin, destination };
        }
        
        // Pattern 2: "[origin] to [destination]" (without "from")
        const toMatch = message.match(/(?:ride|trip|drive)\s+(?:from\s+)?(.+?)\s+to\s+(.+?)(?:\s+(?:at|for|with|\d)|\s*[?.!,]|$)/i);
        if (toMatch) {
            const potentialOrigin = toMatch[1].trim();
            const potentialDest = this.cleanDestinationText(toMatch[2].trim().replace(/[?.!,]+$/, ''));
            
            // Only use if origin doesn't look like a verb phrase
            if (!/^(?:a|the|me|my|us)$/i.test(potentialOrigin)) {
                origin = potentialOrigin;
                destination = potentialDest;
                console.log('[extractOriginAndDestination] Found ride to pattern:', origin, '->', destination);
                return { origin, destination };
            }
        }
        
        // Fall back to individual extraction
        origin = this.extractLocation(message, ['from', 'starting at', 'starting from', 'pickup at', 'pickup from', 'pick me up at', 'pick me up from']);
        destination = this.extractLocation(message, ['to', 'going to', 'headed to', 'heading to', 'drop off at', 'dropoff at']);
        
        // Clean destination
        if (destination) {
            destination = this.cleanDestinationText(destination);
        }
        
        console.log('[extractOriginAndDestination] Individual extraction:', origin, '->', destination);
        return { origin, destination };
    }
    
    /**
     * Extract location from message
     */
    extractLocation(message, keywords) {
        for (const keyword of keywords) {
            // Improved regex to capture addresses with numbers and multiple words
            // Stop at common delimiters or time/passenger indicators
            const regex = new RegExp(`${keyword}\\s+([\\d\\w\\s]+?)(?:\\s+(?:to|from|at|for|with|and|tomorrow|today|now|please|\\d{1,2}:\\d{2}|\\d{1,2}\\s*(?:am|pm)|passengers?|people)\\b|[?.!,]|$)`, 'i');
            const match = message.match(regex);
            if (match) {
                const location = match[1].trim();
                // Don't return if it's just articles or common words
                if (!/^(?:a|the|me|my|us|this)$/i.test(location)) {
                    return location;
                }
            }
        }
        
        // Check for saved places
        if (/\bwork\b/i.test(message)) return 'work';
        if (/\bhome\b/i.test(message)) return 'home';
        if (/lincoln park/i.test(message)) return 'lincoln park';
        
        return null;
    }

    /**
     * Clean destination text by removing datetime and passenger info
     * E.g., "101 Harrison Ave tomorrow at 5:15 PM for 5 people" -> "101 Harrison Ave"
     */
    cleanDestinationText(destination) {
        if (!destination) return destination;
        
        let cleaned = destination;
        
        // Remove datetime patterns
        // "tomorrow at 5:15 PM", "today at 3pm", "at 5:15 pm", "for 3pm"
        cleaned = cleaned.replace(/\s+(?:tomm?or+ow|today|tonight)\s*(?:at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/gi, '');
        cleaned = cleaned.replace(/\s+(?:at|for|around)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '');
        
        // Remove month + day patterns: "February 19", "on Feb 19"
        cleaned = cleaned.replace(/\s+(?:on\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/gi, '');
        
        // Remove passenger patterns
        // "for 5 people", "with 3 passengers", "for five passengers"
        cleaned = cleaned.replace(/\s+(?:for|with)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:people|passengers?|persons?)?/gi, '');
        cleaned = cleaned.replace(/\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:people|passengers?|persons?)/gi, '');
        
        // Clean up any trailing punctuation or whitespace
        cleaned = cleaned.replace(/[,\s]+$/, '').trim();
        
        console.log('[cleanDestinationText] Cleaned:', destination, '->', cleaned);
        return cleaned;
    }

    /**
     * Extract datetime from message
     */
    extractDatetime(message) {
        console.log('[extractDatetime] Processing message:', message);
        
        // IMPORTANT: Check specific dates FIRST before relative days
        
        // First, extract date (month + day) separately
        const monthPattern = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
        const monthMatch = message.match(monthPattern);
        
        if (monthMatch) {
            const month = monthMatch[1];
            // Find the day number after the month - use word boundary to get full number
            const afterMonth = message.slice(message.toLowerCase().indexOf(month.toLowerCase()) + month.length);
            const dayMatch = afterMonth.match(/\s*(\d{1,2})(?:st|nd|rd|th)?/i);
            
            if (dayMatch) {
                const day = dayMatch[1];
                
                // Now look for time anywhere in the message: "at 5:15 pm", "5:15pm", "at 5 pm"
                const timeMatch = message.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i) ||
                                  message.match(/(?:at\s+)(\d{1,2})(?::(\d{2}))?(?!\d)/i);
                
                if (timeMatch) {
                    const hour = timeMatch[1];
                    const minute = timeMatch[2] || '00';
                    const ampm = timeMatch[3] ? ` ${timeMatch[3]}` : '';
                    const result = `${month} ${day} at ${hour}:${minute}${ampm}`;
                    console.log('[extractDatetime] Extracted month/day with time:', result);
                    return result;
                } else {
                    // Date only, no time
                    const result = `${month} ${day}`;
                    console.log('[extractDatetime] Extracted month/day only:', result);
                    return result;
                }
            }
        }
        
        // Relative times with specific hours - TOMORROW (also handle common typos like "tommorow", "tommorrow")
        if (/\btomm?or+ow\b/i.test(message)) {
            // Look for time patterns AFTER "tomorrow" or with "at" keyword
            // Priority 1: "tomorrow at 5:15 pm" or "at 5:15 pm" pattern
            const atTimeMatch = message.match(/(?:tomorrow\s+)?(?:at|for|around)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
            if (atTimeMatch) {
                const hour = atTimeMatch[1];
                const minute = atTimeMatch[2] || '00';
                const ampm = atTimeMatch[3] ? ` ${atTimeMatch[3].replace(/\./g, '')}` : '';
                const result = `tomorrow at ${hour}:${minute}${ampm}`;
                console.log('[extractDatetime] Extracted tomorrow with "at" time:', result);
                return result;
            }
            
            // Priority 2: Time with am/pm directly (e.g., "tomorrow 5pm", "tomorrow 5:15pm")
            const directTimeMatch = message.match(/tomm?or+ow\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
            if (directTimeMatch) {
                const hour = directTimeMatch[1];
                const minute = directTimeMatch[2] || '00';
                const ampm = ` ${directTimeMatch[3].replace(/\./g, '')}`;
                const result = `tomorrow at ${hour}:${minute}${ampm}`;
                console.log('[extractDatetime] Extracted tomorrow with direct time:', result);
                return result;
            }
            
            return 'tomorrow';
        }
        
        // Relative times with specific hours - TODAY
        if (/\btoday\b/i.test(message)) {
            // Priority 1: "today at 5:15 pm" or "at 5:15 pm" pattern
            const atTimeMatch = message.match(/(?:today\s+)?(?:at|for|around)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
            if (atTimeMatch) {
                const hour = atTimeMatch[1];
                const minute = atTimeMatch[2] || '00';
                const ampm = atTimeMatch[3] ? ` ${atTimeMatch[3].replace(/\./g, '')}` : '';
                const result = `today at ${hour}:${minute}${ampm}`;
                console.log('[extractDatetime] Extracted today with "at" time:', result);
                return result;
            }
            
            // Priority 2: Time with am/pm directly (e.g., "today 5pm", "today 5:15pm")
            const directTimeMatch = message.match(/today\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
            if (directTimeMatch) {
                const hour = directTimeMatch[1];
                const minute = directTimeMatch[2] || '00';
                const ampm = ` ${directTimeMatch[3].replace(/\./g, '')}`;
                const result = `today at ${hour}:${minute}${ampm}`;
                console.log('[extractDatetime] Extracted today with direct time:', result);
                return result;
            }
            
            return 'today';
        }
        
        // Time patterns (only if no day specified)
        const timeMatch = message.match(/(?:at|around|for)\s+(\d{1,2}):?(\d{2})(?:\s*(am|pm))?/i);
        if (timeMatch) {
            const hour = timeMatch[1];
            const minute = timeMatch[2];
            const ampm = timeMatch[3] ? ` ${timeMatch[3]}` : '';
            const result = `${hour}:${minute}${ampm}`;
            console.log('[extractDatetime] Extracted time only:', result);
            return result;
        }
        
        // Relative times
        if (/\bnow\b/i.test(message)) return 'now';
        if (/\blater\b/i.test(message)) return 'later';
        
        console.log('[extractDatetime] Defaulting to now');
        return 'now';
    }

    /**
     * Extract number of passengers (handles add/remove context and booking requests)
     */
    extractPassengers(message) {
        const lower = message.toLowerCase();
        const currentPassengers = this.bookingContext.passengers || 1;
        
        // Word number mapping
        const wordMap = {
            'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
            'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
            'eleven': 11, 'twelve': 12, 'a': 1, 'an': 1, 'another': 1
        };
        
        // PRIORITY: Check for "for X people/passengers" patterns in booking requests
        // E.g., "book a ride for 5 people", "ride for five passengers", "go to X for 3 people"
        const forPeopleMatch = lower.match(/(?:for|with)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:people|passengers?|persons?)?/i);
        if (forPeopleMatch) {
            const num = wordMap[forPeopleMatch[1].toLowerCase()] || parseInt(forPeopleMatch[1]);
            if (num && num >= 1 && num <= 12) {
                console.log('[extractPassengers] Matched "for X people" pattern:', num);
                return num;
            }
        }
        
        // Check for ADD context: "add one more", "add 2 passengers", "one more passenger", "another passenger"
        const addPatterns = [
            /add\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an|another)/i,
            /(\d+|one|two|three|four|five|six|seven|eight|nine|ten|another)\s+more\s+(?:passenger|people|person)/i,
            /add\s+(?:a|an|another)\s+(?:passenger|person)/i,
            /(?:one|another)\s+(?:more\s+)?(?:passenger|person)/i
        ];
        
        for (const pattern of addPatterns) {
            const match = lower.match(pattern);
            if (match) {
                let addCount = 1;
                if (match[1]) {
                    addCount = wordMap[match[1].toLowerCase()] || parseInt(match[1]) || 1;
                }
                const newTotal = currentPassengers + addCount;
                console.log('[extractPassengers] ADD context detected, adding', addCount, 'to', currentPassengers, '=', newTotal);
                return newTotal;
            }
        }
        
        // Check for REMOVE context: "remove one passenger", "one less passenger", "reduce by 2"
        const removePatterns = [
            /remove\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)/i,
            /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:less|fewer)\s+(?:passenger|people|person)/i,
            /reduce\s+(?:by\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i,
            /subtract\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i
        ];
        
        for (const pattern of removePatterns) {
            const match = lower.match(pattern);
            if (match) {
                let removeCount = 1;
                if (match[1]) {
                    removeCount = wordMap[match[1].toLowerCase()] || parseInt(match[1]) || 1;
                }
                const newTotal = Math.max(1, currentPassengers - removeCount);
                console.log('[extractPassengers] REMOVE context detected, removing', removeCount, 'from', currentPassengers, '=', newTotal);
                return newTotal;
            }
        }
        
        // Check for digit patterns: "4 passengers", "2 people" (absolute numbers)
        const digitBeforeMatch = lower.match(/(\d+)\s*(?:people|passengers|person)/i);
        if (digitBeforeMatch) {
            return parseInt(digitBeforeMatch[1]);
        }
        
        // Check for patterns: "passengers to 4", "passengers: 4", "people to 12"
        const digitAfterMatch = lower.match(/(?:people|passengers|person)\s*(?:to|:)?\s*(\d+)/i);
        if (digitAfterMatch) {
            return parseInt(digitAfterMatch[1]);
        }
        
        // Check for "change/update to X" only if message contains passenger keywords
        if (/(?:passenger|people|person)/i.test(lower)) {
            const toDigitMatch = lower.match(/(?:change|update|set|make).*?(?:to|for)\s+(\d+)(?!\s*(?:am|pm|:|\d))/i);
            if (toDigitMatch) {
                return parseInt(toDigitMatch[1]);
            }
        }
        
        // Check for word numbers: "four passengers", "passengers to four"
        for (const [word, num] of Object.entries(wordMap)) {
            if (word === 'a' || word === 'an' || word === 'another') continue; // Skip these for absolute matching
            // Only match word numbers near passenger-related words or with "to/for"
            if (new RegExp(`(?:${word}\\s+(?:people|passengers|person)|(?:people|passengers|person).*${word}|(?:to|for)\\s+${word}\\b)`, 'i').test(lower)) {
                return num;
            }
        }
        
        // Default to current if nothing found
        return currentPassengers;
    }

    /**
     * Handle booking request
     */
    async handleBookingRequest(intent) {
        try {
            // Update context
            if (intent.origin) this.bookingContext.origin = intent.origin;
            if (intent.destination) this.bookingContext.destination = intent.destination;
            if (intent.datetime) this.bookingContext.datetime = intent.datetime;
            if (intent.passengers) this.bookingContext.passengers = intent.passengers;
            
            // Check if we have required info
            if (!this.bookingContext.origin) {
                this.bookingContext.origin = 'current location';
            }
            
            if (!this.bookingContext.destination) {
                return {
                    type: 'question',
                    content: "Where would you like to go?",
                    missingField: 'destination',
                    showChooseOnMap: true
                };
            }
            
            // Generate confirmation message with actual addresses
            const originText = this.bookingContext.origin === 'current location' 
                ? 'your current location' 
                : (typeof this.bookingContext.origin === 'object' && this.bookingContext.origin.address)
                    ? this.bookingContext.origin.address
                    : this.bookingContext.origin;
            
            const destText = (typeof this.bookingContext.destination === 'object' && this.bookingContext.destination.address)
                ? this.bookingContext.destination.address
                : this.bookingContext.destination;
            
            const timeText = this.bookingContext.datetime === 'now' ? 'leaving soon' : `for ${this.bookingContext.datetime}`;
            
            const confirmText = `Here are your ride options from ${originText} to ${destText} ${timeText}:`;
            
            // Generate proposals
            const proposals = await this.bookingService.generateProposals(
                this.bookingContext.origin,
                this.bookingContext.destination,
                this.bookingContext.datetime,
                this.bookingContext.passengers
            );
            
            // Store proposals for context
            this.currentProposals = proposals;
            this.currentState = STATES.PRESENTING_OPTIONS;
            
            return {
                type: 'proposals',
                content: confirmText,
                proposals,
                chips: {
                    payment: this.bookingContext.paymentMethod,
                    datetime: this.bookingContext.datetime,
                    passengers: this.bookingContext.passengers
                }
            };
        } catch (error) {
            console.error('Error in handleBookingRequest:', error);
            
            // Check for service area errors
            if (error.message && error.message.includes('OUT_OF_SERVICE_AREA')) {
                const errorMsg = error.message.replace(/^(ORIGIN|DESTINATION)_OUT_OF_SERVICE_AREA:\s*/, '');
                return {
                    type: 'message',
                    content: errorMsg,
                    showChooseOnMap: true
                };
            }
            
            // Check for not found errors
            if (error.message && error.message.includes('NOT_FOUND')) {
                const errorMsg = error.message.replace(/^(ORIGIN|DESTINATION)_NOT_FOUND:\s*/, '');
                return {
                    type: 'message',
                    content: errorMsg,
                    showChooseOnMap: true
                };
            }
            
            return {
                type: 'message',
                content: "I'm having trouble finding rides right now. Please try again."
            };
        }
    }

    /**
     * Handle clarify destination - ask user to confirm they want a ride
     */
    async handleClarifyDestination(intent) {
        const destination = intent.potentialDestination;
        
        // Store the potential destination for confirmation
        this.pendingDestination = destination;
        this.pendingQuestion = 'confirm_destination';
        
        return {
            type: 'question',
            content: `Are you trying to book a ride to ${destination}?`,
            missingField: 'destination_confirmation'
        };
    }

    /**
     * Handle destination confirmation response
     */
    async handleConfirmDestination(intent) {
        if (intent.confirmed && this.pendingDestination) {
            const destination = this.pendingDestination;
            this.pendingDestination = null;
            this.pendingQuestion = null;
            
            // Proceed with booking
            return await this.handleBookingRequest({
                destination: destination,
                datetime: this.extractDatetime(intent.originalMessage || ''),
                passengers: this.extractPassengers(intent.originalMessage || '')
            });
        } else {
            // User declined - clear pending state
            this.pendingDestination = null;
            this.pendingQuestion = null;
            
            return {
                type: 'message',
                content: "No problem! What can I help you with?"
            };
        }
    }

    /**
     * Handle questions about proposals
     */
    async handleProposalQuestion(criteria, optionIndex = null) {
        if (!this.currentProposals || this.currentProposals.length === 0) {
            return {
                type: 'message',
                content: "I don't see any ride options at the moment."
            };
        }
        
        let proposal = null;
        let answer = "";
        
        // If asking about a specific option
        if (optionIndex !== null) {
            proposal = this.currentProposals[optionIndex - 1];
            if (!proposal) {
                return {
                    type: 'message',
                    content: `Option ${optionIndex} is not available. I have ${this.currentProposals.length} options to choose from.`
                };
            }
            
            if (criteria === 'price') {
                answer = `Option ${optionIndex} costs ${CONFIG.pricing.currency}${proposal.price.toFixed(2)}.`;
            } else if (criteria === 'arrival') {
                const arrivalTime = this.bookingService.formatTime(proposal.arrivalTime);
                answer = `Option ${optionIndex} arrives at ${arrivalTime}.`;
            } else if (criteria === 'pickup') {
                const pickupTime = this.bookingService.getTimeFromNow(proposal.pickupTime);
                answer = `Option ${optionIndex} picks up ${pickupTime}.`;
            } else if (criteria === 'duration') {
                answer = `Option ${optionIndex} is a ${proposal.duration} minute ride.`;
            }
        } else {
            // General comparative questions
            if (criteria === 'fastest' || criteria === 'quickest') {
                proposal = this.findProposal('fastest');
                const index = this.currentProposals.indexOf(proposal) + 1;
                answer = `Option ${index} is the fastest at ${proposal.duration} minutes.`;
            } else if (criteria === 'cheapest') {
                proposal = this.findProposal('cheapest');
                const index = this.currentProposals.indexOf(proposal) + 1;
                answer = `All options are ${CONFIG.pricing.currency}${proposal.price.toFixed(2)}. Option ${index} has the earliest pickup.`;
            } else if (criteria === 'earliest' || criteria === 'soonest') {
                proposal = this.findProposal('earliest');
                const index = this.currentProposals.indexOf(proposal) + 1;
                const pickupTime = this.bookingService.getTimeFromNow(proposal.pickupTime);
                answer = `Option ${index} has the earliest pickup at ${pickupTime}.`;
            } else if (criteria === 'latest' || criteria === 'slowest') {
                // Find the latest pickup time
                proposal = this.currentProposals.reduce((latest, current) => 
                    current.pickupTime > latest.pickupTime ? current : latest
                );
                const index = this.currentProposals.indexOf(proposal) + 1;
                const pickupTime = this.bookingService.getTimeFromNow(proposal.pickupTime);
                answer = `Option ${index} has the latest pickup at ${pickupTime}.`;
            } else if (criteria === 'price') {
                // All options have the same price, so just tell them the price
                answer = `All options cost ${CONFIG.pricing.currency}${this.currentProposals[0].price.toFixed(2)}.`;
            } else if (criteria === 'arrival') {
                // List all arrival times
                const arrivals = this.currentProposals.map((p, i) => {
                    const time = this.bookingService.formatTime(p.arrivalTime);
                    return `Option ${i + 1} arrives at ${time}`;
                }).join(', ');
                answer = arrivals + '.';
            } else if (criteria === 'duration') {
                // List all durations
                const durations = this.currentProposals.map((p, i) => {
                    return `Option ${i + 1} is ${p.duration} minutes`;
                }).join(', ');
                answer = durations + '.';
            }
        }
        
        return {
            type: 'message',
            content: answer
        };
    }

    /**
     * Handle cancel request - starts the cancellation flow
     */
    async handleCancelRequest() {
        // Check if there's anything to cancel
        if (this.currentState === STATES.INITIAL || this.currentState === STATES.PRESENTING_OPTIONS) {
            // Reset state
            this.currentProposals = null;
            this.selectedProposal = null;
            this.currentState = STATES.INITIAL;
            
            return {
                type: 'cancel_request',
                content: "No problem! Let me know if you need anything else."
            };
        }
        
        // Has active booking - start cancellation flow
        this.pendingCancellationReason = true;
        
        return {
            type: 'cancellation_reason_prompt',
            content: "Why do you want to cancel your ride?",
            reasons: CONFIG.cancellationReasons
        };
    }
    
    /**
     * Match user message to cancellation reason
     */
    matchCancellationReason(message) {
        const lower = message.toLowerCase();
        
        for (const reason of CONFIG.cancellationReasons) {
            for (const keyword of reason.keywords) {
                if (lower.includes(keyword)) {
                    return reason;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Handle cancellation reason selected (by voice or click)
     */
    async handleCancellationReasonSelected(reason) {
        this.pendingCancellationReason = false;
        this.selectedCancellationReason = reason;
        this.pendingCancellationConfirmation = true;
        
        return {
            type: 'cancellation_confirmation_prompt',
            reason: reason,
            content: `You selected "${reason.label}". Are you sure you want to cancel your ride?`
        };
    }
    
    /**
     * Handle cancellation confirmed
     */
    async handleCancellationConfirmed() {
        const reason = this.selectedCancellationReason;
        this.selectedCancellationReason = null;
        
        return {
            type: 'cancel_booking',
            reason: reason,
            content: "Your ride has been cancelled."
        };
    }
    
    /**
     * Handle cancellation declined
     */
    async handleCancellationDeclined() {
        this.selectedCancellationReason = null;
        
        return {
            type: 'cancellation_declined',
            content: "Your ride is remaining active. Is there anything else I can help you with?"
        };
    }

    /**
     * Handle modify request
     */
    async handleModifyRequest(intent) {
        return {
            type: 'message',
            content: "What would you like to change?"
        };
    }

    /**
     * Handle status request
     */
    async handleStatusRequest() {
        return {
            type: 'message',
            content: "Your ride is on the way. ETA: 15 minutes."
        };
    }
    
    /**
     * Handle service hours query
     */
    async handleServiceHoursQuery(intent) {
        const serviceHours = CONFIG.serviceHours;
        const dayQuery = intent.dayQuery;
        
        // Helper to format time
        const formatTime = (time) => {
            if (!time) return null;
            const [hours, minutes] = time.split(':');
            const hour = parseInt(hours);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 || 12;
            return `${hour12}:${minutes} ${ampm}`;
        };
        
        // Helper to get day name
        const getDayName = (date) => {
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            return days[date.getDay()];
        };
        
        // Check for special date
        const checkSpecialDate = (date) => {
            const dateStr = date.toISOString().split('T')[0];
            return serviceHours.specialDates.find(sd => sd.date === dateStr);
        };
        
        // Get hours for a specific day
        const getHoursForDay = (dayName, date = null) => {
            if (date) {
                const special = checkSpecialDate(date);
                if (special) {
                    if (special.closed) {
                        return { closed: true, special: special.name };
                    }
                    return { 
                        open: formatTime(special.open), 
                        close: formatTime(special.close),
                        modified: true,
                        special: special.name
                    };
                }
            }
            
            const regular = serviceHours.regular[dayName];
            if (regular.closed) {
                return { closed: true };
            }
            return { open: formatTime(regular.open), close: formatTime(regular.close) };
        };
        
        // Build specific day response for voice
        let specificDayResponse = '';
        let targetDate = new Date();
        let dayName = dayQuery || getDayName(targetDate);
        
        if (dayQuery === 'today' || !dayQuery) {
            const hours = getHoursForDay(getDayName(targetDate), targetDate);
            if (hours.closed) {
                specificDayResponse = hours.special 
                    ? `Today the service is closed for ${hours.special}.`
                    : `The service is closed today.`;
            } else if (hours.modified) {
                specificDayResponse = `Today the service operates from ${hours.open} to ${hours.close} (modified hours for ${hours.special}).`;
            } else {
                specificDayResponse = `Today the service operates from ${hours.open} to ${hours.close}.`;
            }
        } else if (dayQuery === 'tomorrow') {
            targetDate.setDate(targetDate.getDate() + 1);
            const hours = getHoursForDay(getDayName(targetDate), targetDate);
            if (hours.closed) {
                specificDayResponse = hours.special 
                    ? `Tomorrow the service is closed for ${hours.special}.`
                    : `The service is closed tomorrow.`;
            } else if (hours.modified) {
                specificDayResponse = `Tomorrow the service operates from ${hours.open} to ${hours.close} (modified hours for ${hours.special}).`;
            } else {
                specificDayResponse = `Tomorrow the service operates from ${hours.open} to ${hours.close}.`;
            }
        } else {
            const hours = getHoursForDay(dayQuery);
            const dayLabel = serviceHours.regular[dayQuery].label;
            if (hours.closed) {
                specificDayResponse = `The service is closed on ${dayLabel}s.`;
            } else {
                specificDayResponse = `On ${dayLabel}s, the service operates from ${hours.open} to ${hours.close}.`;
            }
        }
        
        // Build regular schedule data for widget
        const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const regularSchedule = weekdays.map(day => {
            const hours = serviceHours.regular[day];
            return {
                day: hours.label,
                open: hours.closed ? null : formatTime(hours.open),
                close: hours.closed ? null : formatTime(hours.close),
                closed: hours.closed || false
            };
        });
        
        // Build upcoming special dates for widget
        const upcomingSpecial = serviceHours.specialDates.filter(sd => {
            const sdDate = new Date(sd.date);
            const now = new Date();
            return sdDate >= now;
        }).slice(0, 5).map(special => {
            const date = new Date(special.date);
            return {
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                name: special.name,
                open: special.closed ? null : formatTime(special.open),
                close: special.closed ? null : formatTime(special.close),
                closed: special.closed || false
            };
        });
        
        // Set pending question for voice follow-up
        this.pendingQuestion = 'service_hours_voice';
        
        return {
            type: 'service_hours_response',
            specificDayResponse,
            regularSchedule,
            upcomingSpecial,
            voicePrompt: 'Would you like me to read the full schedule?'
        };
    }
    
    /**
     * Handle service hours voice confirmation
     */
    async handleServiceHoursVoiceResponse(confirmed) {
        this.pendingQuestion = null;
        
        if (confirmed) {
            // Build speech text for full schedule
            const serviceHours = CONFIG.serviceHours;
            const formatTime = (time) => {
                if (!time) return null;
                const [hours, minutes] = time.split(':');
                const hour = parseInt(hours);
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const hour12 = hour % 12 || 12;
                return `${hour12}:${minutes} ${ampm}`;
            };
            
            let speech = 'Here are the regular service hours: ';
            const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
            
            // Group weekdays with same hours
            const regularHours = serviceHours.regular.monday;
            speech += `Monday through Friday, ${formatTime(regularHours.open)} to ${formatTime(regularHours.close)}. `;
            speech += 'Saturday and Sunday, the service is closed.';
            
            return {
                type: 'service_hours_voice_confirmed',
                speech
            };
        } else {
            return {
                type: 'message',
                content: "No problem! Let me know if you need anything else."
            };
        }
    }
    
    /**
     * Handle parameter modification (datetime, passengers, payment)
     */
    async handleParamModification(field, value) {
        console.log('[handleParamModification] field:', field, 'value:', value);
        console.log('[handleParamModification] Current state:', this.currentState);
        console.log('[handleParamModification] Has proposals:', !!this.currentProposals);
        
        if (!this.currentProposals || this.currentState !== STATES.PRESENTING_OPTIONS) {
            return {
                type: 'message',
                content: "Please request a ride first, and I'll help you customize the details."
            };
        }
        
        // Update booking context
        if (field === 'datetime') {
            this.bookingContext.datetime = value;
            const timeText = value === 'now' ? 'now' : value === 'tomorrow' ? 'tomorrow' : value;
            
            console.log('[handleParamModification] Updating datetime to:', value);
            console.log('[handleParamModification] TimeText for message:', timeText);
            
            // Regenerate proposals with new datetime
            try {
                const proposals = await this.bookingService.generateProposals(
                    this.bookingContext.origin,
                    this.bookingContext.destination,
                    value,
                    this.bookingContext.passengers
                );
                
                this.currentProposals = proposals;
                
                // Get actual addresses from proposals for message
                const originAddr = proposals[0]?.origin?.address || 'your location';
                const destAddr = proposals[0]?.destination?.address || 'your destination';
                
                const response = {
                    type: 'proposals',
                    content: `Updated to ${timeText}. Here are your ride options from ${originAddr} to ${destAddr}:`,
                    proposals,
                    chips: {
                        payment: this.bookingContext.paymentMethod,
                        datetime: value,  // Pass the full value to chip formatter
                        passengers: this.bookingContext.passengers
                    }
                };
                
                console.log('[handleParamModification] Returning response with chips:', response.chips);
                return response;
            } catch (error) {
                return {
                    type: 'message',
                    content: `Sorry, I couldn't update the time. ${error.message || 'Please try again.'}`
                };
            }
        } else if (field === 'passengers') {
            this.bookingContext.passengers = value;
            console.log('[handleParamModification] Updating passengers to:', value);
            
            // Regenerate proposals with new passenger count
            try {
                const proposals = await this.bookingService.generateProposals(
                    this.bookingContext.origin,
                    this.bookingContext.destination,
                    this.bookingContext.datetime,
                    value
                );
                
                this.currentProposals = proposals;
                
                // Get actual addresses from proposals for message
                const originAddr = proposals[0]?.origin?.address || 'your location';
                const destAddr = proposals[0]?.destination?.address || 'your destination';
                
                return {
                    type: 'proposals',
                    content: `Updated to ${value} ${value === 1 ? 'passenger' : 'passengers'}. Here are your ride options from ${originAddr} to ${destAddr}:`,
                    proposals,
                    chips: {
                        payment: this.bookingContext.paymentMethod,
                        datetime: this.bookingContext.datetime,
                        passengers: value
                    }
                };
            } catch (error) {
                return {
                    type: 'message',
                    content: `Sorry, I couldn't update the passenger count. ${error.message || 'Please try again.'}`
                };
            }
        } else if (field === 'paymentMethod') {
            this.bookingContext.paymentMethod = value;
            
            // Payment method change doesn't require regenerating proposals
            const paymentName = value.type === 'ride-credit' ? 'Ride Credit' : `${value.type.charAt(0).toUpperCase() + value.type.slice(1)} ending in ${value.last4}`;
            
            // Get actual addresses from proposals for message
            const originAddr = this.currentProposals[0]?.origin?.address || 'your location';
            const destAddr = this.currentProposals[0]?.destination?.address || 'your destination';
            
            return {
                type: 'proposals',
                content: `Payment method updated to ${paymentName}. Here are your ride options from ${originAddr} to ${destAddr}:`,
                proposals: this.currentProposals,
                chips: {
                    payment: value,
                    datetime: this.bookingContext.datetime,
                    passengers: this.bookingContext.passengers
                }
            };
        }
    }
    
    /**
     * Ask which payment method to use
     */
    async askPaymentMethod() {
        this.pendingQuestion = 'payment_method';
        
        const methods = CONFIG.mockData.paymentMethods;
        const currentMethod = this.bookingContext.paymentMethod;
        
        return {
            type: 'payment_method_prompt',
            content: `Which payment method would you like to use?`,
            paymentMethods: methods,
            currentMethod: currentMethod
        };
    }
    
    /**
     * Ask about passenger count and types
     */
    async askPassengers() {
        this.pendingQuestion = 'passengers';
        
        // Get current passenger types or default
        const currentCounts = this.bookingContext.passengerTypes || {
            adult: this.bookingContext.passengers || 1,
            child: 0,
            pca: 0
        };
        
        return {
            type: 'passengers_prompt',
            content: `How many passengers will be riding?`,
            currentCounts: currentCounts
        };
    }
    
    /**
     * Handle payment method selected (by voice or click)
     */
    async handlePaymentMethodSelected(paymentMethod) {
        this.pendingQuestion = null;
        this.bookingContext.paymentMethod = paymentMethod;
        
        const paymentName = paymentMethod.type === 'ride-credit' 
            ? 'Ride Credit' 
            : `${paymentMethod.type.charAt(0).toUpperCase() + paymentMethod.type.slice(1)} ending in ${paymentMethod.last4}`;
        
        return {
            type: 'payment_method_confirmed',
            content: `Confirmed! Your payment method is updated to ${paymentName}.`,
            paymentMethod: paymentMethod
        };
    }
    
    /**
     * Handle when payment method response is unclear
     */
    async handleUnknownPayment(message) {
        return {
            type: 'message',
            content: "I didn't catch which payment method you'd like. Could you say 'Visa', 'Mastercard', or 'Ride Credit'?"
        };
    }

    /**
     * Process with real Gemini API
     */
    async processWithGemini(message) {
        try {
            // PRE-CHECK: Handle cancel intent before sending to Gemini
            // This prevents Gemini from misinterpreting "cancel my ride" as a location
            const lower = message.toLowerCase();
            if (/\bcancel\b|nevermind|never mind|stop the ride|abort/i.test(lower)) {
                console.log('[Gemini] Pre-check detected cancel intent - handling locally');
                return await this.handleCancelRequest();
            }
            
            // PRE-CHECK: Handle passenger change without number - show widget
            if (/(?:change|update|modify|edit)\s+(?:the\s+)?(?:number\s+of\s+)?(?:passengers?|people|persons?)/i.test(lower)) {
                const hasNumber = /\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve/i.test(lower);
                if (!hasNumber && this.currentState === STATES.PRESENTING_OPTIONS) {
                    console.log('[Gemini] Pre-check detected passenger change request - showing widget');
                    return await this.askPassengers();
                }
            }
            
            // PRE-CHECK: Handle service hours query
            if (/service\s*hours?|operat(?:ing|e|ion)|hours?\s*(?:of\s*)?(?:operation|service)|when.*(?:start|open|close|available)|what\s*time.*(?:start|open|close|run)|schedule|working\s*hours/i.test(lower)) {
                console.log('[Gemini] Pre-check detected service hours query - handling locally');
                const intent = this.detectIntent(message);
                if (intent.type === 'service_hours') {
                    return await this.handleServiceHoursQuery(intent);
                }
            }
            
            // Check if Gemini client is available
            if (!this.geminiClient) {
                console.warn('Gemini client not initialized - check API key in config.local.js');
                throw new Error('Gemini client not initialized');
            }
            
            // Get location context
            const context = await this.getLocationContext();
            
            // Call Gemini API
            console.log('[Gemini] Calling API with context:', context);
            console.log('[Gemini] Current state:', this.currentState);
            console.log('[Gemini] Has proposals:', !!this.currentProposals);
            const response = await this.geminiClient.sendMessage(message, context);
            console.log('[Gemini] Raw response:', response);
            
            // Process the response
            const result = await this.processGeminiResponse(response);
            
            // Fallback: if Gemini returns generic message when we're showing proposals,
            // try simulated detection as fallback
            if (result.type === 'message' && 
                this.currentState === STATES.PRESENTING_OPTIONS && 
                this.currentProposals) {
                console.log('[Gemini] Generic response during proposal view - trying simulated detection');
                const intent = this.detectIntent(message);
                if (intent.type === 'select_proposal') {
                    console.log('[Gemini] Simulated fallback detected proposal selection');
                    return await this.handleProposalSelection({
                        message: null,
                        selectedIndex: intent.selectedIndex,
                        criteria: intent.criteria
                    });
                }
                if (intent.type === 'proposal_question') {
                    console.log('[Gemini] Simulated fallback detected proposal question');
                    return await this.handleProposalQuestion(intent.criteria, intent.optionIndex);
                }
            }
            
            return result;
            
        } catch (error) {
            console.error('Gemini API error:', error);
            
            // Provide helpful error messages
            let errorMessage = null;
            if (error.message.includes('API key')) {
                errorMessage = "AI service not configured. Using basic mode.";
            } else if (error.message.includes('403') || error.message.includes('401')) {
                errorMessage = "AI service authentication failed. Using basic mode.";
            } else if (error.message.includes('rate limit') || error.message.includes('429')) {
                errorMessage = "AI service is busy. Using basic mode.";
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                errorMessage = "Network error. Using basic mode.";
            }
            
            if (errorMessage) {
                console.warn(errorMessage);
            }
            
            console.warn('Falling back to simulated mode');
            return await this.processSimulated(message);
        }
    }

    /**
     * Get location context for Gemini
     */
    async getLocationContext() {
        const context = {
            userLocation: CONFIG.mockData.currentLocation,
            mapState: null,
            savedPlaces: CONFIG.mockData.savedPlaces,
            bookingContext: this.bookingContext,
            conversationHistory: this.conversationHistory,
            currentState: this.currentState,
            currentProposals: this.currentProposals,
            selectedProposal: this.selectedProposal
        };
        
        // If location context provider is available, use it
        if (this.locationContext) {
            try {
                const fullContext = await this.locationContext.getCurrentContext();
                // Merge our state into the full context
                return {
                    ...fullContext,
                    currentState: this.currentState,
                    currentProposals: this.currentProposals,
                    selectedProposal: this.selectedProposal
                };
            } catch (error) {
                console.warn('Failed to get location context:', error);
            }
        }
        
        return context;
    }

    /**
     * Process Gemini API response
     */
    async processGeminiResponse(geminiResponse) {
        const { action, message, entities, missingFields } = geminiResponse;
        
        // Update booking context with extracted entities
        if (entities) {
            if (entities.origin && entities.origin.confidence >= 0.7) {
                this.bookingContext.origin = entities.origin;
            }
            if (entities.destination && entities.destination.confidence >= 0.7) {
                this.bookingContext.destination = entities.destination;
            }
            if (entities.datetime) {
                this.bookingContext.datetime = entities.datetime;
            }
            if (entities.passengers) {
                this.bookingContext.passengers = entities.passengers;
            }
        }
        
        // Handle different action types
        switch (action) {
            case 'select_proposal':
                return await this.handleProposalSelection(geminiResponse);
            
            case 'cancel_booking':
                return await this.handleCancellation(geminiResponse);
            
            case 'modify_booking':
                return await this.handleModification(geminiResponse);
            
            case 'question':
                return {
                    type: 'question',
                    content: message,
                    missingFields: missingFields || []
                };
            
            case 'proposals':
                // Generate proposals with the extracted entities
                return await this.generateProposalsFromEntities(message, entities);
            
            case 'walking_directions':
                this.pendingWalkingDirectionsOffer = false;
                return {
                    type: 'walking_directions',
                    action: 'show',
                    content: message || "Let me get those walking directions for you."
                };
            
            case 'confirmation':
            case 'message':
            default:
                return {
                    type: 'message',
                    content: message
                };
        }
    }

    /**
     * Handle proposal selection from voice/text command
     */
    async handleProposalSelection(geminiResponse) {
        const { message, selectedIndex, criteria } = geminiResponse;
        
        // Check if we have proposals to select from
        if (!this.currentProposals || this.currentProposals.length === 0) {
            return {
                type: 'message',
                content: "I don't see any ride options to book. Would you like me to search for rides?"
            };
        }
        
        // Find the proposal based on index or criteria
        let proposal = null;
        
        if (selectedIndex) {
            proposal = this.findProposal(selectedIndex);
        } else if (criteria) {
            // Pass additional context for criteria-based selection
            proposal = this.findProposal(criteria, geminiResponse);
        }
        
        if (!proposal) {
            return {
                type: 'message',
                content: "I couldn't find that option. You can say 'option 1', 'the first one', 'the fastest', or describe the ride you want."
            };
        }
        
        // Store selected proposal
        this.selectedProposal = proposal;
        this.currentState = STATES.PROPOSAL_SELECTED;
        
        // Return a special response type that tells the app to trigger booking UI
        return {
            type: 'proposal_selected',
            content: message || `Got it! Booking option ${this.currentProposals.indexOf(proposal) + 1}.`,
            proposal: proposal
        };
    }

    /**
     * Handle booking cancellation (from Gemini)
     */
    async handleCancellation(geminiResponse) {
        const { message } = geminiResponse;
        
        // Check if there's anything to cancel
        if (this.currentState === STATES.INITIAL || this.currentState === STATES.PRESENTING_OPTIONS) {
            // Reset state
            this.currentProposals = null;
            this.selectedProposal = null;
            this.currentState = STATES.INITIAL;
            
            return {
                type: 'cancel_request',
                content: message || "No problem! Let me know if you need anything else."
            };
        }
        
        // Has active booking - start cancellation flow (same as simulated)
        this.pendingCancellationReason = true;
        
        return {
            type: 'cancellation_reason_prompt',
            content: "Why do you want to cancel your ride?",
            reasons: CONFIG.cancellationReasons
        };
    }

    /**
     * Handle booking modification
     */
    async handleModification(geminiResponse) {
        const { message, field, value, entities } = geminiResponse;
        
        // Check if there's a booking to modify
        if (!this.selectedProposal && this.currentState === STATES.INITIAL) {
            return {
                type: 'message',
                content: "There's no active booking to modify. Would you like to book a new ride?"
            };
        }
        
        // If modifying during proposal view, use the unified handler
        if (this.currentState === STATES.PRESENTING_OPTIONS) {
            // Handle different field types
            if (field === 'datetime') {
                // Extract datetime value from entities or value
                const datetime = value || (entities && entities.datetime) || 'now';
                return await this.handleParamModification('datetime', datetime);
            } else if (field === 'passengers') {
                const passengers = parseInt(value) || 1;
                return await this.handleParamModification('passengers', passengers);
            } else if (field === 'paymentMethod') {
                // If value is null, ask which payment method
                if (!value) {
                    return await this.askPaymentMethod();
                }
                // Value should be a payment method object or identifier
                // Try to find the payment method
                let paymentMethod = null;
                if (typeof value === 'string') {
                    paymentMethod = this.extractPaymentMethod(value);
                } else {
                    paymentMethod = value;
                }
                
                if (paymentMethod) {
                    return await this.handleParamModification('paymentMethod', paymentMethod);
                } else {
                    return await this.askPaymentMethod();
                }
            } else if (field === 'destination' && entities && entities.destination) {
                // Destination change requires full regeneration
                this.bookingContext.destination = entities.destination;
                return await this.generateProposalsFromEntities(
                    message || `Updated destination. Here are your new options:`,
                    this.bookingContext
                );
            } else if (field === 'origin' && entities && entities.origin) {
                // Origin change requires full regeneration
                this.bookingContext.origin = entities.origin;
                return await this.generateProposalsFromEntities(
                    message || `Updated pickup location. Here are your new options:`,
                    this.bookingContext
                );
            }
        }
        
        // For confirmed bookings, return modification request
        return {
            type: 'modify_booking',
            content: message || `Updating your ${field}...`,
            field,
            value
        };
    }

    /**
     * Generate proposals from extracted entities
     */
    async generateProposalsFromEntities(message, entities) {
        try {
            // Ensure we have destination
            if (!entities.destination) {
                return {
                    type: 'question',
                    content: "Where would you like to go?",
                    missingFields: ['destination'],
                    showChooseOnMap: true
                };
            }
            
            // Use origin or default to current location
            const origin = entities.origin || CONFIG.mockData.currentLocation;
            let destination = entities.destination;
            const datetime = entities.datetime || 'now';
            const passengers = entities.passengers || 1;
            
            // IMPORTANT: Re-validate destination through geocoding service
            // Gemini may estimate coordinates for unknown locations that happen to fall
            // within service area bounds. We need to verify it's a real, valid address.
            if (destination && typeof destination === 'object') {
                const addressToGeocode = destination.address || destination.name;
                if (addressToGeocode) {
                    console.log('Re-validating destination through geocoding:', addressToGeocode);
                    const geocodeResult = await this.bookingService.geocoding.geocode(addressToGeocode);
                    
                    if (!geocodeResult.success) {
                        // Handle out-of-service-area error
                        if (geocodeResult.error === 'out_of_service_area') {
                            return {
                                type: 'message',
                                content: geocodeResult.message,
                                showChooseOnMap: true
                            };
                        }
                        // Handle not-found error
                        if (geocodeResult.error === 'not_found') {
                            return {
                                type: 'message',
                                content: geocodeResult.message,
                                showChooseOnMap: true
                            };
                        }
                        // Handle other geocoding errors
                        return {
                            type: 'message',
                            content: geocodeResult.message || `Could not find "${addressToGeocode}". Please provide a specific address in Arlington, Texas.`,
                            showChooseOnMap: true
                        };
                    }
                    
                    // Use the validated location from geocoding
                    destination = geocodeResult.location;
                }
            }
            
            // Generate proposals with validated destination
            const proposals = await this.bookingService.generateProposals(
                origin,
                destination,
                datetime,
                passengers
            );
            
            // Store proposals for context
            this.currentProposals = proposals;
            this.currentState = STATES.PRESENTING_OPTIONS;
            
            return {
                type: 'proposals',
                content: message,
                proposals,
                chips: {
                    payment: this.bookingContext.paymentMethod,
                    datetime: datetime,
                    passengers: passengers
                }
            };
        } catch (error) {
            console.error('Error generating proposals:', error);
            
            // Check for service area errors
            if (error.message && error.message.includes('OUT_OF_SERVICE_AREA')) {
                const errorMsg = error.message.replace(/^(ORIGIN|DESTINATION)_OUT_OF_SERVICE_AREA:\s*/, '');
                return {
                    type: 'message',
                    content: errorMsg,
                    showChooseOnMap: true
                };
            }
            
            // Check for not found errors
            if (error.message && error.message.includes('NOT_FOUND')) {
                const errorMsg = error.message.replace(/^(ORIGIN|DESTINATION)_NOT_FOUND:\s*/, '');
                return {
                    type: 'message',
                    content: errorMsg,
                    showChooseOnMap: true
                };
            }
            
            return {
                type: 'message',
                content: "I'm having trouble finding rides right now. Please try again."
            };
        }
    }

    /**
     * Text-to-Speech using ElevenLabs API
     */
    speak(text, onEnd) {
        if (!CONFIG.features.textToSpeech) {
            if (onEnd) onEnd();
            return null;
        }

        // Stop any ongoing speech
        this.stopSpeaking();

        // Use ElevenLabs if enabled and API key is configured
        if (CONFIG.elevenLabs && CONFIG.elevenLabs.enabled && CONFIG.elevenLabs.apiKey) {
            this.speakWithElevenLabs(text, onEnd);
        } else {
            // Use Web Speech API (default)
            this.speakWithWebSpeech(text, onEnd);
        }
        
        return true;
    }

    /**
     * Speak using ElevenLabs API
     */
    async speakWithElevenLabs(text, onEnd) {
        try {
            const response = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${CONFIG.elevenLabs.voiceId}`,
                {
                    method: 'POST',
                    headers: {
                        'Accept': 'audio/mpeg',
                        'Content-Type': 'application/json',
                        'xi-api-key': CONFIG.elevenLabs.apiKey
                    },
                    body: JSON.stringify({
                        text: text,
                        model_id: CONFIG.elevenLabs.modelId || 'eleven_monolingual_v1',
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.75
                        }
                    })
                }
            );

            if (!response.ok) {
                console.error('ElevenLabs API error:', response.status);
                // Fallback to Web Speech API
                this.speakWithWebSpeech(text, onEnd);
                return;
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            
            this.currentAudio = new Audio(audioUrl);
            this.currentAudio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                this.currentAudio = null;
                if (onEnd) onEnd();
            };
            this.currentAudio.onerror = () => {
                URL.revokeObjectURL(audioUrl);
                this.currentAudio = null;
                console.error('Audio playback error');
                if (onEnd) onEnd();
            };
            
            this.currentAudio.play();
        } catch (error) {
            console.error('ElevenLabs TTS error:', error);
            // Fallback to Web Speech API
            this.speakWithWebSpeech(text, onEnd);
        }
    }

    /**
     * Fallback: Speak using Web Speech API
     */
    speakWithWebSpeech(text, onEnd) {
        if (!('speechSynthesis' in window)) {
            if (onEnd) onEnd();
            return;
        }

        this.ttsUtterance = new SpeechSynthesisUtterance(text);
        
        if (this.selectedVoice) {
            this.ttsUtterance.voice = this.selectedVoice;
        }
        
        this.ttsUtterance.rate = 0.95;
        this.ttsUtterance.pitch = 1.0;
        this.ttsUtterance.volume = 1.0;
        
        this.ttsUtterance.onend = () => {
            if (onEnd) onEnd();
        };

        window.speechSynthesis.speak(this.ttsUtterance);
    }

    /**
     * Stop speech
     */
    stopSpeaking() {
        // Stop ElevenLabs audio
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
        
        // Stop Web Speech API
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        this.ttsUtterance = null;
    }

    /**
     * Calculate TTS duration (estimated)
     */
    estimateTTSDuration(text) {
        const words = text.split(/\s+/).length;
        const minutes = words / CONFIG.timing.ttsWordsPerMinute;
        return Math.ceil(minutes * 60 * 1000); // Convert to milliseconds
    }

    /**
     * Find proposal by various criteria
     * @param {number|string} criteria - The selection criteria
     * @param {object} context - Additional context (etaMinutes, targetPrice, etc.)
     */
    findProposal(criteria, context = {}) {
        if (!this.currentProposals || this.currentProposals.length === 0) {
            return null;
        }
        
        // By index (1-based: "option 1", "option 2", "option 3")
        if (typeof criteria === 'number') {
            const index = criteria - 1; // Convert to 0-based
            return this.currentProposals[index] || null;
        }
        
        // By string criteria
        if (typeof criteria === 'string') {
            const lower = criteria.toLowerCase();
            
            // "first", "second", "third"
            const ordinals = { first: 0, second: 1, third: 2 };
            if (ordinals[lower] !== undefined) {
                return this.currentProposals[ordinals[lower]] || null;
            }
            
            // "fastest" - shortest duration
            if (lower === 'fastest' || lower === 'quickest') {
                return this.currentProposals.reduce((fastest, p) => 
                    p.duration < fastest.duration ? p : fastest
                );
            }
            
            // "cheapest" - lowest price (all same price currently, returns first)
            if (lower === 'cheapest') {
                return this.currentProposals.reduce((cheapest, p) => 
                    p.price < cheapest.price ? p : cheapest
                );
            }
            
            // "earliest" - earliest pickup time
            if (lower === 'earliest' || lower === 'soonest') {
                return this.currentProposals.reduce((earliest, p) => 
                    p.pickupTime < earliest.pickupTime ? p : earliest
                );
            }
            
            // "eta" - find by ETA minutes (closest match)
            if (lower === 'eta' && context.etaMinutes) {
                const targetMinutes = context.etaMinutes;
                const now = new Date();
                
                // Find proposal with closest ETA to target
                let closest = null;
                let smallestDiff = Infinity;
                
                this.currentProposals.forEach(p => {
                    const pickupTime = new Date(p.pickupTime);
                    const etaMinutes = Math.round((pickupTime - now) / 60000);
                    const diff = Math.abs(etaMinutes - targetMinutes);
                    
                    if (diff < smallestDiff) {
                        smallestDiff = diff;
                        closest = p;
                    }
                });
                
                // Only return if within 2 minutes tolerance
                if (closest && smallestDiff <= 2) {
                    console.log('[findProposal] Found ETA match, target:', targetMinutes, 'diff:', smallestDiff);
                    return closest;
                }
                
                // If no close match, still return the closest one
                console.log('[findProposal] No exact ETA match, returning closest:', smallestDiff, 'minutes off');
                return closest;
            }
            
            // "price" - find by price (closest match)
            if (lower === 'price' && context.targetPrice) {
                const targetPrice = context.targetPrice;
                
                // Find proposal with closest price
                let closest = null;
                let smallestDiff = Infinity;
                
                this.currentProposals.forEach(p => {
                    const diff = Math.abs(p.price - targetPrice);
                    if (diff < smallestDiff) {
                        smallestDiff = diff;
                        closest = p;
                    }
                });
                
                // Only return if within $1 tolerance
                if (closest && smallestDiff <= 1) {
                    console.log('[findProposal] Found price match, target:', targetPrice, 'diff:', smallestDiff);
                    return closest;
                }
                
                return null; // No close price match
            }
        }
        
        // By time match (e.g., "12:28")
        if (typeof criteria === 'string' && criteria.match(/\d{1,2}:\d{2}/)) {
            return this.currentProposals.find(p => {
                const time = this.bookingService.formatTime(p.arrivalTime);
                return time === criteria || this.bookingService.formatTime(p.pickupTime) === criteria;
            });
        }
        
        return null;
    }

    /**
     * Utility delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Reset conversation
     */
    reset() {
        this.conversationHistory = [];
        this.bookingContext = {
            origin: null,
            destination: null,
            datetime: 'now',
            passengers: 1,
            paymentMethod: CONFIG.mockData.paymentMethods[0]
        };
        this.currentState = STATES.INITIAL;
        this.currentProposals = null;
        this.selectedProposal = null;
        this.pendingQuestion = null;
        this.pendingDestination = null;
        this.pendingWalkingDirectionsOffer = false;
        this.pendingCancellationReason = false;
        this.pendingCancellationConfirmation = false;
        this.selectedCancellationReason = null;
        this.stopSpeaking();
    }

    /**
     * Handle user accepting walking directions
     */
    async handleWalkingDirectionsAccept() {
        return {
            type: 'walking_directions',
            action: 'show',
            content: "Let me get those walking directions for you."
        };
    }

    /**
     * Handle user declining walking directions
     */
    async handleWalkingDirectionsDecline() {
        return {
            type: 'message',
            content: "No problem! Your driver will be there soon. Have a great trip!"
        };
    }
}

// Export
window.AIAgent = AIAgent;
