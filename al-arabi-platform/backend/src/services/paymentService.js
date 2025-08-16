const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const db = require('../database');

class PaymentService {
  constructor() {
    this.gateways = {
      stripe: this.processStripePayment.bind(this),
      paypal: this.processPayPalPayment.bind(this),
      baridimob: this.processBaridiMobPayment.bind(this),
      stcpay: this.processSTCPayPayment.bind(this),
      fawry: this.processFawryPayment.bind(this),
      telr: this.processTelrPayment.bind(this)
    };
  }

  /**
   * Process payment using the specified gateway
   * @param {Object} paymentData - Payment information
   * @param {string} gateway - Payment gateway to use
   * @returns {Promise} Payment result
   */
  async processPayment(paymentData, gateway) {
    try {
      if (!this.gateways[gateway]) {
        throw new Error(`Payment gateway ${gateway} not supported`);
      }

      logger.info(`Processing payment via ${gateway}:`, {
        orderId: paymentData.orderId,
        amount: paymentData.amount,
        currency: paymentData.currency
      });

      // Create payment transaction record
      const transaction = await db.create('payment_transactions', {
        order_id: paymentData.orderId,
        gateway,
        amount: paymentData.amount,
        currency: paymentData.currency,
        status: 'pending'
      });

      const result = await this.gateways[gateway](paymentData, transaction.id);

      // Update transaction with gateway response
      await db.update('payment_transactions', transaction.id, {
        gateway_transaction_id: result.transactionId,
        status: result.status,
        gateway_response: result.rawResponse
      });

      return {
        success: result.status === 'success',
        transactionId: transaction.id,
        gatewayTransactionId: result.transactionId,
        status: result.status,
        redirectUrl: result.redirectUrl,
        message: result.message
      };

    } catch (error) {
      logger.error('Payment processing error:', error);
      throw error;
    }
  }

