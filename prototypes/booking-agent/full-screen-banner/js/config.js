/**
 * Configuration
 * Via Transportation - Rider Agent
 */

const CONFIG = {
    // AI Mode: 'simulated' or 'real'
    aiMode: 'simulated',
    
    // Gemini API Configuration
    gemini: {
        apiKey: null, // Will be loaded from config.local.js or environment
        model: 'gemini-1.5-flash',
        temperature: 0.7,
        maxTokens: 2048
    },
    
    // ElevenLabs TTS Configuration
    elevenLabs: {
        enabled: false, // Default to browser TTS to save credits
        apiKey: null, // Set in config.local.js
        voiceId: 'XrExE9yKIg1WjnnlVkGX', // "Matilda" - Knowledgeable, Professional (female, American)
        modelId: 'eleven_turbo_v2_5', // Free tier compatible model
        // Alternative voices:
        // 'EXAVITQu4vr4xnSDxMaL' - Bella (young female)
        // '21m00Tcm4TlvDq8ikWAM' - Rachel (warm female)
        // 'AZnzlk1XvdvUeBnXmlld' - Domi (young female)
        // 'pNInz6obpgDQGcFmaJgB' - Adam (friendly male)
    },
    
    // Google Maps API Key (restricted to allowed domains — safe to commit)
    googleMapsApiKey: 'AIzaSyB4tcy8-euhsOMVdEzvHT34LqeWqfnE0uY',
    
    // Service Area Configuration
    serviceArea: {
        city: 'Arlington',
        state: 'Texas',
        // Arlington, TX approximate bounds
        bounds: {
            north: 32.8088,
            south: 32.6350,
            east: -97.0100,
            west: -97.1800
        },
        centerPoint: {
            lat: 32.7357,
            lng: -97.1081
        }
    },
    
    // Mock Data
    mockData: {
        currentLocation: {
            name: 'Current location',
            address: '1104 W Inwood Dr, Arlington, Texas',
            lat: 32.7200,
            lng: -97.1200
        },
        savedPlaces: {
            home: {
                name: 'Home',
                address: '1104 W Inwood Dr, Arlington, TX',
                lat: 32.7200,
                lng: -97.1200
            },
            work: {
                name: 'Work',
                address: '700 Highlander Blvd, Arlington, TX',
                lat: 32.7555,
                lng: -97.0803
            },
            stadium: {
                name: 'AT&T Stadium',
                address: '1 AT&T Way, Arlington, TX',
                lat: 32.7473,
                lng: -97.0945
            }
        },
        paymentMethods: [
            { id: 'mastercard-1234', type: 'mastercard', last4: '1234', icon: '<img src="assets/payment_method.svg" class="icon-img" alt="Payment">' },
            { id: 'visa-4671', type: 'visa', last4: '4671', icon: '<img src="assets/payment_method.svg" class="icon-img" alt="Payment">' },
            { id: 'ride-credit', type: 'ride-credit', name: 'Ride Credit', balance: 12.45, icon: '<img src="assets/payment_method.svg" class="icon-img" alt="Payment">' }
        ],
        drivers: [
            {
                id: 'driver-1',
                name: 'Justin R.',
                rating: '4.9',
                vehicle: 'Mercedes van',
                vehicleNo: '180',
                plate: '#BJW1242',
                photo: '👨‍✈️'
            },
            {
                id: 'driver-2',
                name: 'Maria S.',
                rating: '5.0',
                vehicle: 'Toyota Camry',
                vehicleNo: '142',
                plate: '#ABC1234',
                photo: '👩‍✈️'
            }
        ]
    },
    
    // Timing Configuration (in milliseconds)
    timing: {
        aiThinkingDelay: 1000,
        proposalGenerationDelay: 1500,
        bookingConfirmationDelay: 2000,
        driverMatchDelay: 3000,
        statusUpdateInterval: 1000,
        ttsWordsPerMinute: 140 // For calculating TTS duration
    },
    
    // Fixed Pricing
    pricing: {
        basePrice: 2.00,
        currency: '$'
    },
    
    // Cancellation Reasons (matching Figma design)
    cancellationReasons: [
        { id: 'pickup_far', label: 'Pickup point is too far', keywords: ['pickup', 'far', 'too far', 'distance', 'walk'] },
        { id: 'update_details', label: 'I Need to update ride details', keywords: ['update', 'change', 'modify', 'details', 'edit'] },
        { id: 'change_plans', label: 'Change in plans', keywords: ['changed', 'plans', 'change of plans', 'different plans'] },
        { id: 'cant_find_driver', label: "Can't find my driver", keywords: ['find', 'driver', 'where', 'lost', 'locate'] },
        { id: 'booked_mistake', label: 'Booked a ride by mistake.', keywords: ['mistake', 'accident', 'accidentally', 'wrong', 'error'] },
        { id: 'other', label: 'Other', keywords: ['other', 'something else', 'different reason'] }
    ],
    
    // Service Hours Configuration
    serviceHours: {
        regular: {
            monday: { open: '07:30', close: '18:30', label: 'Monday' },
            tuesday: { open: '07:30', close: '18:30', label: 'Tuesday' },
            wednesday: { open: '07:30', close: '18:30', label: 'Wednesday' },
            thursday: { open: '07:30', close: '18:30', label: 'Thursday' },
            friday: { open: '07:30', close: '18:30', label: 'Friday' },
            saturday: { open: null, close: null, label: 'Saturday', closed: true },
            sunday: { open: null, close: null, label: 'Sunday', closed: true }
        },
        specialDates: [
            { date: '2026-01-01', name: "New Year's Day", open: null, close: null, closed: true },
            { date: '2026-01-20', name: 'Martin Luther King Jr. Day', open: null, close: null, closed: true },
            { date: '2026-02-17', name: "Presidents' Day", open: null, close: null, closed: true },
            { date: '2026-05-25', name: 'Memorial Day', open: null, close: null, closed: true },
            { date: '2026-07-04', name: 'Independence Day', open: null, close: null, closed: true },
            { date: '2026-09-07', name: 'Labor Day', open: null, close: null, closed: true },
            { date: '2026-11-26', name: 'Thanksgiving Day', open: null, close: null, closed: true },
            { date: '2026-11-27', name: 'Day After Thanksgiving', open: '09:00', close: '15:00', modified: true },
            { date: '2026-12-24', name: 'Christmas Eve', open: '07:30', close: '14:00', modified: true },
            { date: '2026-12-25', name: 'Christmas Day', open: null, close: null, closed: true },
            { date: '2026-12-31', name: "New Year's Eve", open: '07:30', close: '16:00', modified: true }
        ]
    },
    
    // Feature Flags
    features: {
        voiceInput: true,
        textToSpeech: true,
        autoScrollCarousel: true,
        googleMaps: true // Google Maps enabled
    }
};

// Export for use in other modules
window.CONFIG = CONFIG;
