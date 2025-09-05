import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Verify access token
const verifyAccessToken = (token) => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Access token expired');
    }
    throw new Error('Invalid access token');
  }
};

// Verify refresh token
const verifyRefreshToken = async (token) => {
  try {
    if (!process.env.REFRESH_TOKEN_SECRET) {
      throw new Error('REFRESH_TOKEN_SECRET is not configured');
    }
    
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user || user.refreshToken !== token) {
      throw new Error('Invalid refresh token');
    }
    
    return user;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Refresh token expired');
    }
    throw new Error('Invalid refresh token');
  }
};

const protect = async (req, res, next) => {
  try {
    // Get access token from cookie
    const accessToken = req.cookies.accessToken || req.cookies.token;
    
    if (!accessToken) {
      return res.status(401).json({ 
        success: false,
        message: 'No access token provided',
        shouldRefresh: true
      });
    }

    try {
      // Verify access token
      const decoded = verifyAccessToken(accessToken);
      
      // Get user from the token
      const user = await User.findById(decoded.id).select('-password -refreshToken');
      
      if (!user) {
        throw new Error('User not found');
      }

      // Attach user to request object
      req.user = user;
      next();
      
    } catch (error) {
      // Token expired or invalid; let client handle refresh via /api/auth/refresh-token
      const isExpired = error.message === 'Access token expired';
      console.error('Token verification failed:', error.message);
      return res.status(401).json({
        success: false,
        message: isExpired ? 'Access token expired' : 'Invalid access token',
        shouldRefresh: isExpired,
        shouldLogout: !isExpired
      });
    }
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Authentication error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an admin' });
  }
};

export { protect, admin };
