import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { getHistory } from "../controllers/historyController.js";

const router = express.Router();

router.get("/get-history", authMiddleware, getHistory);

export default router;
