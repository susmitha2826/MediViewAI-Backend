import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import xrayRoutes from "./routes/xrayRoutes.js";
import historyRoutes from "./routes/historyRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());





app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/xray", xrayRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/xray/tts", express.static(path.join(__dirname, "../public/tts"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".mp3")) {
      res.setHeader("Content-Type", "audio/mpeg");
    }
  }
}));

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
export default app;
