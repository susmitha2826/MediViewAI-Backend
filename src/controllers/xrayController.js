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



export const analyzeMedicalImage = async (req, res) => {
  try {
    const base64Image = req.body.image;
    if (!base64Image) {
      return res.status(400).json({ msg: "No image provided" });
    }

    const response = await fetch("https://toolkit.rork.com/text/llm/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
{
  role: "system",
  content: `
    You are an expert senior medical assistant and AI image classifier with extensive medical experience, responding in a friendly and reassuring manner.

    First, check if this image is a medical image (X-ray, MRI, CT scan, ultrasound, or scanned medical report, typed or handwritten).
    - If it is NOT a medical image (selfies, flowers, random pictures), respond only with "not medical".
    - If it IS a medical image, provide a full analysis in plain, friendly language.

    Your analysis should always follow this structure internally:
      • Type of medical image  
      • Body part or area examined  
      • Main findings  
      • Explanation  
      • Reassurance  
      • Important reminders or next steps  

    BUT — do not use numbered lists, bullet points, or section headings.  
    Instead, weave these elements into a natural, flowing paragraph that feels conversational, clear, and reassuring.  

    Always end with this exact reminder:  
    "This is a computer-generated response and not a replacement for professional medical advice."
  `
},

          {
            role: "user",
            content: [
              { type: "image", image: base64Image },
              {
                type: "text",
                text: `
            Please analyze this medical image (X-ray, MRI, CT scan, or medical report) and if it is medical related only go head furthur otherwise no need.
            provide a full, friendly, easy-to-understand explanation. 
            Give all sections completely in one response. 
            Do NOT ask any questions or suggest additional explanations. 
            Use plain, everyday language, be supportive and reassuring, and remind the user this is educational only.
          `
              },
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (data.completion.toLowerCase().includes("not medical")) {
      return res.status(400).json({ msg: "This does not appear to be a medical scan or report." });
    }

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
  } catch (err) {
    if (err.message.includes("payload")) {
      return res.status(413).json({ msg: "Image too large for analysis. Try a smaller image." });
    }
    console.error("AnalyzeMedicalImage error:", err);
    res.status(500).json({ msg: "Failed to analyze image" });
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

