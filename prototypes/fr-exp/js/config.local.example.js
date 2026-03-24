/**
 * Local Configuration (EXAMPLE)
 * Copy this file to config.local.js and fill in your API keys.
 *
 * IMPORTANT: config.local.js is gitignored — never commit real API keys!
 */

if (typeof CONFIG !== 'undefined') {
    // Gemini API key — get one at https://aistudio.google.com/app/apikey
    CONFIG.gemini.apiKey = 'YOUR_GEMINI_API_KEY_HERE';

    // Set to 'real' to use the live Gemini API instead of simulated responses
    // CONFIG.aiMode = 'real';

    // Google Maps API key — get one at https://console.cloud.google.com
    CONFIG.googleMapsApiKey = 'YOUR_GOOGLE_MAPS_API_KEY_HERE';

    // ElevenLabs API key — get one at https://elevenlabs.io
    // Only needed if you want real text-to-speech (elevenLabs.enabled = true)
    CONFIG.elevenLabs.apiKey = 'YOUR_ELEVENLABS_API_KEY_HERE';
}
