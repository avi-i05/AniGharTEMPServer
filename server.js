import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routes
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import uploadRoutes from './routes/upload.js';
import authRoutes from './routes/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Debug: Log environment variables
if (process.env.VERBOSE_STARTUP === 'true') {
  console.log('Environment variables:', {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET ? '***SET***' : '***NOT SET***',
    MONGO_URI: process.env.MONGO_URI ? '***SET***' : '***NOT SET***'
  });
}

const app = express();
const PORT = process.env.PORT || 5000;

// Database connection
async function connectDB() {
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('Connection string:', process.env.MONGO_URI ? 'Found' : 'Missing');
    
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log('Database name:', conn.connection.name);
    
    if (process.env.VERBOSE_DB === 'true') {
      // List all collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log('Available collections:', collections.map(c => c.name));
      
      // Test the connection with a simple query
      try {
        const usersCount = await mongoose.connection.db.collection('users').countDocuments();
        console.log(`Current number of users in database: ${usersCount}`);
      } catch (err) {
        console.log('Users collection does not exist or is empty');
      }
    }
    
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// Allowed origins list
const allowedOrigins = [
  'http://localhost:3000', 
  'http://localhost:8080',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5173'
];

// Configure CORS with dynamic origin
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman) in development
    if (!origin && process.env.NODE_ENV !== 'production') {
      if (process.env.VERBOSE_CORS === 'true') {
        console.log('Allowing request with no origin (development mode)');
      }
      return callback(null, true);
    }
    
    // Check if the origin is in the allowed origins list
    if (allowedOrigins.includes(origin) || !origin) {
      return callback(null, true);
    }
    
    if (process.env.VERBOSE_CORS === 'true') {
      console.log('CORS blocked for origin:', origin);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Allow-Credentials',
    'X-Refresh-Token'
  ],
  exposedHeaders: [
    'Content-Length',
    'X-Foo',
    'X-Bar',
    'Set-Cookie'
  ],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Trust first proxy (for production)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Middleware to parse JSON, urlencoded data, and cookies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// Optional request logging (disabled by default)
if (process.env.VERBOSE_REQUESTS === 'true') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
  });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);

// Serve static files from the public directory
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Serve static files from React frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  // Handle React routing, return all requests to React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// Start server function
const startServer = async () => {
  try {
    // Validate required env variables
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }
    
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }

    await connectDB();
    
    // Create default admin user if doesn't exist
    const User = (await import('./models/User.js')).default;
    const bcrypt = (await import('bcryptjs')).default;
    
    try {
      const adminExists = await User.findOne({ email: 'admin@example.com' });
      
      if (!adminExists) {
        console.log('Creating default admin user...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('admin123', salt);
        
        const adminUser = new User({
          name: 'Admin',
          email: 'admin@example.com',
          password: hashedPassword,
          role: 'admin'
        });
        
        await adminUser.save();
        console.log('Default admin user created');
      }
    } catch (userError) {
      console.error('Error setting up admin user:', userError);
      // Don't crash the server if admin setup fails
    }

    const server = app.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      console.log(`JWT_SECRET is ${process.env.JWT_SECRET ? 'set' : 'NOT SET'}`);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      console.error(`Error: ${err.message}`);
      // Close server & exit process
      server.close(() => process.exit(1));
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the application
startServer();
