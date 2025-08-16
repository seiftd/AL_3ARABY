const crypto = require('crypto');

/**
 * Generate a 6-digit OTP
 * @returns {string} 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate a secure random OTP using crypto
 * @returns {string} 6-digit OTP
 */
const generateSecureOTP = () => {
  const buffer = crypto.randomBytes(3);
  const otp = parseInt(buffer.toString('hex'), 16) % 1000000;
  return otp.toString().padStart(6, '0');
};

/**
 * Validate OTP format
 * @param {string} otp - OTP to validate
 * @returns {boolean} True if valid format
 */
const validateOTPFormat = (otp) => {
  return /^\d{6}$/.test(otp);
};

/**
 * Check if OTP is expired
 * @param {Date} expiresAt - Expiration timestamp
 * @returns {boolean} True if expired
 */
const isOTPExpired = (expiresAt) => {
  return new Date() > new Date(expiresAt);
};

/**
 * Calculate OTP expiration time
 * @param {number} minutesFromNow - Minutes from current time
 * @returns {Date} Expiration timestamp
 */
const getOTPExpiration = (minutesFromNow = 10) => {
  return new Date(Date.now() + minutesFromNow * 60 * 1000);
};

module.exports = {
  generateOTP,
  generateSecureOTP,
  validateOTPFormat,
  isOTPExpired,
  getOTPExpiration
};