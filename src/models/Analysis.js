import mongoose from "mongoose";

const analysisSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  id:{ type: String },
  imageUrl: { type: [String], required: true },
  analysisResult: { type: Object, required: true },
  suggestions: { type: String },
  timestamp: { type: Date, default: Date.now },
  status: { type: Number, enum: [0, 1, 2], default: 0 }
});
const Analysis = mongoose.model("Analysis", analysisSchema);

export default Analysis;
