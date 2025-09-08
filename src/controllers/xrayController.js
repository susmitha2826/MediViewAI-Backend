import s3 from "../config/s3.js";
import fs from "fs";
import path from "path";
import Analysis from "../models/Analysis.js";
import { analyzeXray } from "../services/aiService.js";
import { generateSuggestion } from "../services/gptService.js";
import fetch from "node-fetch";
import OpenAI from "openai";


// export const uploadXray = async (req, res) => {
//   try {
//     const userId = req.user._id;
//     const file = req.file;

//     // const uploadParams = {
//     //   Bucket: process.env.AWS_BUCKET_NAME,
//     //   Key: `xrays/${Date.now()}_${file.originalname}`,
//     //   Body: file.buffer,
//     //   ContentType: file.mimetype,
//     // };

//     // const s3Response = await s3.upload(uploadParams).promise();
//     // const imageUrl = s3Response.Location;

//     // ----------local folder storing-------------------
//     const uploadDir = path.join(process.cwd(), "uploads/xrays");
//     if (!fs.existsSync(uploadDir)) {
//       fs.mkdirSync(uploadDir, { recursive: true });
//     }

//     // Save file locally
//     const fileName = `${Date.now()}_${file.originalname}`;
//     const filePath = path.join(uploadDir, fileName);
//     fs.writeFileSync(filePath, file.buffer);

//     const imageUrl = `/uploads/xrays/${fileName}`; // relative path for frontend access



//     const rawResult = await analyzeXray(imageUrl);
//     const suggestions = await generateSuggestion(rawResult);

//     const newAnalysis = new Analysis({
//       userId,
//       imageUrl,
//       analysisResult: rawResult,
//       suggestions,
//     });
//     await newAnalysis.save();

//     res.json({ imageUrl, analysisResult: rawResult, suggestions });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ msg: "Failed to upload and analyze X-ray" });
//   }
// };



export const uploadXray = async (req, res) => {
  try {
    const userId = req.user._id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ msg: "No X-ray file uploaded" });
    }

    // ---------- Local folder storing -------------------
    const uploadDir = path.join(process.cwd(), "uploads/xrays");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Save file locally
    const fileName = `${Date.now()}_${file.originalname}`;
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    const imageUrl = `/uploads/xrays/${fileName}`; // relative path for frontend access

    // Analyze image using external microservice
    const rawResult = await analyzeXray(file);

    // Generate AI-based suggestions
    const suggestions = await generateSuggestion(rawResult);

    // Save to DB
    // const newAnalysis = new Analysis({
    //   userId,
    //   imageUrl,
    //   analysisResult: rawResult,
    //   suggestions,
    // });
    // await newAnalysis.save();

    res.json({ imageUrl, analysisResult: rawResult, suggestions });
  } catch (err) {
    console.error("UploadXray error:", err);
    res.status(500).json({ msg: "Failed to upload and analyze X-ray" });
  }
};

// export const analyzeXrayImage = async (req, res) => {
//   try {
//     const base64Image = req.body.image; // frontend sends raw base64 string
//     if (!base64Image) {
//       return res.status(400).json({ error: "No image provided" });
//     }

//     // call external LLM API
//     const response = await fetch("https://toolkit.rork.com/text/llm/", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         messages: [
//           { role: "system", content: "You are a medical AI assistant ..." },
//           {
//             role: "user",
//             content: [
//               { type: "text", text: "Please analyze this X-ray..." },
//               { type: "image", image: base64Image },
//             ],
//           },
//         ],
//       }),
//     });

//     const data = await response.json();

//     const analysis = new Analysis({
//       userId: req?.user?.id,
//       id: Date.now().toString(),
//       imageUrl: `data:image/jpeg;base64,${base64Image}`,
//       analysisResult: data.completion,
//       timestamp: new Date().toISOString(),
//     });

//     await analysis.save();

//     res.status(200).json({
//       status: "success",
//       message: "X-ray analysis completed",
//       data: data.completion,
//     });
//   } catch (error) {
//     console.error("Controller error:", error);
//     res.status(500).json({ error: "Failed to analyze image" });
//   }
// };



