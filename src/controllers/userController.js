import Analysis from "../models/Analysis.js";
import User from "../models/User.js";

export const getProfile = async (req, res) => {
  try {
    const userId = req.user._id;

    // 🧑 Get user data (exclude sensitive fields like password)
    const profileData = await User.findById(userId).select("-password");

    if (!profileData) {
      return res.status(404).json({ msg: "User not found" });
    }

    // 📊 Count analyses belonging to this user
    // const analysisCount = await Analysis.countDocuments({ userId, status: 0 });
   const history = await Analysis.find({ userId, status: 0 }).sort({ timestamp: -1 });
    // 📨 Respond with combined data
    res.json({
      ...profileData.toObject(),
      history,
    });
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ msg: "Failed to fetch profile" });
  }
};


export const updateProfile = async (req, res) => {
  try {
    const user = req.user;
    const { name, dob } = req.body;
    user.name = name || user.name;
    user.dob = dob || user.dob;
    await user.save();
    res.json({ msg: "Profile updated" });
  } catch (err) {
    res.status(500).json({ msg: "Failed to update profile" });
  }
};
