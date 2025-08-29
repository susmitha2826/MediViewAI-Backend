import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema({
  name: { type: String },
  dob: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  googleId: { type: String },
  otp: { type: String },
  createdAt: { type: Date, default: Date.now }
});


userSchema.methods.generateAuthToken = function () {
  const token = jwt.sign(
    {
      id: this._id,
      name: this.name
    },
    process.env.JWT_SECRET,   
  );
  return token;
};

const User = mongoose.model("User", userSchema);

export default User;
