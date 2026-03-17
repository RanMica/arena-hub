/**
 * Local Configuration (EXAMPLE)
 * Copy this file to config.local.js and add your API keys
 * 
 * IMPORTANT: config.local.js is gitignored - never commit API keys!
 */

// Override config with your API keys
if (typeof CONFIG !== 'undefined') {
    CONFIG.gemini.apiKey = 'YOUR_GEMINI_API_KEY_HERE';
    
    // Optionally set to 'real' to use Gemini API
    // CONFIG.aiMode = 'real';
}
