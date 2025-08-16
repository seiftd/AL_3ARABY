const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const logger = require('../utils/logger');
const currencyService = require('./currencyService');
const notificationService = require('./notificationService');
const config = require('../config');

class WalletService {
  constructor() {
    this.supportedCurrencies = ['SAR', 'AED', 'EGP', 'DZD', 'USD'];
    this.defaultCurrency = 'SAR';
    this.maxDailyLimit = 50000; // SAR equivalent
    this.maxMonthlyLimit = 200000; // SAR equivalent
  }

  /**
   * Create a new wallet for a user
   */
  async createWallet(userId, initialCurrency = 'SAR') {
    try {
      // Check if wallet already exists
      const existingWallet = await db.findOne('wallet_accounts', { user_id: userId });
      if (existingWallet) {
        throw new Error('Wallet already exists for this user');
      }

      // Generate unique wallet number
      const walletNumber = await this.generateWalletNumber();
      
      const walletData = {
        user_id: userId,
        wallet_number: walletNumber,
        is_active: true,
        is_verified: false,
        daily_limit: this.maxDailyLimit,
        monthly_limit: this.maxMonthlyLimit,
        kyc_status: 'pending'
      };

      const wallet = await db.create('wallet_accounts', walletData);
      
      logger.info(`Wallet created for user ${userId}: ${walletNumber}`);
      
      // Generate QR code for wallet
      const qrCode = await this.generateWalletQR(walletNumber);
      
      return {
        ...wallet,
        qr_code: qrCode
      };
    } catch (error) {
      logger.error('Error creating wallet:', error);
      throw error;
    }
  }

  /**
   * Get wallet by user ID
   */
  async getWalletByUserId(userId) {
    try {
      const wallet = await db.findOne('wallet_accounts', { user_id: userId });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Get recent transactions
      const transactions = await db.query(`
        SELECT t.*, 
               CASE 
                 WHEN t.from_user_id = $1 THEN 'outgoing'
                 WHEN t.to_user_id = $1 THEN 'incoming'
               END as direction,
               u_from.first_name as from_user_name,
               u_to.first_name as to_user_name
        FROM transactions t
        LEFT JOIN users u_from ON t.from_user_id = u_from.id
        LEFT JOIN users u_to ON t.to_user_id = u_to.id
        WHERE (t.from_user_id = $1 OR t.to_user_id = $1)
          AND t.status = 'completed'
        ORDER BY t.created_at DESC
        LIMIT 20
      `, [userId]);

      // Calculate total balance in SAR equivalent
      const totalBalance = await this.calculateTotalBalance(wallet);

      return {
        ...wallet,
        total_balance_sar: totalBalance,
        recent_transactions: transactions.rows,
        qr_code: await this.generateWalletQR(wallet.wallet_number)
      };
    } catch (error) {
      logger.error('Error getting wallet:', error);
      throw error;
    }
  }

  /**
   * Top up wallet from payment gateway
   */
  async topUpWallet(userId, amount, currency, paymentGateway, gatewayTransactionId) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      const wallet = await this.getWalletByUserId(userId);
      if (!wallet.is_active) {
        throw new Error('Wallet is not active');
      }

      // Convert amount to wallet currency if needed
      const convertedAmount = await currencyService.convert(amount, currency, currency);
      
      // Create transaction record
      const transactionData = {
        from_user_id: null,
        to_user_id: userId,
        to_wallet_id: wallet.id,
        transaction_type: 'wallet_topup',
        amount: convertedAmount,
        currency: currency,
        payment_gateway: paymentGateway,
        gateway_transaction_id: gatewayTransactionId,
        status: 'completed',
        net_amount: convertedAmount,
        description: `Wallet top-up via ${paymentGateway}`,
        processed_at: new Date(),
        settled_at: new Date()
      };

      const transaction = await db.create('transactions', transactionData);

      // Update wallet balance
      const balanceField = `balance_${currency.toLowerCase()}`;
      await client.query(`
        UPDATE wallet_accounts 
        SET ${balanceField} = ${balanceField} + $1, updated_at = NOW()
        WHERE id = $2
      `, [convertedAmount, wallet.id]);

      await client.query('COMMIT');

      // Send notification
      await notificationService.sendNotification(userId, {
        type: 'wallet_topup',
        title: 'Wallet Recharged Successfully',
        title_ar: 'تم شحن المحفظة بنجاح',
        message: `Your wallet has been recharged with ${amount} ${currency}`,
        message_ar: `تم شحن محفظتك بمبلغ ${amount} ${currency}`,
        data: { transaction_id: transaction.id, amount, currency }
      });

      logger.info(`Wallet topped up: User ${userId}, Amount: ${amount} ${currency}`);

