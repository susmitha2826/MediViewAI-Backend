import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (![".png", ".jpg", ".jpeg"].includes(ext)) {
    return cb(new Error("Only images are allowed"), false);
  }
  cb(null, true);
};


const upload = multer({ storage, fileFilter });

export default upload;