export const analyzeMedicalImages = async (req, res) => {
  try {
    const base64Images = req.body.images;
    if (!base64Images || !Array.isArray(base64Images) || base64Images.length === 0) {
      return res.status(400).json({ msg: "No images provided" });
    }

    // Step 1: Analyze all images in parallel using your existing prompt
    const individualAnalyses = await Promise.all(
      base64Images.map(async (base64Image, index) => {
        try {
          const response = await fetch("https://toolkit.rork.com/text/llm/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [
                {
                  role: "system",
                  content: `
    You are an expert senior medical assistant and AI image classifier with extensive medical experience, responding in a friendly and reassuring manner.

    First, check if this image is a medical image (X-ray, MRI, CT scan, ultrasound, or scanned medical report, typed or handwritten, lab reports, hospital reports).
    - If it is NOT a medical image (selfies, flowers, random pictures), respond only with "not medical".
    - If it IS a medical image, provide a full analysis.

    Your analysis should always include **two sections**:

    1. Doctor-Level Explanation: Provide a professional, detailed explanation suitable for a medical audience. Include the type of medical image, body part or area examined, main findings, and any technical interpretations. Write in clear, formal medical language, but avoid using bullet points or numbered lists—make it a natural, flowing paragraph.

    2. Layman-Friendly Explanation: Rewrite the same findings in a friendly, easy-to-understand way for a non-medical audience. Use simple language, analogies if helpful, and a reassuring tone. Make sure it is approachable and clear, so the user can easily grasp what the findings mean for them.

    Always end **last sections** with this exact reminder:
    "This is a computer-generated response and not a replacement for professional medical advice." and Do NOT ask any questions or suggest additional explanations. 
  `
                },

                {
                  role: "user",
                  content: [
                    { type: "image", image: base64Image },
                    {
                      type: "text",
                      text: `
                        Please analyze this medical image (X-ray, MRI, CT scan, or medical report) and if it is medical related only go head further otherwise no need.
                        Provide a full, friendly, easy-to-understand explanation. 
                        Give all sections completely in one response. 
                        Do NOT ask any questions or suggest additional explanations. 
                        Use plain, everyday language, be supportive and reassuring, and remind the user this is educational only.
                      `
                    }
                  ]
                }
              ]
            })
          });

          if (!response.ok) {
            console.error("Server returned error:", response.status, await response.text());
            return null;
          }

          const data = await response.json();

          if (data.completion.toLowerCase().includes("not medical")) {
            return null; // skip non-medical images
          }

          return data.completion;
        } catch (err) {
          console.error(`Error analyzing page ${index + 1}:`, err);
          return null;
        }
      })
    );

    const validAnalyses = individualAnalyses.filter(a => a !== null);

    if (validAnalyses.length === 0) {
      return res.status(400).json({ msg: "⚠️ No medical images found in the upload. Please upload a valid medical report or scan." });
    }

    // Step 2: Handle single vs multiple images
    if (validAnalyses.length === 1) {
      // Only one medical image, return its analysis directly
      const analysisRecord = new Analysis({
        userId: req?.user?.id,
        id: Date.now().toString(),
        imageUrl: `data:image/jpeg;base64,${base64Images[0]}`,
        analysisResult: validAnalyses[0],
        timestamp: new Date().toISOString(),
      });
      await analysisRecord.save();

      return res.status(200).json({
        status: "success",
        message: "Medical image analysis completed",
        data: validAnalyses[0],
      });
    }

    // Multiple images, combine analyses into one final summary using your prompt style
    const combinedPrompt = `
You are an expert senior medical assistant. Here are analyses of multiple images:

${validAnalyses.map((a, i) => `Image ${i + 1}: ${a}`).join("\n\n")}

Summarize all findings strictly in **two sections only**:

1. Doctor-Level Explanation: detailed, professional explanation suitable for medical audience.
2. Layman-Friendly Explanation: clear, friendly, and easy-to-understand for non-medical users.

Do NOT add any introductory sentences like "Here’s a summary" or anything else. 
End the reponse with this exact reminder:
"This is a computer-generated response and not a replacement for professional medical advice."

Do not ask questions or suggest further explanations.
Use a natural, flowing paragraph style; no bullet points or numbering inside the sections themselves.
`;

    const finalResponse = await fetch("https://toolkit.rork.com/text/llm/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `
              You are an expert senior medical assistant and AI image classifier with extensive medical experience, responding in a friendly and reassuring manner.
            `
          },
          { role: "user", content: combinedPrompt }
        ]
      })
    });

    const finalData = await finalResponse.json();

    // Step 3: Save combined analysis in DB
    const analysisRecord = new Analysis({
      userId: req?.user?.id,
      id: Date.now().toString(),
      imageUrl: base64Images.map(img => `data:image/jpeg;base64,${img}`),
      analysisResult: finalData.completion,
      timestamp: new Date().toISOString(),
    });
    await analysisRecord.save();

    res.status(200).json({
      status: "success",
      message: "Medical image analysis completed",
      data: finalData.completion,
    });

  } catch (err) {
    console.error("AnalyzeMedicalImages error:", err);
    res.status(500).json({ msg: "Failed to analyze images" });
  }
};


export const analyzeXrayImage = async (req, res) => {
  try {
    const base64Image = req.body.image;
    if (!base64Image) {
      return res.status(400).json({ error: "No image provided" });
    }

    // --- Step 1: Validate image type ---
    const isMedical = await checkIfMedicalImage(base64Image); // implement this
    if (!isMedical) {
      return res.status(400).json({
        status: "error",
        message: "This does not appear to be a medical scan or report. Please upload a valid X-ray, MRI, CT, ultrasound, or scanned medical report."
      });
    }

    const response = await fetch("https://toolkit.rork.com/text/llm/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `
        You are an experienced doctor with years of practical medical knowledge. Analyze X-rays, MRIs, CT scans, ultrasounds, and scanned medical reports (typed or handwritten). Explain everything in plain language, step by step.  
        Do NOT analyze non-medical images such as selfies, flowers, or random pictures.

        Your goal is to explain medical images and reports in a friendly, simple, and easy-to-understand way, as if talking to a close friend or family member. 
        Always provide a complete step-by-step analysis, covering:
          1. Type of medical image
          2. Body part or area examined
          3. Main findings
          4. Explanation
          5. Reassuring information
          6. Important reminders or next steps
        Do NOT ask any questions or suggest additional explanations. 
        The response should be complete on its own and include all necessary information.
        Always remind the user that this is educational information only and not a substitute for professional medical advice. Advise consulting a qualified healthcare professional when needed.
      `
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `
            Please analyze this medical image (X-ray, MRI, CT scan, or medical report) and provide a full, friendly, easy-to-understand explanation. 
            Give all sections completely in one response. 
            Do NOT ask any questions or suggest additional explanations. 
            Use plain, everyday language, be supportive and reassuring, and remind the user this is educational only.
          `
              },
              { type: "image", image: base64Image }
            ]
          }
        ]
      })




    });

    const data = await response.json();
    const analysis = new Analysis({
      userId: req?.user?.id,
      id: Date.now().toString(),
      imageUrl: `data:image/jpeg;base64,${base64Image}`,
      analysisResult: data.completion,
      timestamp: new Date().toISOString(),
    });

    await analysis.save();

    res.status(200).json({
      status: "success",
      message: "X-ray analysis completed",
      data: data.completion,
    });
  } catch (error) {
    console.error("Controller error:", error);
    res.status(500).json({ error: "Failed to analyze image" });
  }
};


export const translate = async (req, res) => {
  try {
    const { text, languageName } = req.body;

    if (!text || !languageName) {
      return res.status(400).json({ error: "text and languageName are required" });
    }
    const response = await fetch('https://toolkit.rork.com/text/llm/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are a professional medical translator. Translate the following medical analysis text to ${languageName}. Maintain the medical accuracy and friendly, reassuring tone. Keep the same structure and formatting. Only return the translated text, nothing else.`
          },
          {
            role: 'user',
            content: text
          }
        ]
      }),
    });

    if (!response.ok) {
      throw new Error('Translation failed');
    }
    const data = await response.json();
    const translatedText = data.completion;

    res.status(200).json({
      status: "success",
      message: "X-ray analysis completed",
      data: translatedText,
    });
  } catch (err) {
    console.error("Translation API error:", err.response?.data || err.message);
    res.status(500).json({ error: "Translation failed" });
  }
};


// backend/controllers/ttsController.js


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // set in .env
});

// Generate speech and return an audio file URL
export const generateSpeech = async (req, res) => {
  try {
    const { text, lang } = req.body;
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }

    const voice = "alloy";

    const speechResponse = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
    });

    // Convert to buffer
    const buffer = Buffer.from(await speechResponse.arrayBuffer());

    // Send as base64 so frontend can play
    res.json({
      audioBase64: buffer.toString("base64"),
      mimeType: "audio/mpeg",
    });
  } catch (err) {
    console.error("❌ TTS error:", err);
    res.status(500).json({ error: "TTS generation failed" });
  }
};