      return {
        transaction,
        new_balance: await this.getWalletBalance(wallet.id, currency)
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error topping up wallet:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Transfer money between wallets
   */
  async transferMoney(fromUserId, toUserId, amount, currency, description) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Get both wallets
      const fromWallet = await this.getWalletByUserId(fromUserId);
      const toWallet = await this.getWalletByUserId(toUserId);

      if (!fromWallet.is_active || !toWallet.is_active) {
        throw new Error('One or both wallets are not active');
      }

      // Check balance
      const currentBalance = await this.getWalletBalance(fromWallet.id, currency);
      if (currentBalance < amount) {
        throw new Error('Insufficient balance');
      }

      // Check daily limits
      const dailySpent = await this.getDailySpentAmount(fromUserId, currency);
      const sarEquivalent = await currencyService.convert(amount, currency, 'SAR');
      
      if (dailySpent + sarEquivalent > fromWallet.daily_limit) {
        throw new Error('Daily transfer limit exceeded');
      }

      // Create transaction record
      const transactionData = {
        from_user_id: fromUserId,
        to_user_id: toUserId,
        from_wallet_id: fromWallet.id,
        to_wallet_id: toWallet.id,
        transaction_type: 'wallet_transfer',
        amount: amount,
        currency: currency,
        status: 'completed',
        net_amount: amount,
        description: description || 'Wallet transfer',
        processed_at: new Date(),
        settled_at: new Date()
      };

      const transaction = await db.create('transactions', transactionData);

      // Update balances
      const balanceField = `balance_${currency.toLowerCase()}`;
      
      // Deduct from sender
      await client.query(`
        UPDATE wallet_accounts 
        SET ${balanceField} = ${balanceField} - $1, updated_at = NOW()
        WHERE id = $2
      `, [amount, fromWallet.id]);

      // Add to recipient
      await client.query(`
        UPDATE wallet_accounts 
        SET ${balanceField} = ${balanceField} + $1, updated_at = NOW()
        WHERE id = $2
      `, [amount, toWallet.id]);

      await client.query('COMMIT');

      // Send notifications to both users
      await Promise.all([
        notificationService.sendNotification(fromUserId, {
          type: 'wallet_transfer_sent',
          title: 'Money Sent Successfully',
          title_ar: 'تم إرسال المال بنجاح',
          message: `You sent ${amount} ${currency} to ${toWallet.user_name || 'another user'}`,
          message_ar: `لقد أرسلت ${amount} ${currency} إلى ${toWallet.user_name || 'مستخدم آخر'}`,
          data: { transaction_id: transaction.id, amount, currency, recipient_id: toUserId }
        }),
        notificationService.sendNotification(toUserId, {
          type: 'wallet_transfer_received',
          title: 'Money Received',
          title_ar: 'تم استلام المال',
          message: `You received ${amount} ${currency} from ${fromWallet.user_name || 'another user'}`,
          message_ar: `لقد استلمت ${amount} ${currency} من ${fromWallet.user_name || 'مستخدم آخر'}`,
          data: { transaction_id: transaction.id, amount, currency, sender_id: fromUserId }
        })
      ]);

      logger.info(`Money transferred: ${fromUserId} -> ${toUserId}, Amount: ${amount} ${currency}`);

      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error transferring money:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process order payment through wallet
   */
  async processOrderPayment(orderId, buyerId, sellerId, amount, currency) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      const buyerWallet = await this.getWalletByUserId(buyerId);
      const sellerWallet = await this.getWalletByUserId(sellerId);

      // Check buyer balance
      const currentBalance = await this.getWalletBalance(buyerWallet.id, currency);
      if (currentBalance < amount) {
        throw new Error('Insufficient wallet balance');
      }

      // Create escrow transaction (hold payment)
      const escrowTransaction = {
        from_user_id: buyerId,
        to_user_id: sellerId,
        from_wallet_id: buyerWallet.id,
        to_wallet_id: sellerWallet.id,
        order_id: orderId,
        transaction_type: 'order_payment',
        amount: amount,
        currency: currency,
        status: 'processing', // Held in escrow
        net_amount: amount,
        description: `Order payment for order ${orderId}`,
        processed_at: new Date()
      };

      const transaction = await db.create('transactions', escrowTransaction);

      // Deduct from buyer wallet (hold in escrow)
      const balanceField = `balance_${currency.toLowerCase()}`;
      await client.query(`
        UPDATE wallet_accounts 
        SET ${balanceField} = ${balanceField} - $1, updated_at = NOW()
        WHERE id = $2
      `, [amount, buyerWallet.id]);

      // Update order payment status
      await client.query(`
        UPDATE orders 
        SET payment_status = 'paid', updated_at = NOW()
        WHERE id = $1
      `, [orderId]);

      await client.query('COMMIT');

      logger.info(`Order payment processed: Order ${orderId}, Amount: ${amount} ${currency}`);

      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing order payment:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Release escrow payment to seller
   */
  async releaseEscrowPayment(orderId) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Get the escrow transaction
      const transaction = await db.findOne('transactions', {
        order_id: orderId,
        transaction_type: 'order_payment',
        status: 'processing'
      });

      if (!transaction) {
        throw new Error('No pending escrow transaction found');
      }

      // Release payment to seller
      const platformFeeRate = 0.05; // 5% platform fee
      const platformFee = transaction.amount * platformFeeRate;
      const sellerAmount = transaction.amount - platformFee;

      // Update transaction status
      await client.query(`
        UPDATE transactions 
        SET status = 'completed', 
            processing_fee = $1,
            net_amount = $2,
            settled_at = NOW(),
            updated_at = NOW()
        WHERE id = $3
      `, [platformFee, sellerAmount, transaction.id]);

      // Add to seller wallet
      const balanceField = `balance_${transaction.currency.toLowerCase()}`;
      await client.query(`
        UPDATE wallet_accounts 
        SET ${balanceField} = ${balanceField} + $1, updated_at = NOW()
        WHERE id = $2
      `, [sellerAmount, transaction.to_wallet_id]);

      // Update order status
      await client.query(`
        UPDATE orders 
        SET payment_status = 'released', status = 'completed', updated_at = NOW()
        WHERE id = $1
      `, [orderId]);

      await client.query('COMMIT');

      // Send notification to seller
      await notificationService.sendNotification(transaction.to_user_id, {
        type: 'payment_released',
        title: 'Payment Released',
        title_ar: 'تم تحرير الدفع',
        message: `Payment of ${sellerAmount} ${transaction.currency} has been released to your wallet`,
        message_ar: `تم تحرير دفع بقيمة ${sellerAmount} ${transaction.currency} إلى محفظتك`,
        data: { order_id: orderId, amount: sellerAmount, currency: transaction.currency }
      });

      logger.info(`Escrow payment released: Order ${orderId}, Amount: ${sellerAmount} ${transaction.currency}`);

      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error releasing escrow payment:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Withdraw money from wallet to bank account
   */
  async withdrawMoney(userId, amount, currency, bankDetails) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      const wallet = await this.getWalletByUserId(userId);
      
      if (!wallet.is_verified) {
        throw new Error('Wallet must be verified for withdrawals');
      }

      // Check balance
      const currentBalance = await this.getWalletBalance(wallet.id, currency);
      if (currentBalance < amount) {
        throw new Error('Insufficient balance');
      }

      // Minimum withdrawal check
      const minWithdrawal = currency === 'SAR' ? 50 : 20;
      if (amount < minWithdrawal) {
        throw new Error(`Minimum withdrawal amount is ${minWithdrawal} ${currency}`);
      }

      // Create withdrawal transaction
      const withdrawalFee = Math.max(amount * 0.01, 5); // 1% or minimum 5 units
      const netAmount = amount - withdrawalFee;

      const transactionData = {
        from_user_id: userId,
        from_wallet_id: wallet.id,
        transaction_type: 'withdrawal',
        amount: amount,
        currency: currency,
        processing_fee: withdrawalFee,
        net_amount: netAmount,
        status: 'processing',
        description: `Withdrawal to ${bankDetails.bank_name}`,
        metadata: { bank_details: bankDetails }
      };

      const transaction = await db.create('transactions', transactionData);

      // Deduct from wallet
      const balanceField = `balance_${currency.toLowerCase()}`;
      await client.query(`
        UPDATE wallet_accounts 
        SET ${balanceField} = ${balanceField} - $1, updated_at = NOW()
        WHERE id = $2
      `, [amount, wallet.id]);

      await client.query('COMMIT');

      // In a real system, this would trigger a bank transfer process
      // For now, we'll mark it as pending manual processing

      logger.info(`Withdrawal initiated: User ${userId}, Amount: ${amount} ${currency}`);

      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error processing withdrawal:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Set wallet PIN
   */
  async setWalletPIN(userId, pin) {
    try {
      if (!/^\d{4,6}$/.test(pin)) {
        throw new Error('PIN must be 4-6 digits');
      }

      const hashedPIN = await bcrypt.hash(pin, 12);
      
      await db.update('wallet_accounts', { user_id: userId }, {
        pin_hash: hashedPIN,
        pin_attempts: 0
      });

      logger.info(`Wallet PIN set for user ${userId}`);

      return { success: true };
    } catch (error) {
      logger.error('Error setting wallet PIN:', error);
      throw error;
    }
  }

  /**
   * Verify wallet PIN
   */
  async verifyWalletPIN(userId, pin) {
    try {
      const wallet = await db.findOne('wallet_accounts', { user_id: userId });
      
      if (!wallet.pin_hash) {
        throw new Error('Wallet PIN not set');
      }

      if (wallet.pin_attempts >= 3) {
        const lastAttempt = new Date(wallet.last_pin_attempt);
        const now = new Date();
        const timeDiff = now - lastAttempt;
        
        if (timeDiff < 30 * 60 * 1000) { // 30 minutes
          throw new Error('Too many failed attempts. Try again later.');
        } else {
          // Reset attempts after 30 minutes
          await db.update('wallet_accounts', { user_id: userId }, {
            pin_attempts: 0
          });
        }
      }

      const isValid = await bcrypt.compare(pin, wallet.pin_hash);
      
      if (!isValid) {
        // Increment failed attempts
        await db.update('wallet_accounts', { user_id: userId }, {
          pin_attempts: wallet.pin_attempts + 1,
          last_pin_attempt: new Date()
        });
        
        throw new Error('Invalid PIN');
      }

      // Reset attempts on successful verification
      await db.update('wallet_accounts', { user_id: userId }, {
        pin_attempts: 0
      });

      return { success: true };
    } catch (error) {
      logger.error('Error verifying wallet PIN:', error);
      throw error;
    }
  }

  /**
   * Generate wallet QR code
   */
  async generateWalletQR(walletNumber) {
    try {
      const qrData = {
        type: 'geyb_wallet',
        wallet_number: walletNumber,
        platform: 'al_arabi',
        timestamp: Date.now()
      };

      const qrString = await QRCode.toDataURL(JSON.stringify(qrData), {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#1a365d',
          light: '#ffffff'
        }
      });

      return qrString;
    } catch (error) {
      logger.error('Error generating wallet QR:', error);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  async generateWalletNumber() {
    let isUnique = false;
    let walletNumber;
    
    while (!isUnique) {
      walletNumber = 'GYB' + Math.random().toString().substr(2, 11);
      const existing = await db.findOne('wallet_accounts', { wallet_number: walletNumber });
      isUnique = !existing;
    }
    
    return walletNumber;
  }

  async getWalletBalance(walletId, currency) {
    try {
      const balanceField = `balance_${currency.toLowerCase()}`;
      const result = await db.query(`
        SELECT ${balanceField} as balance 
        FROM wallet_accounts 
        WHERE id = $1
      `, [walletId]);

      return result.rows[0]?.balance || 0;
    } catch (error) {
      logger.error('Error getting wallet balance:', error);
      return 0;
    }
  }

  async calculateTotalBalance(wallet) {
    try {
      let total = 0;
      
      for (const currency of this.supportedCurrencies) {
        const balanceField = `balance_${currency.toLowerCase()}`;
        const balance = wallet[balanceField] || 0;
        
        if (balance > 0) {
          const sarAmount = await currencyService.convert(balance, currency, 'SAR');
          total += sarAmount;
        }
      }
      
      return Math.round(total * 100) / 100;
    } catch (error) {
      logger.error('Error calculating total balance:', error);
      return 0;
    }
  }

  async getDailySpentAmount(userId, currency = 'SAR') {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const result = await db.query(`
        SELECT COALESCE(SUM(amount), 0) as daily_spent
        FROM transactions 
        WHERE from_user_id = $1 
          AND transaction_type IN ('wallet_transfer', 'order_payment', 'withdrawal')
          AND status = 'completed'
          AND created_at >= $2
          AND currency = $3
      `, [userId, today, currency]);

      return result.rows[0]?.daily_spent || 0;
    } catch (error) {
      logger.error('Error getting daily spent amount:', error);
      return 0;
    }
  }

  async getWalletStats(userId) {
    try {
      const wallet = await this.getWalletByUserId(userId);
      const totalBalance = await this.calculateTotalBalance(wallet);
      const dailySpent = await this.getDailySpentAmount(userId);
      
      // Get monthly stats
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      
      const monthlyStats = await db.query(`
        SELECT 
          COUNT(*) as total_transactions,
          COALESCE(SUM(CASE WHEN from_user_id = $1 THEN amount ELSE 0 END), 0) as total_sent,
          COALESCE(SUM(CASE WHEN to_user_id = $1 THEN amount ELSE 0 END), 0) as total_received
        FROM transactions 
        WHERE (from_user_id = $1 OR to_user_id = $1)
          AND status = 'completed'
          AND created_at >= $2
      `, [userId, monthStart]);

      return {
        wallet_number: wallet.wallet_number,
        total_balance_sar: totalBalance,
        daily_spent: dailySpent,
        daily_limit: wallet.daily_limit,
        monthly_limit: wallet.monthly_limit,
        is_verified: wallet.is_verified,
        kyc_status: wallet.kyc_status,
        monthly_stats: monthlyStats.rows[0]
      };
    } catch (error) {
      logger.error('Error getting wallet stats:', error);
      throw error;
    }
  }
}

module.exports = new WalletService();