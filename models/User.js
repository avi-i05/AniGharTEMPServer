import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const userSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false // Don't return password in queries by default
    },
    
    // Account Status
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLogin: {
      type: Date
    },
    
    // Profile
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    avatar: {
      type: String,
      default: ''
    },
    
    // Contact Information
    phone: {
      type: String,
      default: '',
      match: [/^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/, 'Please enter a valid phone number']
    },
    refreshToken: {
      type: String,
      select: false
    }
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  console.log('Pre-save hook triggered for user:', this.email);
  
  if (!this.isModified('password')) {
    console.log('Password not modified, skipping hashing');
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Error comparing passwords');
  }
};

// Generate JWT tokens
userSchema.methods.generateAuthTokens = function() {
  if (!process.env.JWT_SECRET || !process.env.REFRESH_TOKEN_SECRET) {
    throw new Error('JWT secrets are not configured');
  }

  // Access Token (short-lived)
  const accessToken = jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  // Refresh Token (longer-lived)
  const refreshToken = jwt.sign(
    { id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );

  // Save refresh token to user document
  this.refreshToken = refreshToken;
  
  return { accessToken, refreshToken };
};

// Generate email verification token
userSchema.methods.generateVerificationToken = function() {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

const User = mongoose.model('User', userSchema);

export default User;
