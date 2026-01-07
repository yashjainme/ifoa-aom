/**
 * Test the Gemini API with the official SDK
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';

config();

async function testGemini() {
    const apiKey = process.env.LLM_API_KEY;

    if (!apiKey) {
        console.error('❌ LLM_API_KEY not set!');
        console.log('Add LLM_API_KEY=your-key to your .env file');
        console.log('Get key from: https://aistudio.google.com/app/apikey');
        return;
    }

    console.log('🔑 API Key:', apiKey.substring(0, 15) + '...');

    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'    ];

    for (const modelName of modelsToTry) {
        console.log(`\n📍 Testing: ${modelName}`);

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent('Say "Hello, the API works!" in exactly 5 words.');
            const text = result.response.text();

            console.log(`   ✅ SUCCESS!`);
            console.log(`   📝 Response: ${text}`);
            console.log(`\n🎉 Working model: ${modelName}`);
            console.log(`Add to .env: LLM_MODEL=${modelName}`);
            return;
        } catch (err) {
            const error = err as Error;
            console.log(`   ❌ Failed: ${error.message}`);
        }
    }

    console.log('\n❌ No models worked. Check your API key.');
}

testGemini();
