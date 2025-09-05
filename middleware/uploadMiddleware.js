import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
// Use memory storage so we can send buffers to Cloudinary
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  const filetypes = /jpe?g|png|webp|gif/;
  const mimetypes = /image\/jpe?g|image\/png|image\/webp|image\/gif/;

  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = mimetypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Middleware to handle file uploads
const uploadFiles = upload.array('images', 10);

// Wrapper middleware to handle errors
const handleUpload = (req, res, next) => {
  uploadFiles(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File size too large. Max 5MB allowed.' });
      }
      return res.status(400).json({ message: err.message });
    } else if (err) {
      // An unknown error occurred
      return res.status(400).json({ message: err.message });
    }
    
    // File upload successful
    next();
  });
};

// Middleware to process uploaded files
const processUploads = (req, res, next) => {
  // When using memory storage, the actual upload to Cloudinary
  // will occur in the route handler. This middleware is now a passthrough.
  return next();
};

export { handleUpload, processUploads };
