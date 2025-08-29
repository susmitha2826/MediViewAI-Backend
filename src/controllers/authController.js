import User from "../models/User.js";
import bcrypt from "bcryptjs";
import generateToken from "../utils/generateJwt.js";
import sendOtp from "../utils/sendOtp.js";

export const register = async (req, res) => {
  const { name, dob, email, password } = req.body;

  try {
    let existingUser = await User.findOne({ email });

    // Case 1: User already verified (OTP is null)
    if (existingUser && existingUser.otp === null) {
      return res.status(400).json({
        status: "fail",
        message: "User already registered and verified",
        data: null
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    // Send OTP
    // const emailResult = await sendOtp(email, otp);
    // if (emailResult.status !== "success") {
    //   return res.status(500).json({
    //     status: "error",
    //     message: "Failed to send OTP. Please try again later.",
    //     data: emailResult.data
    //   });
    // }

    if (!existingUser) {
      // New user
      existingUser = new User({
        name,
        dob,
        email,
        password:hashedPassword,
        otp,
      });
    } else {
      existingUser.otp = otp;
    }

    await existingUser.save();

    res.status(200).json({
      status: "success",
      message: "OTP sent to email",
      data: { email }
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      status: "error",
      message: "Registration failed",
      data: error.message
    });
  }
};


export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
        data: null
      });
    }

    if (user.otp === null) {
      return res.status(400).json({
        status: "fail",
        message: "User already verified",
        data: null
      });
    }

    if (user.otp !== otp) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid OTP",
        data: null
      });
    }

    // OTP matched → clear it
    user.otp = null;
    await user.save();

    res.status(200).json({
      status: "success",
      message: "OTP verified successfully",
      data: { email: user.email }
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to verify OTP",
      data: error.message
    });
  }
};


export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });

    const token = user.generateAuthToken();

    return res.status(200).json({
      status: "success",
      message: "User login successful",
      data: { token }
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};




