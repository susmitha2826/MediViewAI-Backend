import s3 from "../config/s3.js";
import fs from "fs";
import path from "path";
import Analysis from "../models/Analysis.js";
import { analyzeXray, analyzeXray_cxr } from "../services/aiService.js";
import { generateSuggestion } from "../services/gptService.js";
import fetch from "node-fetch";
import OpenAI from "openai";
import Tesseract from "tesseract.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


// 🟢 OCR function to detect R/L marker in the X-ray
async function detectOrientationMarker(base64Image) {
  try {
    const buffer = Buffer.from(base64Image, "base64");

    const { data: { text } } = await Tesseract.recognize(buffer, "eng", {
      tessedit_char_whitelist: "RL"
    });

    if (text.includes("R")) return "R";
    if (text.includes("L")) return "L";
    return "UNKNOWN";
  } catch (err) {
    console.error("OCR error:", err);
    return "UNKNOWN";
  }
}

export const testanalysis = async (req, res) => {
  try {
    const base64Images = req.body.images;

    if (!base64Images || !Array.isArray(base64Images) || base64Images.length === 0) {
      return res.status(400).json({ msg: "No images provided" });
    }

    const analysisResults = [];

    for (let i = 0; i < base64Images.length; i++) {
      const imageBase64 = base64Images[i];

      try {
        // 🟢 Step 1: Detect R/L marker before GPT analysis
        const marker = await detectOrientationMarker(imageBase64);
        console.log(`Image ${i + 1} marker detected:`, marker);

        // 🟢 Step 2: Send image + orientation marker info to GPT
        const openAIResp = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are an expert senior medical assistant and AI image classifier with extensive medical experience, responding json in a friendly and reassuring manner.

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
  ` },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: ` Please analyze this medical image (X-ray, MRI, CT scan, or medical report) and if it is medical related only go head furthur otherwise no need.
            provide a full, friendly, easy-to-understand explanation. 
            Give all sections completely in one response. 
            Do NOT ask any questions or suggest additional explanations. 
            Use plain, everyday language, be supportive and reassuring, and remind the user this is educational only.
          `
                },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
                }
              ]
            }
          ],

          response_format: { type: "json_object" }
          // max_tokens: 4000,
          // temperature: 0.05
        });

        // 🟢 Step 3: Parse GPT response safely
        let analysisContent;
        try {
          analysisContent = JSON.parse(openAIResp.choices[0].message.content);
        } catch (parseErr) {
          console.error("JSON parse error:", parseErr);
          analysisContent = {};
        }
        console.log("Raw Result:", analysisContent)
        const structuredAnalysis = {
          imageIndex: i + 1,
          orientationMarker: marker,
          medicalDisclaimer: "🔴 CRITICAL DISCLAIMER: Orientation markers (R/L) are critical. If none detected, orientation is uncertain. This AI analysis has accuracy limitations and is NOT a substitute for professional medical diagnosis.",
          timestamp: new Date().toISOString(),
          analysis: {
            professionalExplanation: analysisContent.professionalExplanation || "Unable to generate professional analysis.",
            laymanExplanation: analysisContent.laymanExplanation || "Unable to generate layman analysis.",
            confidenceLevel: analysisContent.confidenceLevel || "medium"
          }
        };

        analysisResults.push(structuredAnalysis);

      } catch (imageError) {
        console.error(`Error analyzing image ${i + 1}:`, imageError);
        analysisResults.push({
          imageIndex: i + 1,
          error: "Failed to analyze this image",
          details: imageError.message
        });
      }
    }

    // 🟢 Step 4: Return full result
    res.status(200).json({
      success: true,
      totalImages: base64Images.length,
      processedImages: analysisResults.length,
      medicalDisclaimer: "🔴 CRITICAL DISCLAIMER: This AI analysis has accuracy limitations, especially with surgical cases and orientation. Always consult qualified healthcare providers for clinical decisions.",
      analysisResults: analysisResults,
      metadata: {
        processedAt: new Date().toISOString(),
        model: "gpt-4o + OCR orientation check",
        version: "1.1.0"
      }
    });

  } catch (err) {
    console.error("Medical analysis error:", err);
    res.status(500).json({
      success: false,
      msg: "Failed to analyze medical images",
      error: err.message,
      medicalDisclaimer: "This service has known accuracy limitations. Consult healthcare professionals for medical advice."
    });
  }
};


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
You are a senior radiologist AI assistant. Only respond to medical images (X-ray, CT, MRI, ultrasound, or medical report/lab document). If the image is non-medical, respond ONLY with "not medical".

If medical, perform a **thorough, systematic analysis**:

1. **Confirm modality, view, and orientation**: Use R/L markers if present, and anatomical landmarks (heart shadow, gastric bubble, diaphragm). Explicitly state any uncertainty.  
2. **Primary implants/hardware**: Pacemakers, Foreigh Bodies, ICDs, orthopedic devices, stents, surgical clips. Confirm placement, lead/integrity, migration, or complications.  
3. **Secondary devices or incidental hardware**: Look for additional radiopaque devices (implantable monitors, loop recorders, ports, catheters). Describe location, orientation, and integrity.  
4. **Fractures**: Acute, healing, subtle, or old; include location, type, displacement, angulation, and callus formation.  
5. **Foreign bodies**: Actively search for all **radiopaque or metallic foreign bodies**, including swallowed objects (rings, coins, pins), retained surgical materials, bullets, or fragments. Specify location (e.g., esophagus, stomach, airway, soft tissues), size, shape, orientation, and potential clinical significance. Explicitly differentiate between **expected devices and unexpected foreign objects**. 
6. **Soft tissues, bones, and joints**: Subtle lesions, sclerotic/lytic foci, deformities, dislocations, angulations, calcifications.  
7. **Thoracic and abdominal structures**: Examine lungs, mediastinum, heart, diaphragm, and upper abdominal structures. Note subtle or incidental findings, small pneumothoraces, chronic changes, or **radiopaque foreign objects in the esophagus, stomach, or soft tissues**.

**Always report both major and subtle/incidental findings**, even if the study is mostly normal. Explicitly note any **uncertainties or limitations**. Do not overinterpret minor lung opacities unless clearly pathological.

**Output exactly two sections**:

**Doctor-Level Explanation**: Professional paragraph describing modality, orientation, primary and secondary implants, fractures, foreign bodies, bones, soft tissues, thoracic/abdominal structures, and any subtle/incidental findings. Include any uncertainties. Use formal flowing medical terminology.  

**Layman-Friendly Explanation**: One paragraph for patients explaining the same findings in simple language, using analogies for devices, fractures, or foreign bodies. Reassure for benign or expected findings, highlight urgent issues clearly, and note incidental or secondary devices and subtle changes in non-alarming terms.  

End with: "This is a computer-generated response and not a replacement for professional medical advice." No questions, suggestions, or extras.
`
              }
              ,
              {
                role: "user",
                content: [
                  { type: "image", image: base64Image },
                  {
                    type: "text",
                    text: `Analyze this medical image with extreme care. Provide exactly two sections:

Doctor-Level Explanation: One detailed paragraph for experts describing modality, orientation (use markers if present), primary and secondary implants (pacemakers, ICDs, loop recorders, orthopedic devices, stents, surgical clips), fractures, foreign bodies, bones, joints, soft tissues, thoracic and abdominal structures, and subtle/incidental findings (e.g., fibro-atelectasis, small opacities). Mention uncertainties or limitations explicitly.

Layman-Friendly Explanation: One paragraph for patients explaining the same findings in simple language. Use analogies for devices, fractures, or foreign bodies, reassure for benign/expected findings, highlight urgent issues clearly, and include secondary devices and subtle changes in non-alarming terms.

End with: "This is a computer-generated response and not a replacement for professional medical advice." No questions, suggestions, or extra commentary.`
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
You are an expert senior radiologist. Here are analyses from multiple images of a single case:

${validAnalyses.map((a, i) => `Image ${i + 1}: ${a}`).join("\n\n")}

Synthesize all findings into exactly **two sections**, correlating abnormalities across images. Include:

- Orientation and laterality verification for each image (use markers if present).
- Subtle/incidental findings (e.g., bone islands, fibro-atelectasis, mild opacities, artifacts, post-surgical gas patterns).
- Major abnormalities (e.g., fractures, dislocations, malpositioned implants, pneumothorax, effusions).
- Implants and devices (primary and secondary, their positioning and integrity).
- Any variations across images (e.g., a finding visible in one view but not in another) should be clearly noted and integrated into the overall interpretation.
- Ensure consistency in descriptions and explicitly note any uncertainties.

Doctor-Level Explanation: Provide a professional, cohesive summary for experts that integrates findings across all images in flowing paragraph format, including all subtle, incidental, and major abnormalities, orientation, and device assessment. Avoid bold, markdown, or extra formatting.

Layman-Friendly Explanation: Provide a single patient-friendly paragraph summarizing all findings across images in simple, reassuring language. Explain implants, fractures, and incidental findings with analogies as needed. Note any areas of concern clearly without alarm, and acknowledge any uncertainties.

End with: "This is a computer-generated response and not a replacement for professional medical advice." No intros, questions, or suggestions.
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


export const uploadXray = async (req, res) => {
  try {
    // const userId = req.user._id;
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

export const uploadXray_CXR = async (req, res) => {
  try {
    // const userId = req.user._id;
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
    const rawResult = await analyzeXray_cxr(file);

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










































// --- Simulated dynamic modality detection ---
function detectModality(image) {
  const modalities = ["X-ray", "CT", "MRI", "Ultrasound"];
  return modalities[Math.floor(Math.random() * modalities.length)];
}

// --- Simulated dynamic anatomical region detection ---
function detectRegion(image) {
  const regions = ["chest", "abdomen", "hand", "spine", "pelvis"];
  return regions[Math.floor(Math.random() * regions.length)];
}

// --- Simulated CV analysis based on modality and region ---
function analyzeImageWithCV(image, modality, region) {
  const findings = {};

  if (modality === "X-ray") {
    if (region === "hand") {
      findings.bones = { fractures: { detected: Math.random() < 0.3, confidence: 0.9 } };
      findings.joints = { arthritis: { detected: Math.random() < 0.2, confidence: 0.85 } };
      findings.softTissue = { swelling: { detected: Math.random() < 0.3, location: "ring finger", confidence: 0.88 } };
    } else if (region === "chest") {
      findings.organs = { lungs: { status: "clear", confidence: 0.95 }, heart: { status: "normal", confidence: 0.93 } };
      findings.bones = { ribs: { fractures: false, confidence: 0.95 } };
    } else {
      findings.bones = { fractures: false, confidence: 0.9 };
      findings.softTissue = { swelling: false, confidence: 0.9 };
    }
  } else {
    findings.generic = { abnormality: false, confidence: 0.9 };
  }

  return {
    modality,
    region,
    findings,
    overallConfidence: 0.9
  };
}

// --- Convert structured findings to text using LLM ---
async function generateTextReport(structuredFindings) {
  const prompt = `
You are a medical translator. Here are structured findings with confidence scores:

${JSON.stringify(structuredFindings)}

Write two outputs:
1. Doctor-Level Explanation: professional, flowing paragraphs, precise medical terms.
2. Layman-Friendly Explanation: simple, reassuring language with analogies.

Include confidence levels when relevant (e.g., "no fractures detected [95% confidence]").
End with: "This is a computer-generated response and not a replacement for professional medical advice."
`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error("LLM text generation failed");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || null;
}

// --- Main API ---
export const analyzeMedicalImagesModel = async (req, res) => {
  try {
    const base64Images = req.body.images;
    if (!base64Images || !Array.isArray(base64Images) || base64Images.length === 0) {
      return res.status(400).json({ msg: "No images provided" });
    }

    const structuredAnalyses = [];
    const textualReports = [];

    for (const image of base64Images) {
      const modality = detectModality(image);
      const region = detectRegion(image);
      const structured = analyzeImageWithCV(image, modality, region);
      structuredAnalyses.push(structured);

      const textReport = await generateTextReport(structured);
      textualReports.push(textReport);
    }

    // Save all analyses to DB
    const analysisRecords = [];
    for (let i = 0; i < base64Images.length; i++) {
      const record = new Analysis({
        userId: req?.user?.id,
        id: Date.now().toString() + "_" + i,
        imageUrl: `data:image/jpeg;base64,${base64Images[i]}`,
        structuredFindings: structuredAnalyses[i],
        analysisResult: textualReports[i],
        timestamp: new Date().toISOString()
      });
      await record.save();
      analysisRecords.push(record);
    }

    // Return results
    res.status(200).json({
      status: "success",
      message: "Medical image analysis completed",
      data: textualReports.length === 1 ? textualReports[0] : textualReports
    });

  } catch (err) {
    console.error("AnalyzeMedicalImages error:", err);
    res.status(500).json({ msg: "Failed to analyze images" });
  }
};
