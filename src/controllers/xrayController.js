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


export const analyzeXrayImage = async (req, res) => {
  try {
    const base64Image = req.body.image;
    if (!base64Image) {
      return res.status(400).json({ error: "No image provided" });
    }

    const response = await fetch("https://toolkit.rork.com/text/llm/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `
                You are an AI assistant that analyzes medical images and reports (X-rays, MRIs, CT scans, lab reports, or clinical notes). 
                Your job is to carefully observe and explain what is seen. Follow these rules:

                1. Always describe any important findings clearly (e.g., fractures, fluid, swelling, abnormal growths). Do not avoid stating them.
                2. Explain everything in simple, everyday language that a friend would use. 
                  Example: instead of "pulmonary edema," say "extra water in the lungs that makes breathing harder."
                3. Keep the explanation supportive and reassuring, but don’t hide possible concerns.
                4. Do not use headings, bullet points, or bold text. Just write one clear, friendly paragraph.
                5. End every response with this disclaimer: \n
                
                  "⚠️ This is a computer-generated analysis. Please consult a qualified doctor for full details."
                `
          },

          {
            role: "user",
            content: [
              { type: "text", text: "Please analyze this X-ray and explain in simple words what it shows. To Help Users To UnderStand there Medical Reports (xray, mri , ct, medical reports" },
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

    // Pick a voice (OpenAI has voices: alloy, verse, shimmer, etc.)
    const voice = "alloy";

    const speechResponse = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
    });
    // Convert to buffer
    const buffer = Buffer.from(await speechResponse.arrayBuffer());

    // Ensure directories exist
    const ttsDir = path.join(process.cwd(), "public", "tts");
    if (!fs.existsSync(ttsDir)) {
      fs.mkdirSync(ttsDir, { recursive: true });
    }

    // Save file
    const filename = `tts_${Date.now()}.mp3`;
    const filePath = path.join(ttsDir, filename);
    fs.writeFileSync(filePath, buffer);

    // Return URL
    // res.json({ audioUrl: `/tts/${filename}` });

    // do this:
const fullUrl = `${req.protocol}://${req.get("host")}/tts/${filename}`;
res.json({ audioUrl: fullUrl });
  } catch (err) {
    console.error("❌ TTS error:", err);
    res.status(500).json({ error: "TTS generation failed" });
  }
};
