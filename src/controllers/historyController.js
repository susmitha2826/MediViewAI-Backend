import Analysis from "../models/Analysis.js";

export const getHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;  // current page, default 1
    const limit = parseInt(req.query.limit) || 7; // default 7 items
    const skip = (page - 1) * limit;

    const history = await Analysis.find({ userId, status: 0 })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalCount = await Analysis.countDocuments({ userId, status: 0 });

    res.json({
      history,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to fetch history" });
  }
};



export const clearHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    await Analysis.updateMany(
      { userId, status: 0 },
      { $set: { status: 2 } }
    );

    // 📦 Fetch updated history (now status=2)
    const history = await Analysis.find({ userId, status: 2 }).sort({ timestamp: -1 });
    res.json({ msg: "History Cleared" });
  } catch (err) {
    res.status(500).json({ msg: "Failed to clear history" });
  }
};
