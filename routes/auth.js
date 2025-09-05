import express from 'express';
import { check, validationResult } from 'express-validator';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Get cookie options
const getCookieOptions = (isRefreshToken = false) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // In development, use Lax for localhost so cookies set without Secure
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : undefined,
  path: isRefreshToken ? '/api/auth/refresh-token' : '/',
  maxAge: isRefreshToken 
    ? 7 * 24 * 60 * 60 * 1000 // 7 days for refresh token
    : 15 * 60 * 1000, // 15 minutes for access token
});

// Set tokens in HTTP-only cookies
const setTokenCookies = (res, { accessToken, refreshToken }) => {
  res.cookie('accessToken', accessToken, getCookieOptions(false));
  res.cookie('refreshToken', refreshToken, getCookieOptions(true));
  // Clear legacy cookie name if present
  res.clearCookie('token', { ...getCookieOptions(false), path: '/' });
};

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', [
  check('name', 'Name is required').trim().notEmpty(),
  check('email', 'Please include a valid email').trim().isEmail(),
  check('password', 'Password must be at least 8 characters').isLength({ min: 8 })
], async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array()
    });
  }

  const { name, email, password } = req.body;

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email is already registered'
      });
    }

    // Create new user
    const user = new User({
      name,
      email,
      password,
      isEmailVerified: false
    });

    // Save user to database
    await user.save();

    // Generate email verification token
    const verificationToken = user.generateVerificationToken();
    
    // TODO: Send verification email
    console.log('Verification token:', verificationToken);

    // Generate auth tokens
    const { accessToken, refreshToken } = user.generateAuthTokens();
    
    // Save refresh token to database
    user.refreshToken = refreshToken;
    await user.save();

    // Set tokens in HTTP-only cookies
    setTokenCookies(res, { accessToken, refreshToken });

    // Prepare user response without sensitive data
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.refreshToken;

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      user: userResponse,
      accessToken
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user and get tokens
 * @access  Public
 */
router.post('/login', [
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password is required').exists()
], async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  try {
    // Check if user exists
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if password is correct
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate auth tokens
    const { accessToken, refreshToken } = user.generateAuthTokens();
    
    // Save refresh token to database
    user.refreshToken = refreshToken;
    await user.save();

    // Set tokens in HTTP-only cookies
    setTokenCookies(res, { accessToken, refreshToken });

    // Prepare user response without sensitive data
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.refreshToken;

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      user: userResponse,
      accessToken
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and clear cookies
 * @access  Private
 */
router.post('/logout', async (req, res) => {
  try {
    // Clear refresh token from database if user is logged in
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        await User.findByIdAndUpdate(decoded.id, { $unset: { refreshToken: 1 } });
      } catch (error) {
        console.error('Error clearing refresh token:', error);
      }
    }

    // Clear cookies
    const baseClearOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : undefined,
    };
    res.clearCookie('accessToken', { ...baseClearOpts, path: '/' });
    res.clearCookie('refreshToken', { ...baseClearOpts, path: '/api/auth/refresh-token' });
    res.clearCookie('token', { ...baseClearOpts, path: '/' });
    
    res.json({ 
      success: true, 
      message: 'Logout successful' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during logout' 
    });
  }
});

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ 
        success: false, 
        message: 'No refresh token provided',
        shouldLogout: true
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    
    // Find user with this refresh token
    const user = await User.findOne({ _id: decoded.id, refreshToken });
    
    if (!user) {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid refresh token',
        shouldLogout: true
      });
    }

    // Generate new tokens
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = user.generateAuthTokens();
    
    // Update refresh token in database
    user.refreshToken = newRefreshToken;
    await user.save();

    // Set new tokens in cookies
    setTokenCookies(res, { 
      accessToken: newAccessToken, 
      refreshToken: newRefreshToken 
    });

    res.json({ 
      success: true, 
      accessToken: newAccessToken 
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    
    // Clear invalid tokens
    const baseClearOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : undefined,
    };
    res.clearCookie('accessToken', { ...baseClearOpts, path: '/' });
    res.clearCookie('refreshToken', { ...baseClearOpts, path: '/api/auth/refresh-token' });
    res.clearCookie('token', { ...baseClearOpts, path: '/' });
    
    res.status(401).json({ 
      success: false, 
      message: 'Invalid or expired refresh token',
      shouldLogout: true
    });
  }
});

export default router;
