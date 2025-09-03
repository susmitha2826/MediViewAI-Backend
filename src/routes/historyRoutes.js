import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { clearHistory, getHistory } from "../controllers/historyController.js";

const router = express.Router();

router.get("/get-history", authMiddleware, getHistory);

router.put("/clear-history", authMiddleware, clearHistory);
export default router;
