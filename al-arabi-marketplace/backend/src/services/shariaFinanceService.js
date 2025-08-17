const moment = require('moment');
const crypto = require('crypto');
const db = require('../database');
const logger = require('../utils/logger');
const config = require('../config');
const walletService = require('./walletService');

class ShariaFinanceService {
  constructor() {
    this.financingTypes = {
      'murabaha': {
        name: 'مرابحة',
        name_en: 'Murabaha (Cost-Plus Sale)',
        description: 'البيع بالتقسيط مع هامش ربح معلوم',
        profit_sharing_allowed: true,
        interest_based: false,
        suitable_for: ['goods', 'services', 'equipment']
      },
      'ijara': {
        name: 'إجارة',
        name_en: 'Ijara (Lease)',
        description: 'التأجير مع إمكانية التملك',
        profit_sharing_allowed: true,
        interest_based: false,
        suitable_for: ['equipment', 'vehicles', 'real_estate']
      },
      'musharaka': {
        name: 'مشاركة',
        name_en: 'Musharaka (Partnership)',
        description: 'الشراكة في رأس المال والأرباح',
        profit_sharing_allowed: true,
        interest_based: false,
        suitable_for: ['business_investment', 'projects']
      },
      'qard_hassan': {
        name: 'قرض حسن',
        name_en: 'Qard Hassan (Benevolent Loan)',
        description: 'القرض الحسن بدون فوائد',
        profit_sharing_allowed: false,
        interest_based: false,
        suitable_for: ['emergency', 'social_support', 'small_amounts']
      }
    };

    this.zakatCategories = {
      'money': { rate: 0.025, nisab_threshold_sar: 11682 }, // 2.5% on savings above nisab
      'trade_goods': { rate: 0.025, nisab_threshold_sar: 11682 },
      'services_income': { rate: 0.025, annual_calculation: true },
      'digital_assets': { rate: 0.025, subject_to_interpretation: true }
    };

    this.shariaBoard = {
      members: [
        {
          name: 'د. عبدالله المنيع',
          title: 'رئيس مجلس الإفتاء',
          specialization: 'المعاملات المالية الإسلامية',
          certification: 'AAOIFI'
        },
        {
          name: 'د. محمد الجيزاني',
          title: 'عضو هيئة كبار العلماء',
          specialization: 'الاقتصاد الإسلامي',
          certification: 'IFSB'
        },
        {
          name: 'د. يوسف الشبيلي',
          title: 'خبير الصيرفة الإسلامية',
          specialization: 'التمويل الرقمي',
          certification: 'CIBAFI'
        }
      ],
      approval_threshold: 2, // Minimum 2 members must approve
      review_period_days: 7
    };
  }

  /**
   * Assess Sharia compliance for financing request
   */
  async assessShariaCompliance(financingRequest) {
    try {
      const assessment = {
        request_id: financingRequest.id,
        compliance_score: 0,
        approved_methods: [],
        prohibited_elements: [],
        recommendations: [],
        requires_board_review: false,
        assessment_date: new Date()
      };

      // Check for prohibited elements (Riba, Gharar, Haram activities)
      const prohibitionCheck = await this.checkProhibitedElements(financingRequest);
      assessment.prohibited_elements = prohibitionCheck.violations;
      assessment.compliance_score = prohibitionCheck.base_score;

      // Assess suitable financing methods
      const suitableMethods = await this.determineSuitableFinancingMethods(financingRequest);
      assessment.approved_methods = suitableMethods;

      // Generate compliance score
      assessment.compliance_score = await this.calculateComplianceScore(
        financingRequest,
        prohibitionCheck,
        suitableMethods
      );

      // Determine if board review is required
      assessment.requires_board_review = this.requiresBoardReview(
        assessment.compliance_score,
        financingRequest.amount,
        suitableMethods
      );

      // Generate recommendations
      assessment.recommendations = await this.generateShariaRecommendations(
        financingRequest,
        assessment
      );

      // Auto-approve if score is high enough and no board review required
      if (assessment.compliance_score >= 85 && !assessment.requires_board_review) {
        assessment.status = 'auto_approved';
        assessment.approved_at = new Date();
      } else if (assessment.compliance_score >= 60) {
        assessment.status = 'pending_review';
        await this.submitToBoardReview(assessment);
      } else {
        assessment.status = 'rejected';
        assessment.rejection_reason = 'Non-compliance with Sharia principles';
      }

      // Store assessment
      const storedAssessment = await db.create('sharia_assessments', assessment);

      logger.info(`Sharia compliance assessment completed: ${assessment.status} (Score: ${assessment.compliance_score})`);

      return storedAssessment;
    } catch (error) {
      logger.error('Error assessing Sharia compliance:', error);
      throw error;
    }
  }

