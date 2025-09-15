import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const generateSuggestion = async (analysisResult) => {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are an expert medical assistant. Provide accurate, detailed medical analysis."
      },
      {
        role: "user",
        content: `Given the following X-ray analysis data, generate a structured response with two sections:

1. Doctor-Level Explanation: A professional, detailed, medical description suitable for doctors. Include all findings, abnormalities, and technical observations. Write in clear, formal medical language as a natural paragraph.

2. Layman-Friendly Explanation: A simple explanation suitable for patients, describing the same findings in plain language without medical jargon.

Use a consistent format with section titles exactly as shown (Doctor-Level Explanation, Layman-Friendly Explanation). Do not omit any important details. Here is the analysis data:\n${JSON.stringify(analysisResult)}`
      }
    ],
  });

  return response.choices[0].message.content;
};

