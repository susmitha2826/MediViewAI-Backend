import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import xrayRoutes from "./routes/xrayRoutes.js";
import historyRoutes from "./routes/historyRoutes.js";
import path from "path";
import bodyParser from "body-parser";

const app = express();

app.use(cors());
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());





app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/xray", xrayRoutes);
app.use("/api/history", historyRoutes);

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
export default app;
