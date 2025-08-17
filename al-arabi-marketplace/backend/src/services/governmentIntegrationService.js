const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment');
const db = require('../database');
const logger = require('../utils/logger');
const config = require('../config');

class GovernmentIntegrationService {
  constructor() {
    this.vatRates = {
      'SA': { // Saudi Arabia
        standard_rate: 0.15, // 15% VAT
        reduced_rates: {
          'education': 0.00,
          'healthcare': 0.00,
          'financial_services': 0.00
        },
        threshold: 375000, // SAR threshold for VAT registration
        currency: 'SAR'
      },
      'AE': { // United Arab Emirates
        standard_rate: 0.05, // 5% VAT
        reduced_rates: {
          'education': 0.00,
          'healthcare': 0.00,
          'residential_rent': 0.00
        },
        threshold: 375000, // AED threshold
        currency: 'AED'
      },
      'EG': { // Egypt
        standard_rate: 0.14, // 14% VAT
        reduced_rates: {
          'basic_commodities': 0.00,
          'export_services': 0.00
        },
        threshold: 500000, // EGP threshold
        currency: 'EGP'
      },
      'QA': { // Qatar
        standard_rate: 0.00, // No VAT currently
        threshold: null,
        currency: 'QAR'
      },
      'KW': { // Kuwait
        standard_rate: 0.00, // No VAT currently
        threshold: null,
        currency: 'KWD'
      },
      'BH': { // Bahrain
        standard_rate: 0.10, // 10% VAT
        threshold: 20000, // BHD threshold
        currency: 'BHD'
      },
      'OM': { // Oman
        standard_rate: 0.05, // 5% VAT
        threshold: 38500, // OMR threshold
        currency: 'OMR'
      }
    };

    this.apiEndpoints = {
      saudi_mci: {
        base_url: config.government.saudi_mci_url || 'https://api.mci.gov.sa',
        auth_endpoint: '/oauth/token',
        business_verification: '/business/verify',
        license_validation: '/license/validate',
        compliance_check: '/compliance/status'
      },
      dubai_ded: {
        base_url: config.government.dubai_ded_url || 'https://api.ded.dubai.gov.ae',
        auth_endpoint: '/auth/token',
        business_verification: '/business/verify',
        license_validation: '/license/check',
        establishment_card: '/establishment/card'
      },
      egypt_tax_authority: {
        base_url: config.government.egypt_tax_url || 'https://api.eta.gov.eg',
        vat_registration: '/vat/register',
        invoice_submission: '/invoice/submit'
      },
      gcc_vat_system: {
        base_url: config.government.gcc_vat_url || 'https://api.gcc-vat.org',
        cross_border_validation: '/validate/cross-border'
      }
    };

    this.complianceRequirements = {
      'SA': {
        business_license_required: true,
        vat_registration_threshold: 375000,
        invoice_requirements: {
          arabic_mandatory: true,
          qr_code_required: true,
          zatca_compliance: true
        },
        labor_law_compliance: true
      },
      'AE': {
        business_license_required: true,
        vat_registration_threshold: 375000,
        invoice_requirements: {
          arabic_optional: true,
          digital_signature: true
        },
        trade_license_validation: true
      }
    };
  }