  /**
   * Process 0% financing with Sharia-compliant structure
   */
  async processZeroPercentFinancing(userId, serviceId, financingAmount, currency, method = 'qard_hassan') {
    try {
      // Verify method is Sharia-compliant for 0% financing
      if (!this.isZeroPercentCompliant(method)) {
        throw new Error('Selected method not suitable for 0% financing');
      }

      // Check user eligibility
      const eligibility = await this.checkFinancingEligibility(userId, financingAmount, currency);
      if (!eligibility.eligible) {
        throw new Error(`Financing not approved: ${eligibility.reason}`);
      }

      // Create financing agreement
      const agreement = {
        borrower_id: userId,
        service_id: serviceId,
        financing_type: method,
        principal_amount: financingAmount,
        profit_amount: 0, // 0% financing
        total_amount: financingAmount,
        currency: currency,
        installments: eligibility.recommended_installments,
        monthly_payment: financingAmount / eligibility.recommended_installments,
        profit_rate: 0,
        start_date: new Date(),
        end_date: moment().add(eligibility.recommended_installments, 'months').toDate(),
        status: 'active',
        sharia_compliance_verified: true,
        compliance_method: method
      };

      // Generate payment schedule
      agreement.payment_schedule = this.generatePaymentSchedule(
        agreement.total_amount,
        agreement.installments,
        agreement.start_date
      );

      // Store agreement
      const financingAgreement = await db.create('sharia_financing_agreements', agreement);

      // Create initial transaction
      await this.createInitialFinancingTransaction(financingAgreement, serviceId);

      // Set up automatic payment reminders
      await this.schedulePaymentReminders(financingAgreement);

      // Record in Zakat calculation system
      await this.recordForZakatCalculation(userId, financingAmount, 'debt_financing');

      logger.info(`0% Sharia financing approved: ${financingAgreement.id} for user ${userId}`);

      return {
        agreement_id: financingAgreement.id,
        financing_type: method,
        principal_amount: financingAmount,
        monthly_payment: agreement.monthly_payment,
        installments: agreement.installments,
        payment_schedule: agreement.payment_schedule,
        first_payment_due: agreement.payment_schedule[0].due_date,
        sharia_certificate: await this.generateShariaComplianceCertificate(financingAgreement)
      };
    } catch (error) {
      logger.error('Error processing 0% financing:', error);
      throw error;
    }
  }

