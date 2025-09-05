import express from 'express';
import { check, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { protect, admin } from '../middleware/authMiddleware.js';
import User from '../models/User.js';

const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get current user's profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
  try {
    // req.user is attached by protect middleware
    const user = await User.findById(req.user._id || req.user.id).select('-password -refreshToken');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (err) {
    console.error('Get profile error:', err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   PUT /api/users/profile
// @desc    Update current user's profile
// @access  Private
router.put(
  '/profile',
  [
    protect,
    [
      check('name').optional().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
      check('email').optional().isEmail().withMessage('Please include a valid email'),
      check('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const user = await User.findById(req.user._id || req.user.id).select('+password');
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const { name, email, password, avatar, phone } = req.body;

      if (name) user.name = name;
      if (email && email !== user.email) {
        const existing = await User.findOne({ email });
        if (existing && existing._id.toString() !== user._id.toString()) {
          return res.status(400).json({ success: false, message: 'Email already in use' });
        }
        user.email = email;
      }
      if (typeof avatar !== 'undefined') user.avatar = avatar;
      if (typeof phone !== 'undefined') user.phone = phone;

      if (password) {
        // Assigning will trigger pre-save hook to hash
        user.password = password;
      }

      await user.save();

      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.refreshToken;

      res.json({ success: true, user: userResponse });
    } catch (err) {
      console.error('Update profile error:', err.message);
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  }
);

// @route   GET /api/users
// @desc    Get all users (Admin only)
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    const users = await User.find({})
      .select('-password')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
      
    const total = await User.countDocuments();
    
    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalUsers: total
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private/Admin
router.get('/:id', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private/Admin
router.put('/:id', [
  protect,
  admin,
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { name, email, role, isActive } = req.body;
  
  try {
    let user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    // Check if email already exists
    if (email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ msg: 'Email already in use' });
      }
    }
    
    // Update user
    user.name = name;
    user.email = email;
    if (role) user.role = role;
    if (typeof isActive !== 'undefined') user.isActive = isActive;
    
    await user.save();
    
    // Don't send password in response
    user = user.toObject();
    delete user.password;
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user
// @access  Private/Admin
router.delete('/:id', [protect, admin], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    // Prevent deleting own account
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ msg: 'Cannot delete your own account' });
    }
    
    await user.remove();
    
    res.json({ msg: 'User removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.status(500).send('Server Error');
  }
});

export default router;
