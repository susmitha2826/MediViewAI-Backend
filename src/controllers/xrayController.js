import s3 from "../config/s3.js";
import fs from "fs";
import path from "path";
import Analysis from "../models/Analysis.js";
import { analyzeXray } from "../services/aiService.js";
import { generateSuggestion } from "../services/gptService.js";
import fetch from "node-fetch";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Python Api For List Of Findings
export const analyzeMedicalImages_python = async (req, res) => {
  try {
    const base64Image = req.body.image;
    // console.log("📥 Incoming request for single image");

    if (!base64Image || typeof base64Image !== 'string') {
      console.warn("⚠️ No valid base64 image provided");
      return res.status(400).json({ msg: "No valid base64 image provided" });
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-2025-04-14",
      input: [
        {
          role: "system",
          content: `

            You are an assistant that generates structured radiology reports from X-ray images for decision support.

            Rules:
            1. Identify the BODY PART and VIEW.
            2. Then list ONLY ABNORMAL / POSITIVE findings:
              - Be thorough: check all ribs for congenital fusion (synostosis), fractures, deformities, including healed or remodeling fractures .
              - Check bones, joints, lung fields, heart size/position, mediastinum, diaphragm, soft tissues.
              - Report any implants, prostheses, devices, lines, catheters, calcifications, subcutaneous gas.
              - Inspect for any radiopaque foreign body in trachea/bronchi or lung parenchyma.
              - Look for indirect signs of bronchial obstruction: lobar volume loss, fissure shift, increased density.
              - Note technical/patient artifacts (motion blur, jewelry, grid lines).
            3. Include **even subtle** or **incidental** findings — do not omit minor anomalies.
            4. Examine all vertebral bodies and posterior elements for spina bifida, hemivertebrae, butterfly vertebrae, scoliosis, or any congenital or acquired defects, and report them if visible.
            5. Do NOT describe normal structures unless needed to explain abnormalities.
            6. Examine the entire image carefully for technical artifacts (grid lines, exposure banding, motion blur), patient artifacts (hair, skinfolds, hairbands, braids, clothing, ECG leads, oxygen tubing), overlying external objects (coins, jewelry, buttons, snaps).
            7. Output strictly:
              Anatomy
              Abnormal Findings
              Summary
            Return only the structured text (no additional commentary).

            Strict Rules:
              1. Ignore any patient-identifiable information visible in the image (names, MRN, DOB, annotations, or labels). Do NOT include any of this in the report.
`
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Analyze this X-ray and provide the structured output (Anatomy → Abnormal Findings → Summary) per instructions."
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${base64Image}`
            }
          ]
        }
      ]
    });

    const analysisResult = response?.output_text

    const analysisRecord = new Analysis({
      userId: req?.user?.id,
      id: Date.now().toString(),
      analysisResult: analysisResult,
      timestamp: new Date().toISOString(),
    });
    await analysisRecord.save();

    return res.status(200).json({
      status: "success",
      message: "Radiology draft report generated",
      data: analysisResult,
    });

  } catch (err) {
    console.error("💥 analyzeMedicalImages fatal error:", err);
    res.status(500).json({ msg: "Failed to analyze image" });
  }
};

// Roak Api for analysis
export const analyzeMedicalImages = async (req, res) => {
  try {
    const base64Images = req.body.images;

    if (!base64Images || !Array.isArray(base64Images) || base64Images.length === 0) {
      console.warn("⚠️ No images provided in request body");
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

                  For medical images, perform a **thorough, systematic analysis**:

                  1. **Modality, view, orientation**: Use R/L markers and anatomical landmarks. Explicitly note any uncertainty.
                  2. **Primary Hardware/Artifacts/Implants**: Identify all devices (pacemakers, ICDs, surgical clips, orthopedic hardware, stents) and any **technical imaging artifacts**, including grid lines, motion, exposure issues, or streaks. Describe location, orientation, and integrity.
                  3. **Secondary/Incidental Devices**: Identify additional radiopaque devices and incidental hardware.
                  4. **Fractures**: Specify type, location, displacement, angulation, healing stage.
                  5. **Foreign bodies**: Include metallic or radiopaque items, swallowed objects, retained surgical materials; specify location, size, orientation, and clinical relevance.
                  6. **Soft tissues, bones, joints**: Note subtle lesions, calcifications, deformities, or dislocations.
                  7. **Thoracic/abdominal structures**: Examine lungs, mediastinum, heart, diaphragm, and upper abdomen; mention subtle or incidental findings.
                  8. **Imaging Artifacts**: Explicitly describe all artifacts (grid lines, motion, over/under-exposure, streaks) and note any limitations they cause in interpretation.

                  Identify **all positive findings or abnormalities** (fractures, pneumonia, effusions, implants, tumors, infections, calcifications, cardiomegaly, atelectasis, consolidation, nodules, masses, fibrosis, cysts, foreign bodies, bone/joint abnormalities, or any other pathology). Include subtle/incidental findings. Explicitly mention uncertainties or limitations.

                  **Output exactly two sections**:

                  **Doctor-Level Explanation**: One professional paragraph describing modality, orientation, primary/secondary implants, fractures, foreign bodies, bones, joints, soft tissues, thoracic/abdominal structures, and **all artifacts**, including uncertainties or limitations.  

                  **Layman-Friendly Explanation**: One paragraph explaining the same findings in simple language for patients. Use analogies for devices, fractures, or foreign bodies, and reassure when findings are benign. Clearly highlight urgent issues, incidental findings, and subtle artifacts in non-alarming terms.

                  End with: "This is a computer-generated response and not a replacement for professional medical advice." No questions, suggestions, or extras.
                `
              },
              {
                role: "user",
                content: [
                  { type: "image", image: base64Image },
                  {
                    type: "text", text: `
                      Analyze this medical image with extreme care. Provide exactly two sections:

                      Doctor-Level Explanation: One detailed paragraph for experts describing modality, orientation (use markers if present), primary and secondary implants (pacemakers, ICDs, loop recorders, orthopedic devices, stents, surgical clips), fractures, foreign bodies, bones, joints, soft tissues, thoracic/abdominal structures, subtle/incidental findings (fibro-atelectasis, small opacities), **and imaging artifacts** (grid lines, motion, exposure issues). Mention uncertainties or limitations explicitly.

                      Layman-Friendly Explanation: One paragraph for patients explaining the same findings in simple language. Use analogies for devices, fractures, or foreign bodies, highlight artifacts in understandable terms, reassure for benign/expected findings, and highlight urgent issues clearly.

                      End with: "This is a computer-generated response and not a replacement for professional medical advice." No questions, suggestions, or extra commentary.
                    `}
                ]
              }
            ]
            //,
            // max_tokens: 800, // Uncomment if supported: Supports detailed gas/diaphragm descriptions
            // temperature: 0.5
          })
        });

        if (!response.ok) {
          console.error(`❌ API error for image ${index + 1}:`, response.status, await response.text());
          return null;
        }

        const data = await response.json();

        const completion = data.completion?.trim().toLowerCase();
        if (!completion) {
          console.warn(`⚠️ Empty completion for image ${index + 1}`);
          return null;
        }

        if (completion === "not medical" || completion.includes("not medical")) {
          return null;
        }

        if (!data.completion.includes("Doctor-Level Explanation") ||
          !data.completion.includes("Layman-Friendly Explanation")) {
          console.warn(`⚠️ Missing expected sections in image ${index + 1} response`);
          return null;
        }

        return data.completion;
      } catch (err) {
        console.error(`💥 Error analyzing image ${index + 1}:`, err);
        if (retryCount < 1) {
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
      console.warn("⚠️ No valid medical analyses detected");
      return res.status(400).json({ msg: "⚠️ No medical images found in the upload. Please upload a valid medical report or scan." });
    }

    // Step 2: Handle single vs multiple images
    if (validAnalyses.length === 1) {
      const analysisRecord = new Analysis({
        userId: req?.user?.id,
        id: Date.now().toString(),
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

            **Doctor-Level Explanation**: Provide a professional, cohesive summary for experts that integrates findings across all images in flowing paragraph format, including all subtle, incidental, and major abnormalities, orientation, and device assessment. Avoid bold, markdown, or extra formatting.

            **Layman-Friendly Explanation**: Provide a single patient-friendly paragraph summarizing all findings across images in simple, reassuring language. Explain implants, fractures, and incidental findings with analogies as needed. Note any areas of concern clearly without alarm, and acknowledge any uncertainties.

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
      console.error("❌ Final summary API error:", finalResponse.status, await finalResponse.text());
      throw new Error("Failed to generate summary");
    }

    const finalData = await finalResponse.json();

    const analysisRecord = new Analysis({
      userId: req?.user?.id,
      id: Date.now().toString(),
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
    console.error("💥 analyzeMedicalImages fatal error:", err);
    res.status(500).json({ msg: "Failed to analyze images" });
  }
};

// OpenAI
export const analyseByOpenAi = async (req, res) => {
  try {
    const images = req.body.images;
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "No images provided" });
    }

    const imageInputs = images.map((base64, index) => ({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${base64}`,
    }));

    // Call OpenAI Chat Completion API (multimodal model)
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
                  I am a Trainee Radiologist. Analyze all provided medical data carefully. Inputs may include **medical images (X-rays, CT, MRI), lab reports, or other clinical imaging**.  

                  **Critical instructions:**  
                  1. Detect **all abnormalities, implants, metallic devices, foreign bodies, fractures, lung effusions, pneumonia, tumors, lab abnormalities, or any other pathologies**.  
                  2. If there is any **metallic or radiopaque device in another part of the body**, such as a pacemaker visible outside the primary region, **always report it explicitly**, even if unrelated to the main focus.  
                  3. Detect **all imaging artifacts**, including grid lines, patient hair, or technical artifacts. For each artifact, describe **type, location, orientation, and approximate size if visible**.  
                  4. Include **subtle, incidental, or partially visible findings**, and do not omit small devices, ambiguous foreign bodies, or minor lab abnormalities.  
                  5. If uncertain about a finding, implant, or artifact, provide possible differentials (e.g., surgical clip vs. external object, benign vs. malignant lab anomaly). 
                  6. check all the abnormal posssibilities like:
                      - Be thorough: check all ribs for congenital fusion (synostosis), fractures, deformities, including healed or remodeling fractures .
                      - Check bones, joints, lung fields, heart size/position, mediastinum, diaphragm, soft tissues.
                      - Report any implants, prostheses, devices, lines, catheters, calcifications, subcutaneous gas.
                      - Inspect for any radiopaque foreign body in trachea/bronchi or lung parenchyma.
                      - Look for indirect signs of bronchial obstruction: lobar volume loss, fissure shift, increased density.
                      - Note technical/patient artifacts (motion blur, jewelry, grid lines).
                  6. If any input is non-medical, respond with **"This is not a medical image/document"** for that item only.


                  Output separately for each input:

                  **Image 1:**  
                  **Doctor-Level Explanation**: Professional, detailed paragraph describing modality (or document type), orientation, bones, soft tissues, relevant organs, implants (explicitly mention any metallic devices), fractures, foreign bodies, artifacts (with location, orientation, and size), lab abnormalities, and subtle or incidental findings.  
                  **Layman-Friendly Explanation**: Clear, simple paragraph explaining the same findings in plain language. Use analogies for devices (e.g., “a small patch inside the heart”), fractures, foreign bodies, or lab abnormalities. Describe artifacts simply (“lines from the scanner” or “hair over the image”). Reassure for benign findings and highlight urgent findings.  

                  **Image 2:** Repeat same structure for each additional input.  

                  End with this exact disclaimer:  
                  This is a computer-generated response and not a replacement for professional medical advice.
          `
            },
            ...imageInputs
          ]
        }
      ]
    });


    const result = response?.output_text;
    console.log(result, "API analysis result");


    const analysisRecord = new Analysis({
      userId: req?.user?.id,
      id: Date.now().toString(),
      // imageUrl: base64Images.map(img => `data:image/jpeg;base64,${img}`),
      analysisResult: result,
      timestamp: new Date().toISOString(),
    });
    await analysisRecord.save();

    res.status(200).json({
      status: "success",
      message: "Medical image analysis completed",
      data: result,
    });

  } catch (err) {
    console.error("Error in analyseByOpenAi:", err);
    res.status(500).json({ error: "Failed to analyze images" });
  }
};

