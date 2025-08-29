import User from "../models/User.js";

export const getProfile = async (req, res) => {
  try {
    const user = req.user;
    const profiledata = await User.findById(user?._id);
    res.json(profiledata);
  } catch (err) {
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
