import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { handleUpload, processUploads } from '../middleware/uploadMiddleware.js';
import cloudinary from '../utils/cloudinary.js';
import stream from 'stream';

const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'products';

const router = express.Router();

// @route   POST /api/upload
// @desc    Upload image files
// @access  Private/Admin
router.post('/', protect, admin, (req, res) => {
  handleUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files were uploaded' });
      }

      const uploadOne = (file) =>
        new Promise((resolve, reject) => {
          const pass = new stream.PassThrough();
          const options = { folder: CLOUDINARY_FOLDER, resource_type: 'image' };
          const cldStream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) return reject(error);
            resolve(result);
          });
          pass.end(file.buffer);
          pass.pipe(cldStream);
        });

      const results = [];
      for (const file of req.files) {
        // Sequential to control rate; could be Promise.all if desired
        const result = await uploadOne(file);
        results.push(result);
      }

      const files = results.map((r) => r.secure_url);
      const publicIds = results.map((r) => r.public_id);

      return res.status(200).json({
        message: 'Files uploaded successfully',
        files,
        publicIds,
      });
    } catch (e) {
      console.error('Cloudinary upload error:', e);
      return res.status(500).json({ message: 'Upload failed' });
    }
  });
});

// @route   DELETE /api/upload/:filename
// @desc    Delete an uploaded file
// @access  Private/Admin
// To delete from Cloudinary, pass ?publicId=<cloudinary_public_id>
router.delete('/', protect, admin, async (req, res) => {
  const { publicId } = req.query;
  if (!publicId) {
    return res.status(400).json({ message: 'publicId is required' });
  }
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    return res.json({ message: 'File deleted successfully' });
  } catch (e) {
    console.error('Cloudinary delete error:', e);
    return res.status(500).json({ message: 'Error deleting file' });
  }
});

export default router;
