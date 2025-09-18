import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const generateSuggestion = async (analysisResult) => {
  // Step 1: Define probability threshold
  const threshold = 0.6;

  // Step 2: Define clinically relevant features for general CXR + orthopedic/foreign body focus
  const clinicallyRelevant = [
    "Consolidation",
    "Atelectasis",
    "Infiltration",
    "Pneumonia",
    "Effusion",
    "Lung Opacity",
    "Fracture",
    // "Implant",       // new
    // "Foreign Body"   // new
  ];

  // Step 3: Filter analysis results
  const relevantFindings = {};
  for (const [key, value] of Object.entries(analysisResult.probabilities)) {
    if (value >= threshold && clinicallyRelevant.includes(key)) {
      relevantFindings[key] = value;
    }
  }

  // Step 4: Build prompt for LLM
  const prompt = `
      Given the following filtered X-ray analysis data, generate a structured response with two sections:

      1. Doctor-Level Explanation: Provide a professional, detailed medical description suitable for doctors. Include all findings, abnormalities, implants, fractures, foreign bodies, and technical observations. Write in clear, formal medical language as a natural paragraph.

      2. Layman-Friendly Explanation: Provide a simple explanation suitable for patients, describing the same findings in plain language without medical jargon.

      Only include findings present in the filtered data. Do not add unrelated abnormalities. Use the following filtered analysis data:
      ${JSON.stringify(relevantFindings, null, 2)}
      `;

  // Step 5: Call OpenAI to generate explanations
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are an expert medical assistant. Provide accurate, detailed medical analysis."
      },
      {
        role: "user",
        content: prompt
      }
    ],
  });

  // Step 6: Return structured explanation
  return response.choices[0].message.content;
};



