import Analysis from "../models/Analysis.js";

export const getHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const history = await Analysis.find({ userId }).sort({ timestamp: -1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ msg: "Failed to fetch history" });
  }
};
