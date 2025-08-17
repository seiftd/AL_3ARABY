const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const db = require('../database');
const walletService = require('./walletService');

class PaymentService {
  constructor() {
    this.gateways = {
      stripe: this.processStripePayment.bind(this),
      baridimob: this.processBaridiMobPayment.bind(this),
      stcpay: this.processSTCPayPayment.bind(this),
      fawry: this.processFawryPayment.bind(this),
      telr: this.processTelrPayment.bind(this),
      geyb: this.processGeybWalletPayment.bind(this)
    };

    this.currencyGatewayMapping = {
      'DZD': ['baridimob', 'stripe'],
      'SAR': ['stcpay', 'stripe', 'geyb'],
      'EGP': ['fawry', 'stripe'],
      'AED': ['telr', 'stripe'],
      'USD': ['stripe', 'telr']
    };
  }

  /**
   * Process payment through selected gateway
   */
  async processPayment(paymentData, gateway) {
    try {
      logger.info(`Processing payment via ${gateway}:`, {
        amount: paymentData.amount,
        currency: paymentData.currency,
        order_id: paymentData.order_id
      });

      if (!this.gateways[gateway]) {
        throw new Error(`Unsupported payment gateway: ${gateway}`);
      }

      // Create transaction record
      const transaction = await this.createTransaction(paymentData, gateway);
      
      // Process payment through gateway
      const result = await this.gateways[gateway](paymentData, transaction.id);
      
      // Update transaction with gateway response
      await this.updateTransaction(transaction.id, result);
      
      return {
        transaction_id: transaction.id,
        gateway_transaction_id: result.gateway_transaction_id,
        status: result.status,
        payment_url: result.payment_url,
        ...result
      };
    } catch (error) {
      logger.error('Payment processing error:', error);
      throw error;
    }
  }

