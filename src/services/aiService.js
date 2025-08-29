import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import request from "request";

export const analyzeXray = async (file) => {
  try {
    const form = new FormData();
    form.append("image", file.buffer, file.originalname);

    const { data } = await axios.post(
      process.env.CHEXNET_MICROSERVICE_URL,
      form,
      { headers: form.getHeaders() }
    );

    return data;
  } catch (err) {
    console.error("AnalyzeXray error:", err.response?.data || err.message);
    throw new Error("X-ray analysis failed");
  }
};