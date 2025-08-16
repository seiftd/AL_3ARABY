require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import configurations and middleware
const config = require('./config');
const logger = require('./utils/logger');
const database = require('./database');
const redis = require('./config/redis');
const errorHandler = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const eventRoutes = require('./routes/events');
const venueRoutes = require('./routes/venues');
const ticketRoutes = require('./routes/tickets');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const contractRoutes = require('./routes/contracts');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const notificationRoutes = require('./routes/notifications');

const app = express();
const server = http.createServer(app);

// Socket.IO setup for real-time features
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN.split(','),
    credentials: true
  }
});

// Store io instance globally for use in other modules
app.set('io', io);

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "wss:", "ws:"]
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN.split(','),
  credentials: process.env.CORS_CREDENTIALS === 'true',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compression
app.use(compression());

// Request logging
app.use(morgan('combined', {
  stream: { write: message => logger.info(message.trim()) }
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    error_ar: 'عدد كبير من الطلبات من هذا العنوان، يرجى المحاولة مرة أخرى لاحقاً.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// API routes
const apiRouter = express.Router();

// Public routes (no authentication required)
apiRouter.use('/auth', authRoutes);
apiRouter.use('/events/public', eventRoutes);
apiRouter.use('/venues/public', venueRoutes);

// Protected routes (authentication required)
apiRouter.use('/users', authenticate, userRoutes);
apiRouter.use('/events', authenticate, eventRoutes);
apiRouter.use('/venues', authenticate, venueRoutes);
apiRouter.use('/tickets', authenticate, ticketRoutes);
apiRouter.use('/orders', authenticate, orderRoutes);
apiRouter.use('/payments', authenticate, paymentRoutes);
apiRouter.use('/contracts', authenticate, contractRoutes);
apiRouter.use('/admin', authenticate, adminRoutes);
apiRouter.use('/upload', authenticate, uploadRoutes);
apiRouter.use('/notifications', authenticate, notificationRoutes);

app.use(`/api/${config.apiVersion}`, apiRouter);

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);

  // Join user to their personal room for notifications
  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
    logger.info(`User ${userId} joined their notification room`);
  });

  // Join event room for real-time updates
  socket.on('join_event_room', (eventId) => {
    socket.join(`event_${eventId}`);
    logger.info(`User joined event room: ${eventId}`);
  });

  // Handle QR code validation in real-time
  socket.on('validate_ticket', async (data) => {
    try {
      const { qrCode, eventId } = data;
      // Implement ticket validation logic
      // Emit result back to scanner
      socket.emit('ticket_validation_result', {
        success: true,
        ticket: { /* ticket data */ }
      });
    } catch (error) {
      socket.emit('ticket_validation_result', {
        success: false,
        error: error.message
      });
    }
  });

  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`);
  });
});

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    error_ar: 'الرابط غير موجود'
  });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connections
    database.end().then(() => {
      logger.info('Database connections closed');
      process.exit(0);
    }).catch((err) => {
      logger.error('Error closing database connections:', err);
      process.exit(1);
    });
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`🚀 Al-Arabi API server running on port ${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
  logger.info(`📊 API Version: ${config.apiVersion}`);
});

module.exports = app;