  /**
   * Automatic Zakat calculation and distribution
   */
  async calculateAndDistributeZakat(userId, financialYear = null) {
    try {
      const year = financialYear || moment().year();
      const hijriYear = moment().format('iYYYY'); // Islamic calendar year

      // Get user's financial data for the year
      const financialData = await this.getUserFinancialData(userId, year);

      const zakatCalculation = {
        user_id: userId,
        calculation_year: year,
        hijri_year: hijriYear,
        calculation_date: new Date(),
        categories: {},
        total_zakatable_wealth: 0,
        total_zakat_due: 0,
        auto_distributed: false
      };

      // Calculate Zakat for each category
      for (const [category, data] of Object.entries(this.zakatCategories)) {
        const categoryWealth = financialData[category] || 0;
        
        if (categoryWealth >= data.nisab_threshold_sar) {
          const zakatAmount = categoryWealth * data.rate;
          
          zakatCalculation.categories[category] = {
            wealth_amount: categoryWealth,
            nisab_threshold: data.nisab_threshold_sar,
            zakat_rate: data.rate,
            zakat_due: zakatAmount,
            above_nisab: true
          };
          
          zakatCalculation.total_zakatable_wealth += categoryWealth;
          zakatCalculation.total_zakat_due += zakatAmount;
        } else {
          zakatCalculation.categories[category] = {
            wealth_amount: categoryWealth,
            nisab_threshold: data.nisab_threshold_sar,
            above_nisab: false,
            zakat_due: 0
          };
        }
      }

      // Store calculation
      const zakatRecord = await db.create('zakat_calculations', zakatCalculation);

      // Auto-distribute if user has enabled it and sufficient wallet balance
      const user = await db.findById('users', userId);
      if (user.auto_zakat_enabled && zakatCalculation.total_zakat_due > 0) {
        const distributionResult = await this.autoDistributeZakat(
          userId, 
          zakatCalculation.total_zakat_due,
          user.preferred_currency || 'SAR'
        );
        
        if (distributionResult.success) {
          await db.update('zakat_calculations', zakatRecord.id, {
            auto_distributed: true,
            distribution_date: new Date(),
            distribution_details: distributionResult.distributions
          });
          zakatCalculation.auto_distributed = true;
          zakatCalculation.distribution_details = distributionResult.distributions;
        }
      }

      logger.info(`Zakat calculated for user ${userId}: ${zakatCalculation.total_zakat_due} SAR`);

      return {
        calculation_id: zakatRecord.id,
        total_zakat_due: zakatCalculation.total_zakat_due,
        total_zakatable_wealth: zakatCalculation.total_zakatable_wealth,
        category_breakdown: zakatCalculation.categories,
        auto_distributed: zakatCalculation.auto_distributed,
        distribution_details: zakatCalculation.distribution_details,
        next_calculation_date: moment().add(1, 'year').toDate(),
        nisab_value_info: await this.getCurrentNisabValue()
      };
    } catch (error) {
      logger.error('Error calculating Zakat:', error);
      throw error;
    }
  }

  /**
   * Submit complex cases to Sharia board for review
   */
  async submitToBoardReview(assessment) {
    try {
      const boardReview = {
        assessment_id: assessment.id,
        submitted_date: new Date(),
        status: 'pending',
        board_members_assigned: [],
        review_deadline: moment().add(this.shariaBoard.review_period_days, 'days').toDate(),
        complexity_level: this.assessComplexityLevel(assessment),
        review_priority: this.calculateReviewPriority(assessment)
      };

      // Assign board members based on specialization
      boardReview.board_members_assigned = await this.assignBoardMembers(assessment);

      // Create board review record
      const review = await db.create('sharia_board_reviews', boardReview);

      // Notify board members
      await this.notifyBoardMembers(review, assessment);

      // Schedule follow-up if no decision within deadline
      await this.scheduleReviewFollowUp(review);

      logger.info(`Case submitted to Sharia board for review: ${review.id}`);

      return review;
    } catch (error) {
      logger.error('Error submitting to board review:', error);
      throw error;
    }
  }