  /**
   * Process Stripe payment
   * @param {Object} paymentData - Payment data
   * @param {string} transactionId - Internal transaction ID
   * @returns {Promise} Payment result
   */
  async processStripePayment(paymentData, transactionId) {
    const stripe = require('stripe')(config.payments.stripe.secretKey);

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(paymentData.amount * 100), // Convert to cents
        currency: paymentData.currency.toLowerCase(),
        payment_method: paymentData.paymentMethodId,
        confirmation_method: 'manual',
        confirm: true,
        metadata: {
          orderId: paymentData.orderId,
          transactionId
        }
      });

      return {
        transactionId: paymentIntent.id,
        status: paymentIntent.status === 'succeeded' ? 'success' : 'pending',
        clientSecret: paymentIntent.client_secret,
        rawResponse: paymentIntent
      };

    } catch (error) {
      return {
        transactionId: null,
        status: 'failed',
        message: error.message,
        rawResponse: error
      };
    }
  }

  /**
   * Process BaridiMob payment (Algeria)
   * @param {Object} paymentData - Payment data
   * @param {string} transactionId - Internal transaction ID
   * @returns {Promise} Payment result
   */
  async processBaridiMobPayment(paymentData, transactionId) {
    try {
      const orderRef = `AL${Date.now()}${Math.random().toString(36).substring(7)}`;
      
      const requestData = {
        merchant_id: config.payments.baridimob.merchantId,
        order_ref: orderRef,
        amount: paymentData.amount,
        currency: 'DZD',
        description: `Al-Arabi Order #${paymentData.orderId}`,
        customer_name: paymentData.customerName,
        customer_email: paymentData.customerEmail,
        customer_phone: paymentData.customerPhone,
        return_url: `${config.baseUrl}/payment/baridimob/return`,
        cancel_url: `${config.baseUrl}/payment/baridimob/cancel`,
        notify_url: `${config.baseUrl}/api/v1/payments/baridimob/webhook`
      };

      // Generate signature
      const signature = this.generateBaridiMobSignature(requestData);
      requestData.signature = signature;

      const response = await axios.post(
        `${config.payments.baridimob.apiUrl}/payment/init`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data.status === 'success') {
        return {
          transactionId: response.data.payment_id,
          status: 'pending',
          redirectUrl: response.data.payment_url,
          rawResponse: response.data
        };
      } else {
        throw new Error(response.data.message || 'BaridiMob payment failed');
      }

    } catch (error) {
      return {
        transactionId: null,
        status: 'failed',
        message: error.message,
        rawResponse: error.response?.data || error
      };
    }
  }

  /**
   * Process STC Pay payment (Saudi Arabia)
   * @param {Object} paymentData - Payment data
   * @param {string} transactionId - Internal transaction ID
   * @returns {Promise} Payment result
   */
  async processSTCPayPayment(paymentData, transactionId) {
    try {
      const merchantRefNum = `AL${Date.now()}`;
      
      const requestData = {
        MerchantId: config.payments.stcPay.merchantId,
        MerchantRefNum: merchantRefNum,
        Amount: paymentData.amount,
        CurrencyCode: 'SAR',
        MobileNo: paymentData.customerPhone,
        STCPayPmtRef: '', // Will be provided by customer
        BillNumber: paymentData.orderId,
        OrderInfo: `Al-Arabi Ticket Order`,
        CallBackUrl: `${config.baseUrl}/api/v1/payments/stcpay/callback`,
        Signature: ''
      };

      // Generate signature
      const signature = this.generateSTCPaySignature(requestData);
      requestData.Signature = signature;

      const response = await axios.post(
        `${config.payments.stcPay.apiUrl}/DirectPayment/PaymentInquiry`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data.Status === '0000') {
        return {
          transactionId: response.data.STCPayRefNum,
          status: 'pending',
          paymentReference: response.data.STCPayRefNum,
          rawResponse: response.data
        };
      } else {
        throw new Error(response.data.StatusDesc || 'STC Pay payment failed');
      }

    } catch (error) {
      return {
        transactionId: null,
        status: 'failed',
        message: error.message,
        rawResponse: error.response?.data || error
      };
    }
  }

  /**
   * Process Fawry payment (Egypt)
   * @param {Object} paymentData - Payment data
   * @param {string} transactionId - Internal transaction ID
   * @returns {Promise} Payment result
   */
  async processFawryPayment(paymentData, transactionId) {
    try {
      const merchantRefNum = `AL${Date.now()}`;
      
      const requestData = {
        merchantCode: config.payments.fawry.merchantCode,
        merchantRefNum,
        customerMobile: paymentData.customerPhone,
        customerEmail: paymentData.customerEmail,
        paymentMethod: 'PAYATFAWRY',
        amount: paymentData.amount,
        currencyCode: 'EGP',
        description: `Al-Arabi Event Tickets`,
        language: 'ar-eg',
        chargeItems: [{
          itemId: paymentData.orderId,
          description: 'Event Tickets',
          price: paymentData.amount,
          quantity: 1
        }]
      };

      // Generate signature
      const signature = this.generateFawrySignature(requestData);
      requestData.signature = signature;

      const response = await axios.post(
        `${config.payments.fawry.apiUrl}/ECommerceWeb/Fawry/payments/charge`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data.statusCode === 200) {
        return {
          transactionId: response.data.referenceNumber,
          status: 'pending',
          paymentCode: response.data.fawryRefNumber,
          rawResponse: response.data
        };
      } else {
        throw new Error(response.data.statusDescription || 'Fawry payment failed');
      }

    } catch (error) {
      return {
        transactionId: null,
        status: 'failed',
        message: error.message,
        rawResponse: error.response?.data || error
      };
    }
  }

  /**
   * Process Telr payment (UAE)
   * @param {Object} paymentData - Payment data
   * @param {string} transactionId - Internal transaction ID
   * @returns {Promise} Payment result
   */
  async processTelrPayment(paymentData, transactionId) {
    try {
      const requestData = {
        ivp_store: config.payments.telr.storeId,
        ivp_authkey: config.payments.telr.authKey,
        ivp_amount: paymentData.amount,
        ivp_currency: 'AED',
        ivp_cart: paymentData.orderId,
        ivp_desc: 'Al-Arabi Event Tickets',
        ivp_test: config.nodeEnv === 'development' ? '1' : '0',
        return_auth: `${config.baseUrl}/payment/telr/success`,
        return_can: `${config.baseUrl}/payment/telr/cancel`,
        return_decl: `${config.baseUrl}/payment/telr/decline`
      };

      const response = await axios.post(
        `${config.payments.telr.apiUrl}/gateway/order.json`,
        new URLSearchParams(requestData),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 30000
        }
      );

      if (response.data.order && response.data.order.ref) {
        return {
          transactionId: response.data.order.ref,
          status: 'pending',
          redirectUrl: response.data.order.url,
          rawResponse: response.data
        };
      } else {
        throw new Error('Telr payment initialization failed');
      }

    } catch (error) {
      return {
        transactionId: null,
        status: 'failed',
        message: error.message,
        rawResponse: error.response?.data || error
      };
    }
  }

  /**
   * Generate BaridiMob signature
   * @param {Object} data - Request data
   * @returns {string} Signature
   */
  generateBaridiMobSignature(data) {
    const params = [
      data.merchant_id,
      data.order_ref,
      data.amount,
      data.currency,
      config.payments.baridimob.secretKey
    ];
    
    return crypto
      .createHash('sha256')
      .update(params.join(''))
      .digest('hex');
  }

  /**
   * Generate STC Pay signature
   * @param {Object} data - Request data
   * @returns {string} Signature
   */
  generateSTCPaySignature(data) {
    const params = [
      data.MerchantId,
      data.MerchantRefNum,
      data.Amount,
      data.CurrencyCode,
      data.MobileNo,
      config.payments.stcPay.secretKey
    ];
    
    return crypto
      .createHash('sha512')
      .update(params.join(''))
      .digest('hex');
  }

  /**
   * Generate Fawry signature
   * @param {Object} data - Request data
   * @returns {string} Signature
   */
  generateFawrySignature(data) {
    const params = [
      data.merchantCode,
      data.merchantRefNum,
      data.customerMobile,
      data.paymentMethod,
      data.amount,
      config.payments.fawry.secretKey
    ];
    
    return crypto
      .createHash('sha256')
      .update(params.join(''))
      .digest('hex');
  }

  /**
   * Verify payment webhook signature
   * @param {Object} data - Webhook data
   * @param {string} signature - Provided signature
   * @param {string} gateway - Payment gateway
   * @returns {boolean} Signature valid
   */
  verifyWebhookSignature(data, signature, gateway) {
    try {
      let expectedSignature;
      
      switch (gateway) {
        case 'baridimob':
          expectedSignature = this.generateBaridiMobSignature(data);
          break;
        case 'stcpay':
          expectedSignature = this.generateSTCPaySignature(data);
          break;
        case 'fawry':
          expectedSignature = this.generateFawrySignature(data);
          break;
        default:
          return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      logger.error('Webhook signature verification error:', error);
      return false;
    }
  }

  /**
   * Get recommended payment gateway based on user location/currency
   * @param {string} currency - Currency code
   * @param {string} country - Country code
   * @returns {string} Recommended gateway
   */
  getRecommendedGateway(currency, country) {
    const gatewayMap = {
      'DZD': 'baridimob',  // Algeria
      'SAR': 'stcpay',     // Saudi Arabia
      'EGP': 'fawry',      // Egypt
      'AED': 'telr',       // UAE
      'USD': 'stripe',     // International
      'EUR': 'stripe'      // International
    };

    return gatewayMap[currency] || 'stripe';
  }

  /**
   * Convert currency if needed
   * @param {number} amount - Amount to convert
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Promise<number>} Converted amount
   */
  async convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    try {
      // Use external exchange rate API
      const response = await axios.get(
        `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`,
        { timeout: 5000 }
      );

      const rate = response.data.rates[toCurrency];
      if (!rate) {
        throw new Error(`Exchange rate not found for ${fromCurrency} to ${toCurrency}`);
      }

      return Math.round(amount * rate * 100) / 100;
    } catch (error) {
      logger.error('Currency conversion error:', error);
      throw new Error('Currency conversion failed');
    }
  }
}

module.exports = new PaymentService();