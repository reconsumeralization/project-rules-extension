#!/usr/bin/env node

/**
 * Test script for Gemini API
 * 
 * This script performs a simple test to verify that the Gemini API key is valid
 * and can communicate with the Google Generative AI service.
 */

// Try to load .env file if it exists
try {
  require('dotenv').config();
} catch (error) {
  // dotenv module might not be installed, ignore this error
}

const { GoogleGenerativeAI } = require("@google/generative-ai");

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

// Log first few characters of API key for verification (never log entire API keys)
console.log(`Using API key starting with: ${apiKey.substring(0, 4)}...`);

async function testGeminiAPI() {
  try {
    console.log('Initializing Gemini API client...');

    // Initialize the API client
    const genAI = new GoogleGenerativeAI(apiKey);

    // Try to get the available models
    console.log('Testing connection to Gemini API...');

    // Try with a smaller, more commonly available model
    const model = genAI.getGenerativeModel({
      model: "gemini-1.0-pro" // Try with an older model that might have fewer restrictions
    });

    // Send a simple test prompt
    const result = await model.generateContent("Respond with only the word 'success' if you can read this message.");

    // Get the response text
    const response = result.response.text().trim();

    // Check if response contains "success"
    if (response.toLowerCase().includes('success')) {
      console.log('\n✅ API TEST SUCCESSFUL!');
      console.log('The Gemini API connection is working correctly.');
    } else {
      console.log('\n⚠️ API returned unexpected response:');
      console.log(response);
      console.log('\nThe API key appears valid but the response was not as expected.');
    }

  } catch (error) {
    console.error('\n❌ API TEST FAILED!');
    console.error('Error details:', error.message);

    // Check for common error patterns
    if (error.message.includes('API_KEY_INVALID')) {
      console.error('\nYour API key appears to be invalid. Please check the key and try again.');
    } else if (error.message.includes('PERMISSION_DENIED')) {
      console.error('\nPermission denied. Your API key may not have access to the requested model.');
    } else if (error.message.includes('RESOURCE_EXHAUSTED')) {
      console.error('\nYou have exceeded your quota or rate limit. Please check your API usage.');
    } else if (error.message.includes('RATE_LIMIT_EXCEEDED')) {
      console.error('\nRate limit exceeded. You may need to:');
      console.error('1. Wait a few minutes before trying again');
      console.error('2. Request an increased quota at https://cloud.google.com/docs/quotas/help/request_increase');
      console.error('3. Create a new API key with the Google AI Studio');
    }

    process.exit(1);
  }
}

// Run the test
console.log('Starting Gemini API test...');
testGeminiAPI(); 