  /**
   * BaridiMob Payment Gateway (Algeria)
   */
  async processBaridiMobPayment(paymentData, transactionId) {
    try {
      const { amount, currency, order_id, customer_phone, return_url } = paymentData;
      
      if (currency !== 'DZD') {
        throw new Error('BaridiMob only supports DZD currency');
      }

      const payload = {
        merchant_id: config.payments.baridimob.merchantId,
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'DZD',
        order_id: order_id,
        customer_phone: customer_phone,
        description: `Order payment ${order_id}`,
        return_url: return_url,
        callback_url: `${config.app.baseUrl}/api/v1/payments/webhook/baridimob`,
        timestamp: Date.now()
      };

      // Generate signature
      payload.signature = this.generateBaridiMobSignature(payload);

      const response = await axios.post(
        `${config.payments.baridimob.apiUrl}/v1/payments/create`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.payments.baridimob.secretKey}`
          },
          timeout: 30000
        }
      );

      if (response.data.status === 'success') {
        return {
          status: 'pending',
          gateway_transaction_id: response.data.payment_id,
          payment_url: response.data.payment_url,
          expires_at: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
        };
      } else {
        throw new Error(`BaridiMob payment failed: ${response.data.message}`);
      }
    } catch (error) {
      logger.error('BaridiMob payment error:', error);
      throw new Error(`BaridiMob payment failed: ${error.message}`);
    }
  }

  /**
   * STC Pay Payment Gateway (Saudi Arabia)
   */
  async processSTCPayPayment(paymentData, transactionId) {
    try {
      const { amount, currency, order_id, customer_phone, return_url } = paymentData;
      
      if (currency !== 'SAR') {
        throw new Error('STC Pay only supports SAR currency');
      }

      const payload = {
        MerchantId: config.payments.stcpay.merchantId,
        Amount: amount,
        Currency: 'SAR',
        MerchantReference: order_id,
        CustomerMobile: customer_phone,
        Description: `Service order ${order_id}`,
        ReturnUrl: return_url,
        NotificationUrl: `${config.app.baseUrl}/api/v1/payments/webhook/stcpay`,
        Timestamp: new Date().toISOString()
      };

      // Generate signature
      payload.Signature = this.generateSTCPaySignature(payload);

      const response = await axios.post(
        `${config.payments.stcpay.apiUrl}/DirectPayment/PaymentRequest`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.payments.stcpay.accessToken}`
          },
          timeout: 30000
        }
      );

      if (response.data.ResponseCode === '0000') {
        return {
          status: 'pending',
          gateway_transaction_id: response.data.BranchId,
          payment_url: response.data.RedirectUrl,
          expires_at: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes for STC Pay
        };
      } else {
        throw new Error(`STC Pay payment failed: ${response.data.ResponseMessage}`);
      }
    } catch (error) {
      logger.error('STC Pay payment error:', error);
      throw new Error(`STC Pay payment failed: ${error.message}`);
    }
  }

  /**
   * Fawry Payment Gateway (Egypt)
   */
  async processFawryPayment(paymentData, transactionId) {
    try {
      const { amount, currency, order_id, customer_phone, customer_email, return_url } = paymentData;
      
      if (currency !== 'EGP') {
        throw new Error('Fawry only supports EGP currency');
      }

      const payload = {
        merchantCode: config.payments.fawry.merchantCode,
        merchantRefNum: order_id,
        customerMobile: customer_phone,
        customerEmail: customer_email,
        amount: amount,
        currencyCode: 'EGP',
        description: `Al-Arabi Service Payment ${order_id}`,
        returnUrl: return_url,
        authCaptureModePayment: false,
        paymentExpiry: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
        chargeItems: [{
          itemId: `service_${order_id}`,
          description: 'Service Payment',
          price: amount,
          quantity: 1
        }]
      };

      // Generate signature
      payload.signature = this.generateFawrySignature(payload);

      const response = await axios.post(
        `${config.payments.fawry.apiUrl}/ECommerceWeb/Fawry/payments/charge`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data.statusCode === 200) {
        return {
          status: 'pending',
          gateway_transaction_id: response.data.referenceNumber,
          payment_url: `${config.payments.fawry.paymentUrl}?payment_token=${response.data.referenceNumber}`,
          reference_number: response.data.referenceNumber,
          expires_at: new Date(payload.paymentExpiry)
        };
      } else {
        throw new Error(`Fawry payment failed: ${response.data.statusDescription}`);
      }
    } catch (error) {
      logger.error('Fawry payment error:', error);
      throw new Error(`Fawry payment failed: ${error.message}`);
    }
  }

  /**
   * Telr Payment Gateway (UAE)
   */
  async processTelrPayment(paymentData, transactionId) {
    try {
      const { amount, currency, order_id, customer_name, customer_email, return_url } = paymentData;
      
      if (!['AED', 'USD'].includes(currency)) {
        throw new Error('Telr supports only AED and USD currencies');
      }

      const payload = {
        method: 'create',
        store: config.payments.telr.storeId,
        authkey: config.payments.telr.authKey,
        order: {
          cartid: order_id,
          test: config.nodeEnv === 'development' ? 1 : 0,
          amount: amount,
          currency: currency,
          description: `Al-Arabi Service Payment ${order_id}`
        },
        billing: {
          name: {
            forenames: customer_name?.split(' ')[0] || 'Customer',
            surname: customer_name?.split(' ')[1] || 'User'
          },
          email: customer_email
        },
        return: {
          authorised: return_url,
          declined: return_url,
          cancelled: return_url
        }
      };

      const response = await axios.post(
        `${config.payments.telr.apiUrl}/gateway/order.json`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data.order && response.data.order.ref) {
        return {
          status: 'pending',
          gateway_transaction_id: response.data.order.ref,
          payment_url: response.data.order.url,
          expires_at: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
        };
      } else {
        throw new Error(`Telr payment failed: ${response.data.error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Telr payment error:', error);
      throw new Error(`Telr payment failed: ${error.message}`);
    }
  }

  /**
   * Geyb Al-Arabi Wallet Payment
   */
  async processGeybWalletPayment(paymentData, transactionId) {
    try {
      const { amount, currency, order_id, user_id, wallet_pin } = paymentData;

      // Verify wallet PIN
      await walletService.verifyWalletPIN(user_id, wallet_pin);

      // Get seller from order
      const order = await db.findById('orders', order_id);
      if (!order) {
        throw new Error('Order not found');
      }

      // Process wallet payment
      const walletTransaction = await walletService.processOrderPayment(
        order_id,
        user_id,
        order.seller_id,
        amount,
        currency
      );

      return {
        status: 'completed',
        gateway_transaction_id: walletTransaction.transaction_number,
        payment_method: 'geyb_wallet',
        processed_at: new Date()
      };
    } catch (error) {
      logger.error('Geyb wallet payment error:', error);
      throw new Error(`Wallet payment failed: ${error.message}`);
    }
  }

  /**
   * Stripe Payment (International fallback)
   */
  async processStripePayment(paymentData, transactionId) {
    try {
      const stripe = require('stripe')(config.payments.stripe.secretKey);
      const { amount, currency, order_id, customer_email, return_url } = paymentData;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Al-Arabi Service Order ${order_id}`,
              description: 'Service marketplace payment'
            },
            unit_amount: Math.round(amount * 100) // Convert to cents
          },
          quantity: 1
        }],
        mode: 'payment',
        customer_email: customer_email,
        success_url: `${return_url}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: return_url,
        metadata: {
          order_id: order_id,
          transaction_id: transactionId
        },
        expires_at: Math.floor(Date.now() / 1000) + (30 * 60) // 30 minutes
      });

      return {
        status: 'pending',
        gateway_transaction_id: session.id,
        payment_url: session.url,
        expires_at: new Date(session.expires_at * 1000)
      };
    } catch (error) {
      logger.error('Stripe payment error:', error);
      throw new Error(`Stripe payment failed: ${error.message}`);
    }
  }

  /**
   * Get recommended payment gateways based on currency and country
   */
  getRecommendedGateways(currency, country) {
    const countryGateways = {
      'DZ': ['baridimob'],  // Algeria
      'SA': ['stcpay', 'geyb'],     // Saudi Arabia
      'EG': ['fawry'],      // Egypt
      'AE': ['telr'],       // UAE
      'QA': ['telr'],       // Qatar
      'KW': ['telr'],       // Kuwait
      'BH': ['telr'],       // Bahrain
      'OM': ['telr']        // Oman
    };

    const currencyGateways = this.currencyGatewayMapping[currency] || ['stripe'];
    const countrySpecific = countryGateways[country] || [];

    // Merge and prioritize country-specific gateways
    const recommended = [...new Set([...countrySpecific, ...currencyGateways])];
    
    return recommended.filter(gateway => this.gateways[gateway]);
  }

  /**
   * Handle payment webhook notifications
   */
  async handleWebhook(gateway, payload, signature) {
    try {
      let verification = false;
      let transactionData = {};

      switch (gateway) {
        case 'baridimob':
          verification = this.verifyBaridiMobWebhook(payload, signature);
          if (verification) {
            transactionData = {
              gateway_transaction_id: payload.payment_id,
              status: payload.status === 'completed' ? 'completed' : 'failed',
              gateway_response: payload
            };
          }
          break;

        case 'stcpay':
          verification = this.verifySTCPayWebhook(payload, signature);
          if (verification) {
            transactionData = {
              gateway_transaction_id: payload.BranchId,
              status: payload.STCPayPmtReference ? 'completed' : 'failed',
              gateway_response: payload
            };
          }
          break;

        case 'fawry':
          verification = this.verifyFawryWebhook(payload, signature);
          if (verification) {
            transactionData = {
              gateway_transaction_id: payload.fawryRefNumber,
              status: payload.orderStatus === 'PAID' ? 'completed' : 'failed',
              gateway_response: payload
            };
          }
          break;

        case 'telr':
          verification = this.verifyTelrWebhook(payload, signature);
          if (verification) {
            transactionData = {
              gateway_transaction_id: payload.cartid,
              status: payload.status === 'A' ? 'completed' : 'failed',
              gateway_response: payload
            };
          }
          break;

        case 'stripe':
          verification = this.verifyStripeWebhook(payload, signature);
          if (verification && payload.type === 'checkout.session.completed') {
            transactionData = {
              gateway_transaction_id: payload.data.object.id,
              status: 'completed',
              gateway_response: payload
            };
          }
          break;
      }

      if (!verification) {
        throw new Error('Webhook signature verification failed');
      }

      // Update transaction status
      await this.updateTransactionByGatewayId(
        transactionData.gateway_transaction_id,
        transactionData
      );

      // If payment completed, handle order completion
      if (transactionData.status === 'completed') {
        await this.handlePaymentSuccess(transactionData.gateway_transaction_id);
      }

      return { success: true };
    } catch (error) {
      logger.error(`${gateway} webhook error:`, error);
      throw error;
    }
  }

  /**
   * Helper methods for signature generation and verification
   */
  generateBaridiMobSignature(data) {
    const signString = `${data.merchant_id}${data.amount}${data.currency}${data.order_id}${config.payments.baridimob.secretKey}`;
    return crypto.createHash('sha256').update(signString).digest('hex');
  }

  generateSTCPaySignature(data) {
    const signString = Object.keys(data)
      .filter(key => key !== 'Signature')
      .sort()
      .map(key => `${key}=${data[key]}`)
      .join('&') + config.payments.stcpay.secretKey;
    return crypto.createHash('sha256').update(signString).digest('hex');
  }

  generateFawrySignature(data) {
    const signString = `${data.merchantCode}${data.merchantRefNum}${data.amount}${config.payments.fawry.securityKey}`;
    return crypto.createHash('sha256').update(signString).digest('hex');
  }

  verifyBaridiMobWebhook(payload, signature) {
    const expectedSignature = this.generateBaridiMobSignature(payload);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  verifySTCPayWebhook(payload, signature) {
    const expectedSignature = this.generateSTCPaySignature(payload);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  verifyFawryWebhook(payload, signature) {
    const expectedSignature = this.generateFawrySignature(payload);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  verifyTelrWebhook(payload, signature) {
    const signString = `${payload.cartid}${payload.status}${config.payments.telr.authKey}`;
    const expectedSignature = crypto.createHash('sha256').update(signString).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  verifyStripeWebhook(payload, signature) {
    const stripe = require('stripe')(config.payments.stripe.secretKey);
    try {
      stripe.webhooks.constructEvent(payload, signature, config.payments.stripe.webhookSecret);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Database helper methods
   */
  async createTransaction(paymentData, gateway) {
    const transactionData = {
      order_id: paymentData.order_id,
      from_user_id: paymentData.user_id,
      amount: paymentData.amount,
      currency: paymentData.currency,
      payment_gateway: gateway,
      transaction_type: 'order_payment',
      status: 'pending',
      description: `Order payment via ${gateway}`,
      metadata: paymentData
    };

    return await db.create('transactions', transactionData);
  }

  async updateTransaction(transactionId, updateData) {
    return await db.update('transactions', transactionId, {
      ...updateData,
      updated_at: new Date()
    });
  }

  async updateTransactionByGatewayId(gatewayTransactionId, updateData) {
    const result = await db.query(`
      UPDATE transactions 
      SET status = $1, gateway_response = $2, updated_at = NOW()
      WHERE gateway_transaction_id = $3
      RETURNING *
    `, [updateData.status, updateData.gateway_response, gatewayTransactionId]);

    return result.rows[0];
  }

  async handlePaymentSuccess(gatewayTransactionId) {
    try {
      // Get transaction details
      const transaction = await db.findOne('transactions', {
        gateway_transaction_id: gatewayTransactionId
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Update order payment status
      await db.update('orders', transaction.order_id, {
        payment_status: 'paid',
        status: 'active',
        updated_at: new Date()
      });

      // Send notifications
      const order = await db.findById('orders', transaction.order_id);
      
      // Notify buyer
      // Notify seller
      // This would be handled by notification service

      logger.info(`Payment successful for order ${transaction.order_id}`);
    } catch (error) {
      logger.error('Error handling payment success:', error);
      throw error;
    }
  }
}

module.exports = new PaymentService();