  /**
   * Verify business with Saudi MCI (Ministry of Commerce and Investment)
   */
  async verifySaudiBusiness(businessData) {
    try {
      // Get authentication token
      const authToken = await this.getSaudiMCIToken();

      const verificationPayload = {
        cr_number: businessData.commercial_registration,
        business_name_ar: businessData.business_name_ar,
        business_name_en: businessData.business_name_en,
        owner_national_id: businessData.owner_national_id,
        city: businessData.city,
        verification_type: 'full_verification'
      };

      const response = await axios.post(
        `${this.apiEndpoints.saudi_mci.base_url}${this.apiEndpoints.saudi_mci.business_verification}`,
        verificationPayload,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      const verification = response.data;

      // Store verification result
      const verificationRecord = await db.create('government_verifications', {
        user_id: businessData.user_id,
        country: 'SA',
        verification_type: 'business_license',
        government_response: verification,
        status: verification.status,
        verified_at: verification.status === 'verified' ? new Date() : null,
        expires_at: verification.license_expiry ? new Date(verification.license_expiry) : null,
        compliance_score: this.calculateComplianceScore(verification),
        next_renewal_date: verification.renewal_date ? new Date(verification.renewal_date) : null
      });

      // Additional compliance checks
      if (verification.status === 'verified') {
        await this.performAdditionalSaudiChecks(businessData, verification);
      }

      logger.info(`Saudi MCI verification completed for CR: ${businessData.commercial_registration} - Status: ${verification.status}`);

      return {
        verification_id: verificationRecord.id,
        status: verification.status,
        business_details: verification.business_details,
        compliance_requirements: this.complianceRequirements.SA,
        vat_eligibility: await this.checkVATEligibility('SA', businessData),
        next_steps: this.getVerificationNextSteps(verification.status, 'SA')
      };
    } catch (error) {
      logger.error('Error verifying Saudi business:', error);
      throw new Error(`Saudi MCI verification failed: ${error.message}`);
    }
  }

  /**
   * Verify business with Dubai DED (Department of Economic Development)
   */
  async verifyDubaiBusiness(businessData) {
    try {
      const authToken = await this.getDubaiDEDToken();

      const verificationPayload = {
        trade_license_number: businessData.trade_license,
        establishment_card: businessData.establishment_card,
        business_name_ar: businessData.business_name_ar,
        business_name_en: businessData.business_name_en,
        owner_emirates_id: businessData.owner_emirates_id,
        verification_level: 'comprehensive'
      };

      const response = await axios.post(
        `${this.apiEndpoints.dubai_ded.base_url}${this.apiEndpoints.dubai_ded.business_verification}`,
        verificationPayload,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'X-DED-API-Version': '2.0'
          }
        }
      );

      const verification = response.data;

      // Store verification
      const verificationRecord = await db.create('government_verifications', {
        user_id: businessData.user_id,
        country: 'AE',
        emirate: 'Dubai',
        verification_type: 'trade_license',
        government_response: verification,
        status: verification.status,
        verified_at: verification.status === 'active' ? new Date() : null,
        expires_at: new Date(verification.license_expiry),
        compliance_score: this.calculateComplianceScore(verification)
      });

      // Check establishment card validity
      if (verification.status === 'active') {
        const establishmentCheck = await this.validateEstablishmentCard(
          businessData.establishment_card,
          authToken
        );
        verification.establishment_status = establishmentCheck.status;
      }

      logger.info(`Dubai DED verification completed for License: ${businessData.trade_license} - Status: ${verification.status}`);

      return {
        verification_id: verificationRecord.id,
        status: verification.status,
        business_details: verification.business_details,
        establishment_status: verification.establishment_status,
        compliance_requirements: this.complianceRequirements.AE,
        vat_eligibility: await this.checkVATEligibility('AE', businessData),
        renewal_reminders: await this.setRenewalReminders(verificationRecord)
      };
    } catch (error) {
      logger.error('Error verifying Dubai business:', error);
      throw new Error(`Dubai DED verification failed: ${error.message}`);
    }
  }

  /**
   * Generate automated VAT invoice for multi-country compliance
   */
  async generateVATInvoice(orderData, sellerData, buyerData) {
    try {
      const sellerCountry = sellerData.country;
      const buyerCountry = buyerData.country;
      const vatConfig = this.vatRates[sellerCountry];

      if (!vatConfig) {
        throw new Error(`VAT configuration not available for country: ${sellerCountry}`);
      }

      // Determine applicable VAT rate
      const vatRate = await this.determineVATRate(orderData, sellerData, buyerData);
      
      // Calculate VAT amounts
      const subtotal = orderData.total_amount;
      const vatAmount = subtotal * vatRate;
      const totalWithVAT = subtotal + vatAmount;

      // Generate invoice data
      const invoiceData = {
        invoice_number: await this.generateInvoiceNumber(sellerCountry),
        invoice_date: new Date(),
        due_date: moment().add(30, 'days').toDate(),
        seller: {
          ...sellerData,
          vat_registration: await this.getVATRegistration(sellerData.user_id),
          government_verification: await this.getGovernmentVerification(sellerData.user_id, sellerCountry)
        },
        buyer: {
          ...buyerData,
          vat_registration: buyerCountry === sellerCountry ? await this.getVATRegistration(buyerData.user_id) : null
        },
        order_details: orderData,
        financial_summary: {
          subtotal: subtotal,
          vat_rate: vatRate,
          vat_amount: vatAmount,
          total_amount: totalWithVAT,
          currency: vatConfig.currency
        },
        compliance_info: {
          country_regulations: this.complianceRequirements[sellerCountry],
          cross_border: sellerCountry !== buyerCountry,
          reverse_charge: await this.checkReverseCharge(sellerCountry, buyerCountry, orderData)
        }
      };

      // Generate country-specific invoice format
      const invoice = await this.generateCountrySpecificInvoice(invoiceData, sellerCountry);

      // Submit to government systems if required
      if (this.requiresGovernmentSubmission(sellerCountry, totalWithVAT)) {
        const submissionResult = await this.submitInvoiceToGovernment(invoice, sellerCountry);
        invoice.government_submission = submissionResult;
      }

      // Store invoice
      const invoiceRecord = await db.create('vat_invoices', {
        invoice_number: invoice.invoice_number,
        order_id: orderData.order_id,
        seller_id: sellerData.user_id,
        buyer_id: buyerData.user_id,
        country: sellerCountry,
        subtotal: subtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total_amount: totalWithVAT,
        currency: vatConfig.currency,
        invoice_data: invoice,
        government_submitted: !!invoice.government_submission,
        compliance_verified: true,
        created_at: new Date()
      });

      logger.info(`VAT invoice generated: ${invoice.invoice_number} for order ${orderData.order_id}`);

      return {
        invoice_id: invoiceRecord.id,
        invoice_number: invoice.invoice_number,
        invoice_pdf_url: invoice.pdf_url,
        invoice_xml_url: invoice.xml_url, // For digital submission
        qr_code_url: invoice.qr_code_url, // For Saudi ZATCA compliance
        total_amount: totalWithVAT,
        vat_amount: vatAmount,
        currency: vatConfig.currency,
        compliance_status: 'compliant',
        government_reference: invoice.government_submission?.reference_number,
        download_links: {
          pdf: invoice.pdf_url,
          xml: invoice.xml_url,
          json: invoice.json_url
        }
      };
    } catch (error) {
      logger.error('Error generating VAT invoice:', error);
      throw error;
    }
  }

  /**
   * Cross-border VAT validation for GCC countries
   */
  async validateCrossBorderVAT(transaction) {
    try {
      const { seller_country, buyer_country, service_type, amount } = transaction;

      // Check if cross-border validation is required
      if (seller_country === buyer_country) {
        return { requires_validation: false, domestic_transaction: true };
      }

      // GCC cross-border validation
      const gccCountries = ['SA', 'AE', 'BH', 'KW', 'OM', 'QA'];
      const isGCCTransaction = gccCountries.includes(seller_country) && gccCountries.includes(buyer_country);

      if (isGCCTransaction) {
        const validationResponse = await axios.post(
          `${this.apiEndpoints.gcc_vat_system.base_url}${this.apiEndpoints.gcc_vat_system.cross_border_validation}`,
          {
            seller_country,
            buyer_country,
            service_type,
            amount,
            transaction_date: new Date(),
            marketplace_vat_id: config.platform.vat_registration_number
          },
          {
            headers: {
              'Authorization': `Bearer ${config.government.gcc_vat_api_key}`,
              'Content-Type': 'application/json'
            }
          }
        );

        return {
          requires_validation: true,
          gcc_transaction: true,
          validation_result: validationResponse.data,
          applicable_rate: validationResponse.data.vat_rate,
          reverse_charge_applicable: validationResponse.data.reverse_charge,
          compliance_notes: validationResponse.data.compliance_requirements
        };
      }

      // Non-GCC cross-border
      return {
        requires_validation: true,
        gcc_transaction: false,
        applicable_rate: await this.determineInternationalVATRate(seller_country, buyer_country, service_type),
        reverse_charge_applicable: true,
        compliance_notes: ['International transaction', 'Buyer responsible for local VAT compliance']
      };
    } catch (error) {
      logger.error('Error validating cross-border VAT:', error);
      throw error;
    }
  }

  /**
   * Automated compliance monitoring and alerts
   */
  async monitorComplianceStatus() {
    try {
      const results = {
        checked_businesses: 0,
        compliance_issues: [],
        renewal_alerts: [],
        vat_threshold_alerts: [],
        government_updates: []
      };

      // Check all verified businesses
      const verifiedBusinesses = await db.query(`
        SELECT DISTINCT user_id, country, verification_type, expires_at, compliance_score
        FROM government_verifications 
        WHERE status IN ('verified', 'active') 
        AND expires_at > NOW()
      `);

      for (const business of verifiedBusinesses.rows) {
        results.checked_businesses++;

        // Check expiry dates
        const expiryDate = moment(business.expires_at);
        const daysUntilExpiry = expiryDate.diff(moment(), 'days');

        if (daysUntilExpiry <= 30) {
          results.renewal_alerts.push({
            user_id: business.user_id,
            country: business.country,
            verification_type: business.verification_type,
            expires_at: business.expires_at,
            days_remaining: daysUntilExpiry,
            action_required: 'renewal_required'
          });
        }

        // Check VAT thresholds
        const annualRevenue = await this.getUserAnnualRevenue(business.user_id, business.country);
        const vatConfig = this.vatRates[business.country];
        
        if (vatConfig && vatConfig.threshold && annualRevenue >= vatConfig.threshold * 0.8) {
          results.vat_threshold_alerts.push({
            user_id: business.user_id,
            country: business.country,
            annual_revenue: annualRevenue,
            vat_threshold: vatConfig.threshold,
            percentage_of_threshold: (annualRevenue / vatConfig.threshold) * 100,
            action_required: annualRevenue >= vatConfig.threshold ? 'vat_registration_mandatory' : 'vat_registration_approaching'
          });
        }

        // Check compliance score
        if (business.compliance_score < 70) {
          results.compliance_issues.push({
            user_id: business.user_id,
            country: business.country,
            compliance_score: business.compliance_score,
            action_required: 'compliance_improvement_needed'
          });
        }
      }

      // Send notifications for critical issues
      await this.sendComplianceNotifications(results);

      logger.info(`Compliance monitoring completed: ${results.checked_businesses} businesses checked`);

      return results;
    } catch (error) {
      logger.error('Error monitoring compliance status:', error);
      throw error;
    }
  }

  // Helper methods
  async getSaudiMCIToken() {
    try {
      const response = await axios.post(
        `${this.apiEndpoints.saudi_mci.base_url}${this.apiEndpoints.saudi_mci.auth_endpoint}`,
        {
          client_id: config.government.saudi_mci_client_id,
          client_secret: config.government.saudi_mci_client_secret,
          grant_type: 'client_credentials',
          scope: 'business_verification license_validation'
        }
      );
      return response.data.access_token;
    } catch (error) {
      throw new Error('Failed to authenticate with Saudi MCI');
    }
  }

  async getDubaiDEDToken() {
    try {
      const response = await axios.post(
        `${this.apiEndpoints.dubai_ded.base_url}${this.apiEndpoints.dubai_ded.auth_endpoint}`,
        {
          api_key: config.government.dubai_ded_api_key,
          secret: config.government.dubai_ded_secret
        }
      );
      return response.data.token;
    } catch (error) {
      throw new Error('Failed to authenticate with Dubai DED');
    }
  }

  async determineVATRate(orderData, sellerData, buyerData) {
    const sellerCountry = sellerData.country;
    const vatConfig = this.vatRates[sellerCountry];
    
    if (!vatConfig || vatConfig.standard_rate === 0) {
      return 0;
    }

    // Check for reduced rates
    const serviceCategory = orderData.service_category;
    if (vatConfig.reduced_rates && vatConfig.reduced_rates[serviceCategory] !== undefined) {
      return vatConfig.reduced_rates[serviceCategory];
    }

    // Cross-border considerations
    if (sellerData.country !== buyerData.country) {
      const crossBorderValidation = await this.validateCrossBorderVAT({
        seller_country: sellerData.country,
        buyer_country: buyerData.country,
        service_type: serviceCategory,
        amount: orderData.total_amount
      });
      
      if (crossBorderValidation.reverse_charge_applicable) {
        return 0; // Reverse charge - buyer pays VAT in their country
      }
    }

    return vatConfig.standard_rate;
  }

  async generateInvoiceNumber(country) {
    const year = moment().year();
    const sequence = await this.getNextInvoiceSequence(country, year);
    return `${country}-${year}-${String(sequence).padStart(6, '0')}`;
  }

  async generateCountrySpecificInvoice(invoiceData, country) {
    // Generate different invoice formats based on country requirements
    switch (country) {
      case 'SA':
        return await this.generateSaudiZATCAInvoice(invoiceData);
      case 'AE':
        return await this.generateUAEDigitalInvoice(invoiceData);
      default:
        return await this.generateStandardInvoice(invoiceData);
    }
  }

  async generateSaudiZATCAInvoice(invoiceData) {
    // Saudi ZATCA compliant invoice with QR code
    const invoice = await this.generateStandardInvoice(invoiceData);
    
    // Add ZATCA-specific requirements
    invoice.zatca_compliance = {
      invoice_hash: this.generateZATCAHash(invoiceData),
      qr_code: await this.generateZATCAQR(invoiceData),
      digital_signature: await this.signInvoiceDigitally(invoice),
      cryptographic_stamp: this.generateCryptographicStamp()
    };

    return invoice;
  }

  calculateComplianceScore(verification) {
    let score = 0;
    
    if (verification.license_status === 'active') score += 40;
    if (verification.tax_clearance === 'clear') score += 30;
    if (verification.regulatory_compliance === 'compliant') score += 20;
    if (verification.last_audit_result === 'passed') score += 10;
    
    return score;
  }

  requiresGovernmentSubmission(country, amount) {
    const thresholds = {
      'SA': 1000, // SAR
      'AE': 1000, // AED
      'EG': 5000  // EGP
    };
    
    return thresholds[country] && amount >= thresholds[country];
  }
}

module.exports = new GovernmentIntegrationService();