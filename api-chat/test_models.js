import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI("AIzaSyBLSY3-OFt045Rq2_JXf7zKwQ5B3My7mzM");

async function listModels() {
  try {
    console.log("Testing Gemini API...");
    const models = await genAI.listModels();
    console.log("\nAvailable models:");
    for (const model of models) {
      console.log(`- ${model.name}`);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

listModels();
