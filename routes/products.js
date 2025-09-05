import express from 'express';
import { check, validationResult } from 'express-validator';
import { protect, admin } from '../middleware/authMiddleware.js';
import Product from '../models/Product.js';

// @route   GET /api/products
// @desc    Get all products with optional filters
// @access  Public
const router = express.Router();
router.get('/', async (req, res) => {
  try {
    const { category, featured, bestseller, search, limit = 10, page = 1 } = req.query;
    const query = {};
    
    if (category) query.category = category;
    if (featured === 'true') query.isFeatured = true;
    if (bestseller === 'true') query.isBestSeller = true;
    if (search) query.$text = { $search: search };

    const skip = (page - 1) * limit;
    const products = await Product.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(query);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalProducts: total
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/products/:id
// @desc    Get single product by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Product not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/products
// @desc    Create a product
// @access  Private/Admin
router.post(
  '/',
  [
    protect,
    [
      check('name', 'Name is required').not().isEmpty(),
      check('description', 'Description is required').not().isEmpty(),
      check('price', 'Please include a valid price').isFloat({ min: 0 }),
      check('stock', 'Please include a valid stock quantity').isInt({ min: 0 }),
      check('category', 'Category is required').not().isEmpty(),
      check('images', 'At least one image is required').isArray({ min: 1 })
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const newProduct = new Product({
        ...req.body,
        user: req.user.id
      });

      const product = await newProduct.save();
      res.json(product);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   PUT /api/products/:id
// @desc    Update a product
// @access  Private/Admin
router.put(
  '/:id',
  [
    protect,
    [
      check('name', 'Name is required').not().isEmpty(),
      check('description', 'Description is required').not().isEmpty(),
      check('price', 'Please include a valid price').isFloat({ min: 0 }),
      check('stock', 'Please include a valid stock quantity').isInt({ min: 0 }),
      check('category', 'Category is required').not().isEmpty(),
      check('images', 'At least one image is required').isArray({ min: 1 })
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ msg: 'Product not found' });
      }

      // Check user is admin
      if (req.user.role !== 'admin') {
        return res.status(401).json({ msg: 'Not authorized' });
      }

      product = await Product.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true }
      );

      res.json(product);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   DELETE /api/products/:id
// @desc    Delete a product
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    // Check user is admin
    if (req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    await product.remove();
    res.json({ msg: 'Product removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Product not found' });
    }
    res.status(500).send('Server Error');
  }
});

export default router;
