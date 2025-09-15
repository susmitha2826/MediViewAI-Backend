import s3 from "../config/s3.js";
import fs from "fs";
import path from "path";
import Analysis from "../models/Analysis.js";
import { analyzeXray } from "../services/aiService.js";
import { generateSuggestion } from "../services/gptService.js";
import fetch from "node-fetch";
import OpenAI from "openai";


export const analyzeMedicalImages = async (req, res) => {
  try {
    const base64Images = req.body.images;
    if (!base64Images || !Array.isArray(base64Images) || base64Images.length === 0) {
      return res.status(400).json({ msg: "No images provided" });
    }

    // Helper function for analysis with retry
    const analyzeImage = async (base64Image, index, retryCount = 0) => {
      try {
        const response = await fetch("https://toolkit.rork.com/text/llm/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `
You are an expert senior radiologist and AI image analyzer with extensive experience in interpreting all types of medical imaging. Respond precisely, friendly, and reassuringly.

First, confirm if the image is medical (e.g., X-ray, MRI, CT, ultrasound, or medical report/lab document).
- If NOT medical (e.g., non-clinical photos), respond ONLY with "not medical".
- If medical, conduct a thorough analysis: Systematically review all visible elements—anatomy (body part, modality, view), alignments (e.g., Gilula arcs in wrist, collinear radius-lunate-capitate axis), bones (densities, fractures, lesions like sclerotic/lytic spots or bone islands/enostoses in precise locations such as sacral ala), joints (spaces, dislocations, migrations, angulations, rotations), soft tissues (swelling, calcifications, masses), and thoracic/abdominal structures (prioritize gas/air patterns like pneumoperitoneum/subdiaphragmatic free air, diaphragm contours such as continuous visibility vs. separate hemidiaphragms, lung fields, cardiac/mediastinal silhouettes). Always note focal, subtle, incidental, or expected abnormalities (e.g., small bone islands, pneumoperitoneum post-laparoscopy with continuous diaphragm visibility), even if the study appears otherwise normal, alongside major issues (e.g., volar lunate dislocation with palmar rotation). Avoid over-interpreting lung opacities (e.g., pneumonia) unless clearly visible; focus on relevant findings like gas or diaphragm changes in chest/abdominal images.

Output exactly **two sections** labeled as:

Doctor-Level Explanation: Detailed professional interpretation for experts. Include modality/view, anatomy, normal/abnormal findings (e.g., "pneumoperitoneum with continuous diaphragm visibility post-laparoscopy", "small sclerotic focus consistent with bone island in the superior aspect of the right sacral ala", or "volar dislocation of the lunate with 90-degree palmar rotation"), implications. Use formal terms in a flowing paragraph without any bold, markdown, or extra formatting.

Layman-Friendly Explanation: Simple rephrasing for non-experts—use analogies (e.g., "a small amount of air under the diaphragm like expected gas after surgery" for pneumoperitoneum, "a tiny harmless dense spot like a natural bone knot" for bone islands, or "the lunate bone has slipped forward like a dislocated joint" for dislocations), reassuring tone for benign/expected findings, explain implications without alarm but note if urgent, in a flowing paragraph without any bold, markdown, or extra formatting.

End with: "This is a computer-generated response and not a replacement for professional medical advice." No questions, suggestions, or extras.
                `
              },
              {
                role: "user",
                content: [
                  { type: "image", image: base64Image },
                  {
                    type: "text",
                    text: `
Analyze only if medical-related. If not, say "not medical".
If medical, provide full two-section analysis, prioritizing gas/air patterns (e.g., pneumoperitoneum, subdiaphragmatic free air), diaphragm contours, subtle/incidental findings (e.g., bone islands), major abnormalities (e.g., dislocations), alignments, soft tissues, and precise locations/laterality (patient's right = viewer's left in AP views). Avoid over-interpreting unrelated findings like lung opacities unless clear.
Complete response in one go, supportive language only. No questions or further steps.
                    `
                  }
                ]
              }
            ]//,
            // max_tokens: 800, // Uncomment if supported: Supports detailed gas/diaphragm descriptions
            // temperature: 0.5
          })
        });

        if (!response.ok) {
          console.error("Server returned error:", response.status, await response.text());
          return null;
        }

        const data = await response.json();
        const completion = data.completion.trim().toLowerCase();
        // console.log(`Raw analysis for image ${index + 1}:`, data.completion); // Debug log

        if (completion === "not medical" || completion.includes("not medical")) {
          return null;
        }

        // Enhanced validation: Log if key pathology terms are missing (for debugging)
        if (!data.completion.includes("bone island") && !data.completion.includes("dislocation") && !data.completion.includes("pneumoperitoneum") && !data.completion.includes("diaphragm")) {
          // console.warn(`Potential miss in image ${index + 1}: No key findings (e.g., pneumoperitoneum, bone island, dislocation) detected.`);
        }

        // Skip if response lacks sections or disclaimer
        if (!data.completion.includes("Doctor-Level Explanation") || !data.completion.includes("Layman-Friendly Explanation") || !data.completion.includes("This is a computer-generated response")) {
          return null;
        }

        return data.completion;
      } catch (err) {
        console.error(`Error analyzing page ${index + 1}:`, err);
        if (retryCount < 1) {
          // console.log(`Retrying analysis for image ${index + 1}`);
          return await analyzeImage(base64Image, index, retryCount + 1);
        }
        return null;
      }
    };

    // Step 1: Analyze all images in parallel
    const individualAnalyses = await Promise.all(
      base64Images.map((base64Image, index) => analyzeImage(base64Image, index))
    );

    const validAnalyses = individualAnalyses.filter(a => a !== null && a.trim() !== "");

    if (validAnalyses.length === 0) {
      return res.status(400).json({ msg: "⚠️ No medical images found in the upload. Please upload a valid medical report or scan." });
    }

    // Step 2: Handle single vs multiple images
    if (validAnalyses.length === 1) {
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

    // Multiple images, combine analyses into one final summary using refined prompt
    const combinedPrompt = `
You are an expert senior radiologist. Here are analyses from multiple images:

${validAnalyses.map((a, i) => `Image ${i + 1}: ${a}`).join("\n\n")}

Synthesize into exactly **two sections**, integrating gas/air patterns (e.g., pneumoperitoneum post-laparoscopy with diaphragm continuity), subtle/incidental details (e.g., bone islands in sacral ala), major abnormalities (e.g., volar lunate dislocation, Gilula arc disruption) with accurate laterality and locations:

Doctor-Level Explanation: Professional summary for experts—correlate findings across images, note all abnormalities (incidental, major, or expected like post-surgical gas), in a cohesive paragraph without bold, markdown, or extras.

Layman-Friendly Explanation: Friendly rephrasing—simple language, analogies, reassuring on benign/expected findings (e.g., harmless bone spots or post-surgery gas) but noting concerns, in a flowing paragraph without bold, markdown, or extras.

No intros/extras. End with: "This is a computer-generated response and not a replacement for professional medical advice." No questions or suggestions.
    `;

    const finalResponse = await fetch("https://toolkit.rork.com/text/llm/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `
You are an expert senior radiologist and AI analyzer, responding precisely and reassuringly.
            `
          },
          { role: "user", content: combinedPrompt }
        ]//,
        // max_tokens: 800,
        // temperature: 0.5
      })
    });

    if (!finalResponse.ok) {
      console.error("Final summary error:", finalResponse.status, await finalResponse.text());
      throw new Error("Failed to generate summary");
    }

    const finalData = await finalResponse.json();
    // console.log("Raw final summary:", finalData.completion); // Debug log

    const analysisRecord = new Analysis({
      userId: req?.user?.id,
      id: Date.now().toString(),
      // imageUrl: base64Images.map(img => `data:image/jpeg;base64,${img}`),
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
      // imageUrl: `data:image/jpeg;base64,${base64Image}`,
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

    console.log("Received file:", file ? file.originalname : "No file");
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

