import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
// import upload from "../middleware/uploadMiddleware.js";
import { analyzeMedicalImages, generateSpeech, translate, uploadXray, testanalysis, uploadXray_CXR } from "../controllers/xrayController.js";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.post("/upload", upload.single("file"), uploadXray);

router.post("/upload_cxr", upload.single("file"), uploadXray_CXR);

router.post("/analyze", authMiddleware, analyzeMedicalImages);

router.post("/test", testanalysis);



router.post("/translate", authMiddleware, translate);

router.post("/tts", authMiddleware, generateSpeech);
export default router;
