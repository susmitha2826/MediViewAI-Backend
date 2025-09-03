import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
// import upload from "../middleware/uploadMiddleware.js";
import { analyzeMedicalImage, analyzeXrayImage, generateSpeech, translate, uploadXray } from "../controllers/xrayController.js";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.post("/upload", authMiddleware, upload.single("file"), uploadXray);

router.post("/analyze", authMiddleware, analyzeMedicalImage);

router.post("/translate", authMiddleware, translate);

router.post("/tts", authMiddleware, generateSpeech);
export default router;
