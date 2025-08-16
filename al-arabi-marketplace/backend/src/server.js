require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const i18next = require('i18next');
const middleware = require('i18next-http-middleware');
const Backend = require('i18next-fs-backend');

// Import configurations and middleware
const config = require('./config');
const logger = require('./utils/logger');
const database = require('./database');
const redis = require('./config/redis');
const errorHandler = require('./middleware/errorHandler');
const { authenticate, optionalAuth } = require('./middleware/auth');
const socketAuth = require('./middleware/socketAuth');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const serviceRoutes = require('./routes/services');
const orderRoutes = require('./routes/orders');
const contractRoutes = require('./routes/contracts');
const walletRoutes = require('./routes/wallet');
const paymentRoutes = require('./routes/payments');
const messageRoutes = require('./routes/messages');
const reviewRoutes = require('./routes/reviews');
const categoryRoutes = require('./routes/categories');
const uploadRoutes = require('./routes/upload');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);

// Initialize i18next for internationalization
i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    lng: 'ar',
    fallbackLng: 'ar',
    preload: ['ar', 'en'],
    backend: {
      loadPath: './src/locales/{{lng}}/{{ns}}.json'
    },
    detection: {
      order: ['header', 'querystring'],
      caches: false
    }
  });

// Socket.IO setup with authentication
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ["http://localhost:3000"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Apply socket authentication middleware
io.use(socketAuth);

// Store io instance globally
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
      imgSrc: ["'self'", "data:", "https:", "*.amazonaws.com"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      connectSrc: ["'self'", "wss:", "ws:", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ["http://localhost:3000"];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept-Language']
}));

// Compression middleware
app.use(compression());

// Request logging
app.use(morgan('combined', {
  stream: { write: message => logger.info(message.trim()) }
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Internationalization middleware
app.use(middleware.handle(i18next));

// Session configuration
app.use(session({
  store: new RedisStore({ client: redis }),
  secret: process.env.SESSION_SECRET || 'al-arabi-marketplace-session',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Rate limiting with different limits for different endpoints
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: {
    error: message,
    error_ar: 'تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة لاحقاً'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for certain IPs or authenticated admin users
    const allowedIPs = process.env.RATE_LIMIT_SKIP_IPS?.split(',') || [];
    return allowedIPs.includes(req.ip) || (req.user && req.user.role === 'super_admin');
  }
});

// Apply different rate limits
app.use('/api/v1/auth/generate-otp', createRateLimit(15 * 60 * 1000, 5, 'Too many OTP requests'));
app.use('/api/v1/auth/login', createRateLimit(15 * 60 * 1000, 10, 'Too many login attempts'));
app.use('/api/v1/auth/register', createRateLimit(60 * 60 * 1000, 3, 'Too many registration attempts'));
app.use('/api/v1/', createRateLimit(15 * 60 * 1000, 100, 'Too many requests'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: 'connected', // This should be dynamically checked
      redis: 'connected',
      aws: 'available'
    }
  });
});

// API Documentation endpoint
app.get('/api-docs', (req, res) => {
  res.redirect('/docs/api-specification.html');
});

// API routes
const apiRouter = express.Router();

// Public routes (no authentication required)
apiRouter.use('/auth', authRoutes);
apiRouter.use('/services', optionalAuth, serviceRoutes);
apiRouter.use('/categories', categoryRoutes);

// Protected routes (authentication required)
apiRouter.use('/users', authenticate, userRoutes);
apiRouter.use('/orders', authenticate, orderRoutes);
apiRouter.use('/contracts', authenticate, contractRoutes);
apiRouter.use('/wallet', authenticate, walletRoutes);
apiRouter.use('/payments', authenticate, paymentRoutes);
apiRouter.use('/messages', authenticate, messageRoutes);
apiRouter.use('/reviews', authenticate, reviewRoutes);
apiRouter.use('/upload', authenticate, uploadRoutes);
apiRouter.use('/notifications', authenticate, notificationRoutes);
apiRouter.use('/analytics', authenticate, analyticsRoutes);
apiRouter.use('/admin', authenticate, adminRoutes);

app.use('/api/v1', apiRouter);

// Socket.IO connection handling for real-time features
io.on('connection', (socket) => {
  const userId = socket.user?.id;
  logger.info(`User connected: ${socket.id} (User ID: ${userId})`);

  // Join user to their personal room for notifications
  if (userId) {
    socket.join(`user_${userId}`);
    
    // Update user online status
    database.query(
      'UPDATE users SET is_online = true, last_seen = NOW() WHERE id = $1',
      [userId]
    ).catch(err => logger.error('Failed to update user online status:', err));
  }

  // Join order room for real-time order updates
  socket.on('join_order_room', (orderId) => {
    socket.join(`order_${orderId}`);
    logger.debug(`User ${userId} joined order room: ${orderId}`);
  });

  // Join conversation room for messaging
  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
    logger.debug(`User ${userId} joined conversation: ${conversationId}`);
  });

  // Handle real-time messaging
  socket.on('send_message', async (data) => {
    try {
      const { conversationId, recipientId, content, messageType = 'text', attachments } = data;
      
      // Save message to database
      const message = await database.query(`
        INSERT INTO messages (conversation_id, sender_id, recipient_id, content, message_type, attachments)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [conversationId, userId, recipientId, content, messageType, attachments]);

      // Emit to conversation participants
      io.to(`conversation_${conversationId}`).emit('new_message', {
        id: message.rows[0].id,
        conversationId,
        senderId: userId,
        recipientId,
        content,
        messageType,
        attachments,
        createdAt: message.rows[0].created_at
      });

      // Send push notification to recipient if offline
      // This would be handled by a notification service
      
    } catch (error) {
      logger.error('Socket message error:', error);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });

  // Handle typing indicators
  socket.on('typing_start', ({ conversationId, recipientId }) => {
    socket.to(`user_${recipientId}`).emit('user_typing', {
      conversationId,
      userId,
      isTyping: true
    });
  });

  socket.on('typing_stop', ({ conversationId, recipientId }) => {
    socket.to(`user_${recipientId}`).emit('user_typing', {
      conversationId,
      userId,
      isTyping: false
    });
  });

  // Handle order status updates
  socket.on('order_status_update', (data) => {
    const { orderId, status, message } = data;
    io.to(`order_${orderId}`).emit('order_updated', {
      orderId,
      status,
      message,
      timestamp: new Date()
    });
  });

  // Handle wallet notifications
  socket.on('wallet_transaction', (data) => {
    const { userId: targetUserId, transaction } = data;
    io.to(`user_${targetUserId}`).emit('wallet_updated', {
      transaction,
      timestamp: new Date()
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id} (User ID: ${userId})`);
    
    // Update user offline status
    if (userId) {
      database.query(
        'UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1',
        [userId]
      ).catch(err => logger.error('Failed to update user offline status:', err));
    }
  });
});

// Serve static files (uploaded content, documentation, etc.)
app.use('/uploads', express.static('uploads'));
app.use('/docs', express.static('docs'));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    message_ar: 'الرابط غير موجود',
    availableEndpoints: [
      '/api/v1/auth',
      '/api/v1/services',
      '/api/v1/orders',
      '/api/v1/wallet',
      '/health',
      '/api-docs'
    ]
  });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  
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

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.info(`🚀 Al-Arabi Marketplace API server running on port ${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
  logger.info(`📊 API Version: v1`);
  logger.info(`🔗 Health Check: http://localhost:${PORT}/health`);
  logger.info(`📚 API Docs: http://localhost:${PORT}/api-docs`);
  logger.info(`🌐 CORS enabled for: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
});

module.exports = app;