// CheXnet Model
export const uploadXray = async (req, res) => {
  try {
    // const userId = req.user._id;
    const file = req.file;

    // console.log("Received file:", file ? file.originalname : "No file");
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


// Translate Function
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


// -----------------------------------------------Model Apis------------------------------------------------------------------------------------------------------------------------------------------------

// // CheXnet Model
// export const cheXnetModel = async (req, res) => {
//   try {
//     const base64Images = req.body.images;
//     if (!base64Images || !Array.isArray(base64Images) || base64Images.length === 0) {
//       return res.status(400).json({ msg: "No images provided" });
//     }

//     const uploadDir = path.join(process.cwd(), "uploads/xrays");
//     if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

//     const individualResults = [];

//     for (let i = 0; i < base64Images.length; i++) {
//       const base64Data = base64Images[i]; // directly use string
//       const buffer = Buffer.from(base64Data, "base64"); // decode directly

//       const fileName = `${Date.now()}_xray_${i}.png`;
//       const filePath = path.join(uploadDir, fileName);
//       fs.writeFileSync(filePath, buffer);

//       // Analyze each image
//       const analysisResult = await analyzeXray(filePath); // just pass path

//       individualResults.push(analysisResult);
//     }
//     // console.log(individualResults, "individualResultsindividualResults")
//     // Combine all individual results to generate a single suggestion
//     const finalSuggestion = await generateSuggestion(individualResults);



//     // const analysisRecord = new Analysis({
//     //   userId: req?.user?.id,
//     //   id: Date.now().toString(),
//     //   // imageUrl: base64Images.map(img => `data:image/jpeg;base64,${img}`),
//     //   analysisResult: finalSuggestion,
//     //   timestamp: new Date().toISOString(), 
//     // });
//     // await analysisRecord.save();

//     res.status(200).json({
//       status: "success",
//       message: "Medical image analysis completed",
//       data: finalSuggestion,
//     });


//     // res.json({
//     //   analysisResults: individualResults, // raw results per image
//     //   finalSuggestion
//     // });
//   } catch (err) {
//     console.error("uploadchexnet error:", err);
//     res.status(500).json({ msg: "Failed to upload and analyze X-rays" });
//   }
// };


// // export const cxrModel = async (req, res) => {
// //   try {
// //     // const userId = req.user._id;
// //     const file = req.file;

// //     console.log("Received file:", file ? file.originalname : "No file");
// //     if (!file) {
// //       return res.status(400).json({ msg: "No X-ray file uploaded" });
// //     }

// //     // ---------- Local folder storing -------------------
// //     const uploadDir = path.join(process.cwd(), "uploads/xrays");
// //     if (!fs.existsSync(uploadDir)) {
// //       fs.mkdirSync(uploadDir, { recursive: true });
// //     }

// //     // Save file locally
// //     const fileName = `${Date.now()}_${file.originalname}`;
// //     const filePath = path.join(uploadDir, fileName);
// //     fs.writeFileSync(filePath, file.buffer);

// //     const imageUrl = `/uploads/xrays/${fileName}`; // relative path for frontend access

// //     // Analyze image using external microservice
// //     const rawResult = await analyzeXray_cxr(file);

// //     // Generate AI-based suggestions
// //     const suggestions = await generateSuggestion(rawResult);

// //     const analysisRecord = new Analysis({
// //       userId: req?.user?.id,
// //       id: Date.now().toString(),
// //       // imageUrl: base64Images.map(img => `data:image/jpeg;base64,${img}`),
// //       analysisResult: suggestions,
// //       timestamp: new Date().toISOString(),
// //     });
// //     await analysisRecord.save();

// //     res.status(200).json({
// //       status: "success",
// //       message: "Medical image analysis completed",
// //       data: suggestions,
// //     });

// //   } catch (err) {
// //     console.error("UploadXray error:", err);
// //     res.status(500).json({ msg: "Failed to upload and analyze X-ray" });
// //   }
// // };



// export const cxrModel = async (req, res) => {
//   try {
//     // Expecting `req.body.imagesBase64` (array of base64 strings)

//     const imagesBase64 = req.body.images;
//     if (!imagesBase64 || !Array.isArray(imagesBase64) || imagesBase64.length === 0) {
//       return res.status(400).json({ msg: "No X-ray images provided (base64 array required)" });
//     }

//     // ---------- Local folder storing -------------------
//     const uploadDir = path.join(process.cwd(), "uploads/xrays");
//     if (!fs.existsSync(uploadDir)) {
//       fs.mkdirSync(uploadDir, { recursive: true });
//     }

//     let analysisResults = [];
//     let savedImages = [];

//     // Loop through each base64 image
//     for (let i = 0; i < imagesBase64.length; i++) {
//       const base64Data = imagesBase64[i].replace(/^data:image\/\w+;base64,/, "");
//       const buffer = Buffer.from(base64Data, "base64");

//       const fileName = `${Date.now()}_${i}.jpg`;
//       const filePath = path.join(uploadDir, fileName);
//       fs.writeFileSync(filePath, buffer);

//       const file = {
//         originalname: fileName,
//         buffer: buffer,
//       };

//       savedImages.push(`/uploads/xrays/${fileName}`);

//       // Analyze each image separately
//       const rawResult = await analyzeXray_cxr(file);
//       analysisResults.push(rawResult);
//     }
//     // Generate AI-based suggestions (using all views together)
//     const suggestions = await generateSuggestion(analysisResults);

//     // Save to DB
//     // const analysisRecord = new Analysis({
//     //   userId: req?.user?.id,
//     //   id: Date.now().toString(),
//     //   // imageUrls: savedImages, // store all related views
//     //   analysisResult: suggestions,
//     //   timestamp: new Date().toISOString(),
//     // });
//     // await analysisRecord.save();

//     res.status(200).json({
//       status: "success",
//       message: "Multi-view X-ray analysis completed",
//       data: suggestions,
//     });

//   } catch (err) {
//     console.error("CXR Model error:", err);
//     res.status(500).json({ msg: "Failed to upload and analyze X-rays" });
//   }
// };











































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
