import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const generateSuggestion = async (analysisResult) => {
  // console.log(process.env.OPENAI_API_KEY,"jjj")
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a helpful medical assistant.",
      },
      {
        role: "user",
        content: `Summarize the following X-ray analysis in patient-friendly language:\n${JSON.stringify(analysisResult)}`,
      },
    ],
  });

  return response.choices[0].message.content;
};
