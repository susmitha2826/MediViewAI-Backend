import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
// import upload from "../middleware/uploadMiddleware.js";
import { analyzeMedicalImages, generateSpeech, translate, analyseByOpenAi, analyzeMedicalImages_python } from "../controllers/xrayController.js";
// import { uploadXray, cxrModel, cheXnetModel } from "../controllers/xrayController.js";

import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.post("/analyze", authMiddleware, analyzeMedicalImages); //rork

router.post("/python", authMiddleware, analyzeMedicalImages_python); //python screening

router.post("/openai", authMiddleware, analyseByOpenAi);

// --------------------------Model Trained-------------------------------------------------
// router.post("/chexnet", authMiddleware, cheXnetModel);
// router.post("/cxr", authMiddleware, cxrModel);
// router.post("/upload", upload.single("file"), uploadXray);
// router.post("/cxr", upload.single("file"), cxrModel);

router.post("/translate", authMiddleware, translate);

router.post("/tts", authMiddleware, generateSpeech);
export default router;