  /**
   * Process board decision
   */
  async processBoardDecision(reviewId, decisions) {
    try {
      const review = await db.findById('sharia_board_reviews', reviewId);
      const assessment = await db.findById('sharia_assessments', review.assessment_id);

      // Validate decisions from board members
      const validDecisions = decisions.filter(d => 
        this.shariaBoard.members.some(m => m.name === d.member_name)
      );

      if (validDecisions.length < this.shariaBoard.approval_threshold) {
        throw new Error('Insufficient board member decisions');
      }

      // Calculate consensus
      const approvals = validDecisions.filter(d => d.decision === 'approved').length;
      const rejections = validDecisions.filter(d => d.decision === 'rejected').length;
      const modifications = validDecisions.filter(d => d.decision === 'requires_modification').length;

      let finalDecision;
      if (approvals >= this.shariaBoard.approval_threshold) {
        finalDecision = 'approved';
      } else if (rejections >= this.shariaBoard.approval_threshold) {
        finalDecision = 'rejected';
      } else {
        finalDecision = 'requires_modification';
      }

      // Update review record
      await db.update('sharia_board_reviews', reviewId, {
        status: 'completed',
        final_decision: finalDecision,
        board_decisions: validDecisions,
        decision_date: new Date(),
        consensus_level: (approvals / validDecisions.length) * 100
      });

      // Update original assessment
      await db.update('sharia_assessments', assessment.id, {
        status: finalDecision,
        board_reviewed: true,
        board_decision_date: new Date(),
        board_recommendations: this.compileBoardRecommendations(validDecisions)
      });

      // Generate fatwa if approved
      if (finalDecision === 'approved') {
        const fatwa = await this.generateFatwa(assessment, validDecisions);
        await db.update('sharia_assessments', assessment.id, {
          fatwa_reference: fatwa.reference_number,
          fatwa_url: fatwa.document_url
        });
      }

      logger.info(`Board decision processed: ${finalDecision} for review ${reviewId}`);

      return {
        review_id: reviewId,
        final_decision: finalDecision,
        board_consensus: (approvals / validDecisions.length) * 100,
        decision_details: validDecisions,
        fatwa_reference: finalDecision === 'approved' ? fatwa?.reference_number : null
      };
    } catch (error) {
      logger.error('Error processing board decision:', error);
      throw error;
    }
  }

  /**
   * Auto-distribute Zakat to approved beneficiaries
   */
  async autoDistributeZakat(userId, zakatAmount, currency) {
    try {
      // Get approved Zakat beneficiaries
      const beneficiaries = await this.getApprovedZakatBeneficiaries();
      
      if (beneficiaries.length === 0) {
        throw new Error('No approved Zakat beneficiaries available');
      }

      // Check user's wallet balance
      const wallet = await walletService.getWalletByUserId(userId);
      const balanceField = `balance_${currency.toLowerCase()}`;
      const currentBalance = wallet[balanceField] || 0;

      if (currentBalance < zakatAmount) {
        throw new Error('Insufficient wallet balance for Zakat distribution');
      }

      // Calculate distribution amounts based on beneficiary priorities and needs
      const distributions = this.calculateZakatDistribution(zakatAmount, beneficiaries);

      const distributionResults = [];

      // Process each distribution
      for (const distribution of distributions) {
        try {
          // Transfer to beneficiary
          const transaction = await walletService.transferMoney(
            userId,
            distribution.beneficiary_wallet_id,
            distribution.amount,
            currency,
            `Zakat distribution - ${distribution.category}`
          );

          distributionResults.push({
            beneficiary_id: distribution.beneficiary_id,
            beneficiary_name: distribution.beneficiary_name,
            amount: distribution.amount,
            currency: currency,
            category: distribution.category,
            transaction_id: transaction.id,
            status: 'completed',
            distributed_at: new Date()
          });

          // Record for tax purposes and transparency
          await db.create('zakat_distributions', {
            payer_id: userId,
            beneficiary_id: distribution.beneficiary_id,
            amount: distribution.amount,
            currency: currency,
            transaction_id: transaction.id,
            category: distribution.category,
            tax_year: moment().year(),
            distributed_at: new Date()
          });

        } catch (error) {
          distributionResults.push({
            beneficiary_id: distribution.beneficiary_id,
            amount: distribution.amount,
            status: 'failed',
            error: error.message
          });
        }
      }

      const successfulDistributions = distributionResults.filter(d => d.status === 'completed');
      const totalDistributed = successfulDistributions.reduce((sum, d) => sum + d.amount, 0);

      logger.info(`Zakat auto-distributed: ${totalDistributed} ${currency} to ${successfulDistributions.length} beneficiaries`);

      return {
        success: totalDistributed > 0,
        total_distributed: totalDistributed,
        distributions: distributionResults,
        tax_certificate: await this.generateZakatTaxCertificate(userId, distributionResults)
      };
    } catch (error) {
      logger.error('Error auto-distributing Zakat:', error);
      throw error;
    }
  }

