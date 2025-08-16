const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class SMSService {
  constructor() {
    this.providers = {
      unifonic: this.sendUnifonicSMS.bind(this),
      twilio: this.sendTwilioSMS.bind(this),
      default: this.sendUnifonicSMS.bind(this)
    };
  }

  /**
   * Send SMS using the best available provider for the region
   * @param {string} phone - Phone number with country code
   * @param {string} messageAr - Arabic message
   * @param {string} messageEn - English message (fallback)
   * @param {string} provider - Specific provider to use
   * @returns {Promise} SMS send result
   */
  async sendSMS(phone, messageAr, messageEn = null, provider = null) {
    try {
      // Determine the best provider based on phone number
      const selectedProvider = provider || this.getBestProvider(phone);
      const message = messageAr || messageEn;

      logger.info(`Sending SMS via ${selectedProvider} to ${phone}`);

      if (!this.providers[selectedProvider]) {
        throw new Error(`SMS provider ${selectedProvider} not supported`);
      }

      const result = await this.providers[selectedProvider](phone, message);
      
      logger.info(`SMS sent successfully via ${selectedProvider}: ${result.messageId || result.sid}`);
      
      return {
        success: true,
        provider: selectedProvider,
        messageId: result.messageId || result.sid,
        phone,
        message
      };

    } catch (error) {
      logger.error('SMS send error:', error);
      
      // Try fallback provider if primary fails
      if (!provider) {
        try {
          logger.info('Trying fallback SMS provider...');
          return await this.sendSMS(phone, messageAr, messageEn, 'twilio');
        } catch (fallbackError) {
          logger.error('Fallback SMS provider also failed:', fallbackError);
        }
      }

      throw new Error(`Failed to send SMS: ${error.message}`);
    }
  }

  /**
   * Send SMS via Unifonic (primary for MENA region)
   * @param {string} phone - Phone number
   * @param {string} message - Message text
   * @returns {Promise} Send result
   */
  async sendUnifonicSMS(phone, message) {
    if (!config.sms.unifonic.appSid) {
      throw new Error('Unifonic configuration missing');
    }

    const url = `${config.sms.unifonic.apiUrl}/rest/Messages/Send`;
    
    const data = {
      AppSid: config.sms.unifonic.appSid,
      Recipient: phone,
      Body: message,
      SenderID: 'Al-Arabi' // You may need to register this sender ID
    };

    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.data.success !== 'true') {
      throw new Error(`Unifonic error: ${response.data.errorCode || 'Unknown error'}`);
    }

    return {
      messageId: response.data.MessageID,
      cost: response.data.Cost,
      balance: response.data.Balance
    };
  }

  /**
   * Send SMS via Twilio (fallback provider)
   * @param {string} phone - Phone number
   * @param {string} message - Message text
   * @returns {Promise} Send result
   */
  async sendTwilioSMS(phone, message) {
    if (!config.sms.twilio.accountSid || !config.sms.twilio.authToken) {
      throw new Error('Twilio configuration missing');
    }

    const twilio = require('twilio')(
      config.sms.twilio.accountSid,
      config.sms.twilio.authToken
    );

    const result = await twilio.messages.create({
      body: message,
      from: config.sms.twilio.phoneNumber,
      to: phone
    });

    return {
      sid: result.sid,
      status: result.status,
      price: result.price,
      priceUnit: result.priceUnit
    };
  }

  /**
   * Determine the best SMS provider based on phone number
   * @param {string} phone - Phone number with country code
   * @returns {string} Provider name
   */
  getBestProvider(phone) {
    // Remove any non-digit characters and plus sign
    const cleanPhone = phone.replace(/[^\d]/g, '');
    
    // MENA region country codes - use Unifonic
    const menaCountryCodes = [
      '966', // Saudi Arabia
      '971', // UAE
      '20',  // Egypt
      '213', // Algeria
      '212', // Morocco
      '216', // Tunisia
      '218', // Libya
      '964', // Iraq
      '962', // Jordan
      '961', // Lebanon
      '970', // Palestine
      '968', // Oman
      '974', // Qatar
      '973', // Bahrain
      '965', // Kuwait
      '967'  // Yemen
    ];

    for (const code of menaCountryCodes) {
      if (cleanPhone.startsWith(code)) {
        return 'unifonic';
      }
    }

    // For other regions, use Twilio
    return 'twilio';
  }

  /**
   * Get SMS delivery status
   * @param {string} messageId - Message ID
   * @param {string} provider - Provider used
   * @returns {Promise} Delivery status
   */
  async getDeliveryStatus(messageId, provider) {
    try {
      switch (provider) {
        case 'unifonic':
          return await this.getUnifonicStatus(messageId);
        case 'twilio':
          return await this.getTwilioStatus(messageId);
        default:
          throw new Error(`Status check not supported for provider: ${provider}`);
      }
    } catch (error) {
      logger.error('SMS status check error:', error);
      throw error;
    }
  }

  /**
   * Get Unifonic message status
   * @param {string} messageId - Unifonic message ID
   * @returns {Promise} Status result
   */
  async getUnifonicStatus(messageId) {
    const url = `${config.sms.unifonic.apiUrl}/rest/Messages/GetMessageIDStatus`;
    
    const response = await axios.post(url, {
      AppSid: config.sms.unifonic.appSid,
      MessageID: messageId
    });

    return {
      messageId,
      status: response.data.DlrStatus,
      timestamp: response.data.DateCreated
    };
  }

  /**
   * Get Twilio message status
   * @param {string} sid - Twilio message SID
   * @returns {Promise} Status result
   */
  async getTwilioStatus(sid) {
    const twilio = require('twilio')(
      config.sms.twilio.accountSid,
      config.sms.twilio.authToken
    );

    const message = await twilio.messages(sid).fetch();

    return {
      messageId: sid,
      status: message.status,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      timestamp: message.dateUpdated
    };
  }

  /**
   * Send bulk SMS messages
   * @param {Array} recipients - Array of {phone, message} objects
   * @param {string} provider - Provider to use
   * @returns {Promise} Bulk send results
   */
  async sendBulkSMS(recipients, provider = null) {
    const results = [];
    const batchSize = 100; // Process in batches

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchPromises = batch.map(async (recipient) => {
        try {
          const result = await this.sendSMS(
            recipient.phone,
            recipient.messageAr,
            recipient.messageEn,
            provider
          );
          return { ...result, recipient: recipient.phone };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            recipient: recipient.phone
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value || r.reason));

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }
}

module.exports = new SMSService();