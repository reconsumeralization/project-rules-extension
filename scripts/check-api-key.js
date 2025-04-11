#!/usr/bin/env node

/**
 * Simple API Key Format Checker
 * 
 * This script checks if your GEMINI_API_KEY is properly formatted and 
 * attempts a basic connectivity test without making full model requests.
 */

// Try to load .env file if it exists
try {
    require('dotenv').config();
} catch (error) {
    // dotenv module might not be installed
}

// Get the API key from environment variable
const apiKey = process.env.GEMINI_API_KEY;

// Check if API key is set
if (!apiKey) {
    console.error('Error: GEMINI_API_KEY environment variable is not set');
    console.error('Please set your API key with:');
    console.error('  $env:GEMINI_API_KEY="your_actual_api_key_here" (PowerShell)');
    console.error('  export GEMINI_API_KEY=your_actual_api_key_here (Bash/Linux)');
    console.error('  or create a .env file with GEMINI_API_KEY=your_api_key_here');
    process.exit(1);
}

// Check API key format
if (!apiKey.startsWith('AIza')) {
    console.error('Error: API key does not start with "AIza"');
    console.error('Gemini API keys should start with "AIza". Please check your key.');
    process.exit(1);
}

// Simple format check passed
console.log(`✅ API key format check passed. Key starts with: ${apiKey.substring(0, 4)}...`);
console.log(`   Key length: ${apiKey.length} characters`);
console.log('');

// Check if we can load the generative AI library
try {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    console.log('✅ @google/generative-ai package loaded successfully');

    // Initialize the client (this doesn't make any API calls yet)
    const genAI = new GoogleGenerativeAI(apiKey);
    console.log('✅ GoogleGenerativeAI client initialized');

    console.log('\nThe API key appears to be correctly formatted and the client has been initialized.');
    console.log('However, we can only verify if the key is valid and has appropriate quotas by making an actual API call.');
    console.log('\nIf you are experiencing quota or rate limit issues (error 429), you can:');
    console.log('1. Wait a few minutes before trying again');
    console.log('2. Request an increased quota at https://cloud.google.com/docs/quotas/help/request_increase');
    console.log('3. Create a new API key with the Google AI Studio (https://ai.google.dev/)');
    console.log('\nIf you continue to encounter issues, check your Google Cloud Console to verify:');
    console.log('- The API key is active and has the necessary permissions');
    console.log('- The "Generative Language API" is enabled for your project');
    console.log('- You have set up billing if required for your usage level');
} catch (error) {
    console.error('❌ Error initializing the Google Generative AI client:', error.message);
    process.exit(1);
} 