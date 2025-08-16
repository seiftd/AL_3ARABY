const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../database');
const logger = require('../utils/logger');

/**
 * Authenticate JWT token middleware
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
        message_ar: 'رمز الوصول مطلوب'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Get user from database
    const user = await db.findById('users', decoded.userId);
    
    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or inactive user',
        message_ar: 'مستخدم غير صحيح أو غير نشط'
      });
    }

    // Remove sensitive data
    delete user.password_hash;

    // Attach user to request object
    req.user = user;
    req.token = token;

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        message_ar: 'رمز غير صحيح'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        message_ar: 'انتهت صلاحية الرمز'
      });
    }

    logger.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      message_ar: 'خطأ في الخادم الداخلي'
    });
  }
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without user
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await db.findById('users', decoded.userId);
      
      if (user && user.is_active) {
        delete user.password_hash;
        req.user = user;
        req.token = token;
      }
    } catch (tokenError) {
      // Ignore token errors for optional auth
      logger.debug('Optional auth token error:', tokenError.message);
    }

    next();

  } catch (error) {
    logger.error('Optional authentication middleware error:', error);
    next(); // Continue without user
  }
};

/**
 * Role-based authorization middleware
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        message_ar: 'المصادقة مطلوبة'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        message_ar: 'صلاحيات غير كافية'
      });
    }

    next();
  };
};

/**
 * Resource ownership authorization
 */
const authorizeOwnership = (resourceUserIdField = 'user_id') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          message_ar: 'المصادقة مطلوبة'
        });
      }

      // Admin can access all resources
      if (req.user.role === 'admin' || req.user.role === 'super_admin') {
        return next();
      }

      // For GET requests, we might need to check the resource
      const resourceId = req.params.id;
      if (resourceId && req.method === 'GET') {
        // This would need to be customized based on the resource type
        // For now, we'll skip this check
        return next();
      }

      // For POST/PUT/PATCH requests, check if user owns the resource
      if (req.body && req.body[resourceUserIdField]) {
        if (req.body[resourceUserIdField] !== req.user.id) {
          return res.status(403).json({
            success: false,
            message: 'Access denied',
            message_ar: 'تم رفض الوصول'
          });
        }
      }

      next();

    } catch (error) {
      logger.error('Ownership authorization error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        message_ar: 'خطأ في الخادم الداخلي'
      });
    }
  };
};

module.exports = {
  authenticate,
  optionalAuth,
  authorize,
  authorizeOwnership
};