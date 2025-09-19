import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const generateSuggestion = async (analysisResults) => {
  const threshold = 0.6;

  // Step 1: Combine all results, keeping the maximum probability per finding
  const combinedFindings = {};
  for (const result of analysisResults) {
    if (!result || typeof result !== "object") continue;

    for (const [key, value] of Object.entries(result)) {
      if (!(key in combinedFindings) || value > combinedFindings[key]) {
        combinedFindings[key] = value;
      }
    }
  }

  // Step 2: Apply threshold filter
  const relevantFindings = {};
  for (const [key, value] of Object.entries(combinedFindings)) {
    if (value >= threshold) relevantFindings[key] = value;
  }

  // Step 3: Build strict prompt
  const prompt = `
You are a medical AI assistant. Analyze the following chest X-ray abnormalities (filtered above threshold):

${JSON.stringify(relevantFindings, null, 2)}

Output exactly two sections:

**Doctor-Level Explanation**: Professional paragraph describing modality, orientation, primary and secondary implants, fractures, foreign bodies, bones, soft tissues, thoracic/abdominal structures, and any subtle/incidental findings. Include any uncertainties. Use formal flowing medical terminology.  

**Layman-Friendly Explanation**: One paragraph for patients explaining the same findings in simple language, using analogies for devices, fractures, or foreign bodies. Reassure for benign or expected findings, highlight urgent issues clearly, and note incidental or secondary devices and subtle changes in non-alarming terms.  

End with this disclaimer exactly:  
"This is a computer-generated response and not a replacement for professional medical advice."
`;

  // Step 4: Call LLM
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an expert radiologist assistant." },
      { role: "user", content: prompt },
    ],
  });

  return response.choices[0].message.content;
};