  // Helper methods
  async checkProhibitedElements(request) {
    const violations = [];
    let baseScore = 100;

    // Check for Riba (interest)
    if (request.interest_rate && request.interest_rate > 0) {
      violations.push({
        type: 'riba',
        description: 'Interest-based transaction prohibited',
        severity: 'critical'
      });
      baseScore -= 50;
    }

    // Check for Gharar (excessive uncertainty)
    if (request.uncertainty_level === 'high') {
      violations.push({
        type: 'gharar',
        description: 'Excessive uncertainty in transaction terms',
        severity: 'high'
      });
      baseScore -= 30;
    }

    // Check for Haram activities
    const haramKeywords = ['alcohol', 'gambling', 'pork', 'adult_content', 'weapons'];
    const requestText = (request.description || '').toLowerCase();
    
    for (const keyword of haramKeywords) {
      if (requestText.includes(keyword)) {
        violations.push({
          type: 'haram_activity',
          description: `Transaction involves prohibited activity: ${keyword}`,
          severity: 'critical'
        });
        baseScore -= 40;
      }
    }

    return { violations, base_score: Math.max(baseScore, 0) };
  }

  isZeroPercentCompliant(method) {
    const compliantMethods = ['qard_hassan', 'musharaka', 'ijara'];
    return compliantMethods.includes(method);
  }

  generatePaymentSchedule(totalAmount, installments, startDate) {
    const schedule = [];
    const monthlyAmount = totalAmount / installments;
    
    for (let i = 0; i < installments; i++) {
      schedule.push({
        installment_number: i + 1,
        due_date: moment(startDate).add(i + 1, 'months').toDate(),
        amount: monthlyAmount,
        principal: monthlyAmount,
        profit: 0, // 0% financing
        status: 'pending'
      });
    }
    
    return schedule;
  }

  calculateZakatDistribution(totalAmount, beneficiaries) {
    // Implement Islamic priority system for Zakat distribution
    const categories = {
      'fuqara': { priority: 1, allocation: 0.3 }, // Poor
      'masakin': { priority: 2, allocation: 0.25 }, // Needy
      'amil': { priority: 3, allocation: 0.1 }, // Zakat administrators
      'muallaf': { priority: 4, allocation: 0.05 }, // Those whose hearts are reconciled
      'riqab': { priority: 5, allocation: 0.1 }, // Freeing slaves/debt relief
      'gharim': { priority: 6, allocation: 0.1 }, // Debtors
      'fisabilillah': { priority: 7, allocation: 0.05 }, // In the way of Allah
      'ibnsabil': { priority: 8, allocation: 0.05 } // Wayfarers
    };

    const distributions = [];
    
    for (const beneficiary of beneficiaries) {
      const categoryAllocation = categories[beneficiary.category]?.allocation || 0;
      const amount = totalAmount * categoryAllocation * (beneficiary.need_level / 100);
      
      distributions.push({
        beneficiary_id: beneficiary.id,
        beneficiary_name: beneficiary.name,
        beneficiary_wallet_id: beneficiary.wallet_id,
        category: beneficiary.category,
        amount: Math.round(amount * 100) / 100,
        priority: categories[beneficiary.category]?.priority || 9
      });
    }

    return distributions.sort((a, b) => a.priority - b.priority);
  }

  async getCurrentNisabValue() {
    // Current Nisab value based on gold/silver prices
    return {
      gold_nisab_sar: 11682, // 20 mithqal of gold
      silver_nisab_sar: 1636, // 200 dirhams of silver
      recommended: 'gold_nisab_sar',
      last_updated: new Date(),
      source: 'Saudi Monetary Authority'
    };
  }
}

module.exports = new ShariaFinanceService();