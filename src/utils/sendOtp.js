import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,        // STARTTLS
  secure: false,    // must be false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

const sendOtp = async (email, otp) => {
  // console.log("EMAIL_USER:", process.env.EMAIL_USER);
  // console.log("EMAIL_PASS exists:", !!process.env.EMAIL_PASS);

  try {
    const info = await transporter.sendMail({
      from: `"MediView AI" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your OTP for MediView AI",
      text: `Your OTP code is: ${otp}`,
    });

    // Debug info
    // console.log("✅ OTP email sent:", info.messageId);
    // console.log("📧 Preview URL (for testing):", nodemailer.getTestMessageUrl?.(info));

    return {
      status: "success",
      message: "OTP sent to email",
      data: { email }
    };
  } catch (error) {
    console.error("❌ Error sending OTP email:", error.message);

    return {
      status: "error",
      message: "Failed to send OTP email",
      data: error.message
    };
  }
};

export default sendOtp;
