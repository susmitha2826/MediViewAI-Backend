import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import request from "request";


export const analyzeXray = async (filePath) => {
  try {
    const form = new FormData();
    const fileStream = fs.createReadStream(filePath); // read saved file
    form.append("image", fileStream); // name optional, depends on microservice

    // console.log("Sending X-ray to:", process.env.CHEXNET_MICROSERVICE_URL);
    // console.log("File path:", filePath);

    const { data } = await axios.post(
      process.env.CHEXNET_MICROSERVICE_URL,
      form,
      { headers: form.getHeaders() }
    );

    return data;
  } catch (err) {
    console.error("AnalyzeXray error response:", err.response?.data);
    console.error("AnalyzeXray error message:", err.message);
    throw new Error("X-ray analysis failed");
  }
};


export const analyzeXray_cxr = async (file, task = null, returnHeatmap = false) => {
  try {
    const form = new FormData();

    // FastAPI expects the file field to be called "file"
    form.append("file", file.buffer, file.originalname);

    // Optional fields
    if (task) form.append("task", task); // e.g., "cxr"
    form.append("return_heatmap", returnHeatmap ? "true" : "false"); // must be string

    // Send request
    const { data } = await axios.post(process.env.CXR, form, {
      headers: form.getHeaders()
    });

    // console.log("X-ray analysis response:", data);
    return data;
  } catch (err) {
    console.error("AnalyzeXray error response:", err.response?.data);
    console.error("AnalyzeXray error message:", err.message);
    throw new Error("X-ray analysis failed");
  }
};