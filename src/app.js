import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import xrayRoutes from "./routes/xrayRoutes.js";
import historyRoutes from "./routes/historyRoutes.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Enable CORS
app.use(cors());

// JSON and URL-encoded body parser with 50MB limit
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/xray", xrayRoutes);
app.use("/api/history", historyRoutes);

// Serve static files
app.use(
  "/api/xray/tts",
  express.static(path.join(__dirname, "../public/tts"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".mp3")) {
        res.setHeader("Content-Type", "audio/mpeg");
      }
    },
  })
);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

export default app;
