const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const config = require('../config');
const db = require('../database');
const logger = require('../utils/logger');
const smsService = require('../services/smsService');
const { generateOTP, validateOTP } = require('../utils/otp');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * Generate OTP for phone verification
 * POST /api/v1/auth/generate-otp
 */
router.post('/generate-otp', [
  body('phone')
    .isMobilePhone('any')
    .withMessage('Phone number must be valid')
    .withMessage('رقم الهاتف يجب أن يكون صحيحاً'),
  body('purpose')
    .isIn(['registration', 'login', 'password_reset', 'phone_verification'])
    .withMessage('Invalid OTP purpose')
    .withMessage('غرض رمز التحقق غير صحيح')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        message_ar: 'فشل في التحقق من البيانات',
        errors: errors.array()
      });
    }

    const { phone, purpose } = req.body;

    // Check if user exists for login/password reset
    if (purpose === 'login' || purpose === 'password_reset') {
      const existingUser = await db.query(
        'SELECT id FROM users WHERE phone = $1 AND is_active = true',
        [phone]
      );

      if (existingUser.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          message_ar: 'المستخدم غير موجود'
        });
      }
    }

    // Check if user already exists for registration
    if (purpose === 'registration') {
      const existingUser = await db.query(
        'SELECT id FROM users WHERE phone = $1',
        [phone]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Phone number already registered',
          message_ar: 'رقم الهاتف مسجل مسبقاً'
        });
      }
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    await db.query(
      'INSERT INTO otp_codes (phone, code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [phone, otp, purpose, expiresAt]
    );

    // Send OTP via SMS
    const message = `رمز التحقق الخاص بك في العرّبي: ${otp}. صالح لمدة 10 دقائق.`;
    const messageEn = `Your Al-Arabi verification code: ${otp}. Valid for 10 minutes.`;
    
    await smsService.sendSMS(phone, message, messageEn);

    logger.info(`OTP generated for phone ${phone}, purpose: ${purpose}`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      message_ar: 'تم إرسال رمز التحقق بنجاح',
      data: {
        phone,
        expiresAt: expiresAt.toISOString()
      }
    });

  } catch (error) {
    logger.error('Generate OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      message_ar: 'خطأ في الخادم الداخلي'
    });
  }
});

/**
 * Verify OTP and register user
 * POST /api/v1/auth/register
 */
router.post('/register', [
  body('phone').isMobilePhone('any').withMessage('Phone number must be valid'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('first_name').trim().isLength({ min: 2 }).withMessage('First name is required'),
  body('last_name').trim().isLength({ min: 2 }).withMessage('Last name is required'),
  body('email').optional().isEmail().withMessage('Email must be valid'),
  body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('preferred_language').optional().isIn(['ar', 'en']).withMessage('Language must be ar or en')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        message_ar: 'فشل في التحقق من البيانات',
        errors: errors.array()
      });
    }

    const { phone, otp, first_name, last_name, first_name_ar, last_name_ar, email, password, preferred_language = 'ar' } = req.body;

    // Verify OTP
    const otpRecord = await db.query(
      'SELECT * FROM otp_codes WHERE phone = $1 AND code = $2 AND purpose = $3 AND expires_at > NOW() AND used_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [phone, otp, 'registration']
    );

    if (otpRecord.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
        message_ar: 'رمز التحقق غير صحيح أو منتهي الصلاحية'
      });
    }

    // Mark OTP as used
    await db.query(
      'UPDATE otp_codes SET used_at = NOW() WHERE id = $1',
      [otpRecord.rows[0].id]
    );

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    // Create user
    const userData = {
      phone,
      first_name,
      last_name,
      first_name_ar,
      last_name_ar,
      email,
      password_hash: passwordHash,
      preferred_language,
      is_verified: true,
      is_active: true
    };

    const newUser = await db.create('users', userData);

    // Generate JWT tokens
    const accessToken = jwt.sign(
      { userId: newUser.id, phone: newUser.phone },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const refreshToken = jwt.sign(
      { userId: newUser.id },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    // Remove sensitive data
    delete newUser.password_hash;

    logger.info(`New user registered: ${newUser.id}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      message_ar: 'تم تسجيل المستخدم بنجاح',
      data: {
        user: newUser,
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken
        }
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      message_ar: 'خطأ في الخادم الداخلي'
    });
  }
});

/**
 * Login with OTP
 * POST /api/v1/auth/login
 */
router.post('/login', [
  body('phone').isMobilePhone('any').withMessage('Phone number must be valid'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        message_ar: 'فشل في التحقق من البيانات',
        errors: errors.array()
      });
    }

    const { phone, otp } = req.body;

    // Verify OTP
    const otpRecord = await db.query(
      'SELECT * FROM otp_codes WHERE phone = $1 AND code = $2 AND purpose = $3 AND expires_at > NOW() AND used_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [phone, otp, 'login']
    );

    if (otpRecord.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
        message_ar: 'رمز التحقق غير صحيح أو منتهي الصلاحية'
      });
    }

    // Mark OTP as used
    await db.query(
      'UPDATE otp_codes SET used_at = NOW() WHERE id = $1',
      [otpRecord.rows[0].id]
    );

    // Get user
    const user = await db.query(
      'SELECT * FROM users WHERE phone = $1 AND is_active = true',
      [phone]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        message_ar: 'المستخدم غير موجود'
      });
    }

    const userData = user.rows[0];

    // Update last login
    await db.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [userData.id]
    );

    // Generate JWT tokens
    const accessToken = jwt.sign(
      { userId: userData.id, phone: userData.phone },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const refreshToken = jwt.sign(
      { userId: userData.id },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    // Remove sensitive data
    delete userData.password_hash;

    logger.info(`User logged in: ${userData.id}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      message_ar: 'تم تسجيل الدخول بنجاح',
      data: {
        user: userData,
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken
        }
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      message_ar: 'خطأ في الخادم الداخلي'
    });
  }
});

/**
 * Refresh JWT token
 * POST /api/v1/auth/refresh
 */
router.post('/refresh', [
  body('refresh_token').notEmpty().withMessage('Refresh token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        message_ar: 'فشل في التحقق من البيانات',
        errors: errors.array()
      });
    }

    const { refresh_token } = req.body;

    // Verify refresh token
    const decoded = jwt.verify(refresh_token, config.jwt.refreshSecret);

    // Get user
    const user = await db.findById('users', decoded.userId);
    if (!user || !user.is_active) {
      return res.status(404).json({
        success: false,
        message: 'User not found or inactive',
        message_ar: 'المستخدم غير موجود أو غير نشط'
      });
    }

    // Generate new access token
    const accessToken = jwt.sign(
      { userId: user.id, phone: user.phone },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      message_ar: 'تم تحديث الرمز المميز بنجاح',
      data: {
        access_token: accessToken
      }
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token',
      message_ar: 'رمز التحديث غير صحيح'
    });
  }
});

/**
 * Logout
 * POST /api/v1/auth/logout
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    // In a production environment, you might want to blacklist the token
    // For now, we'll just return success
    
    logger.info(`User logged out: ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      message_ar: 'تم تسجيل الخروج بنجاح'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      message_ar: 'خطأ في الخادم الداخلي'
    });
  }
});

/**
 * Get current user profile
 * GET /api/v1/auth/me
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db.findById('users', req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        message_ar: 'المستخدم غير موجود'
      });
    }

    // Remove sensitive data
    delete user.password_hash;

    res.status(200).json({
      success: true,
      data: { user }
    });

  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      message_ar: 'خطأ في الخادم الداخلي'
    });
  }
});

module.exports = router;