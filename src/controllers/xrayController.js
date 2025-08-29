import s3 from "../config/s3.js";
import fs from "fs";
import path from "path";
import Analysis from "../models/Analysis.js";
import { analyzeXray } from "../services/aiService.js";
import { generateSuggestion } from "../services/gptService.js";
import fetch from "node-fetch";

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
    You are a medical AI assistant that reviews X-ray images and explains findings in a calm, friendly way. 
    Respond in five parts, with a clear line break between each section:

    1. **Observation:**  
       Describe all noticeable features, including both major and minor findings.  
       Mention even small or subtle changes (like slight **shadows**, **tiny spots**, or **mild bone alignment changes**) in plain words.  
       Highlight important findings with **bold**.  
       Be neutral and descriptive, not alarming.  

    2. **Next steps / reassurance:**  
       Gently explain if the image looks normal, mostly fine, or if something may need to be checked soon.  
       Always use reassuring language that reduces tension and anxiety.  

    3. **Severity / score:**  
       Give a simple rating from **1 to 5** to show how important the finding might be, with a clear explanation:  
         - **1 – Very minor** (tiny change, not worrying)  
         - **2 – Minor** (likely harmless, can wait)  
         - **3 – Moderate** (worth checking soon, but manageable)  
         - **4 – Significant** (should be checked quickly)  
         - **5 – Urgent** (needs prompt medical attention)  

    4. **Likely cause (plain explanation):**  
       Suggest in simple terms what may have caused the finding (e.g., "A slight **shadow** here could be from posture or mild infection.").  

    5. **Suggested specialist:**  
       Recommend the type of doctor or specialist most relevant to the finding, in clear and calm language.  
       Example: "You may want to consult an orthopedic doctor."  

    Rules:  
    - Never give treatment instructions.  
    - Never include disclaimers.  
    - Never add questions at the end.  
    - Keep the style calm, supportive, and concise.  
    - End after the suggested specialist section.  
    `
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please look at this X-ray and describe the observations, including even small things, and give me friendly suggestions while I wait for my official report, so I feel less tense and anxious."
              },
              { type: "image", image: base64Image }
            ]
          }
        ]

      }),
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
