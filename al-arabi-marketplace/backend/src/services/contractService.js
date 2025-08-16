const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');

const db = require('../database');
const logger = require('../utils/logger');
const config = require('../config');

class ContractService {
  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
      region: config.aws.region
    });
    
    this.contractBucket = config.contracts.s3Bucket;
    this.contractTemplates = {
      service_contract: './templates/service_contract_ar.html',
      service_contract_en: './templates/service_contract_en.html'
    };
  }

  /**
   * Generate service contract PDF and upload to S3
   */
  async generateServiceContract(contractData) {
    try {
      const {
        orderId,
        buyerId,
        sellerId,
        serviceDetails,
        requirements
      } = contractData;

      // Get user details
      const [buyer, seller, order] = await Promise.all([
        db.findById('users', buyerId),
        db.findById('users', sellerId),
        db.findById('orders', orderId)
      ]);

      if (!buyer || !seller || !order) {
        throw new Error('Required data not found for contract generation');
      }

      // Create contract record
      const contract = await db.create('contracts', {
        buyer_id: buyerId,
        seller_id: sellerId,
        order_id: orderId,
        title: `خدمة ${serviceDetails.title}`,
        terms_and_conditions: this.generateTermsAndConditions(serviceDetails, requirements),
        terms_and_conditions_ar: this.generateTermsAndConditionsArabic(serviceDetails, requirements),
        deliverables: this.generateDeliverables(serviceDetails, requirements),
        payment_terms: this.generatePaymentTerms(serviceDetails),
        cancellation_policy: this.generateCancellationPolicy(),
        status: 'draft'
      });

      // Generate PDF
      const pdfBuffer = await this.generatePDF(contract, {
        buyer,
        seller,
        order,
        serviceDetails,
        requirements
      });

      // Calculate PDF hash
      const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

      // Upload to S3
      const s3Key = `contracts/${contract.id}/${contract.contract_number}.pdf`;
      const uploadResult = await this.uploadToS3(pdfBuffer, s3Key);

      // Update contract with PDF details
      await db.update('contracts', contract.id, {
        pdf_url: uploadResult.Location,
        pdf_hash: pdfHash,
        status: 'pending_signatures'
      });

      logger.info(`Contract generated: ${contract.id} for order ${orderId}`);

      return {
        ...contract,
        pdf_url: uploadResult.Location,
        pdf_hash: pdfHash,
        status: 'pending_signatures'
      };
    } catch (error) {
      logger.error('Error generating contract:', error);
      throw error;
    }
  }

  /**
   * Generate PDF document
   */
  async generatePDF(contract, data) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ 
          size: 'A4', 
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });
        
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });

        // Add Arabic font support
        const arabicFont = path.join(__dirname, '../assets/fonts/NotoSansArabic-Regular.ttf');
        if (fs.existsSync(arabicFont)) {
          doc.registerFont('Arabic', arabicFont);
        }

        // Header
        this.addPDFHeader(doc, contract);

        // Contract parties
        this.addContractParties(doc, data.buyer, data.seller);

        // Service details
        this.addServiceDetails(doc, data.serviceDetails, data.requirements);

        // Terms and conditions
        this.addTermsAndConditions(doc, contract);

        // Payment terms
        this.addPaymentTerms(doc, contract, data.serviceDetails);

        // Signature section
        this.addSignatureSection(doc, contract);

        // Footer
        this.addPDFFooter(doc, contract);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Add PDF header
   */
  addPDFHeader(doc, contract) {
    // Logo placeholder
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .text('Al-Arabi Marketplace', 50, 50);
    
    doc.fontSize(16)
       .font('Arabic')
       .text('منصة العربي للخدمات', 300, 50);

    // Contract title
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('Service Agreement / اتفاقية الخدمة', 50, 100);

    // Contract number and date
    doc.fontSize(12)
       .font('Helvetica')
       .text(`Contract No: ${contract.contract_number}`, 50, 130)
       .text(`Date: ${moment().format('YYYY-MM-DD')}`, 300, 130)
       .text(`التاريخ: ${moment().format('YYYY-MM-DD')}`, 400, 130);

    doc.moveDown(2);
  }

  /**
   * Add contract parties information
   */
  addContractParties(doc, buyer, seller) {
    const currentY = doc.y;

    // Buyer information
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('Buyer Information / معلومات المشتري:', 50, currentY);

    doc.fontSize(10)
       .font('Helvetica')
       .text(`Name: ${buyer.first_name} ${buyer.last_name}`, 50, currentY + 20)
       .text(`الاسم: ${buyer.first_name_ar || buyer.first_name} ${buyer.last_name_ar || buyer.last_name}`, 50, currentY + 35)
       .text(`Email: ${buyer.email}`, 50, currentY + 50)
       .text(`Phone: ${buyer.phone}`, 50, currentY + 65);

    // Seller information
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('Seller Information / معلومات البائع:', 300, currentY);

    doc.fontSize(10)
       .font('Helvetica')
       .text(`Name: ${seller.first_name} ${seller.last_name}`, 300, currentY + 20)
       .text(`الاسم: ${seller.first_name_ar || seller.first_name} ${seller.last_name_ar || seller.last_name}`, 300, currentY + 35)
       .text(`Email: ${seller.email}`, 300, currentY + 50)
       .text(`Phone: ${seller.phone}`, 300, currentY + 65);

    if (seller.business_name) {
      doc.text(`Business: ${seller.business_name}`, 300, currentY + 80)
         .text(`النشاط: ${seller.business_name_ar || seller.business_name}`, 300, currentY + 95);
    }

    doc.moveDown(3);
  }

  /**
   * Add service details
   */
  addServiceDetails(doc, serviceDetails, requirements) {
    const currentY = doc.y;

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('Service Details / تفاصيل الخدمة:', 50, currentY);

    doc.fontSize(10)
       .font('Helvetica')
       .text(`Service: ${serviceDetails.title}`, 50, currentY + 20)
       .text(`الخدمة: ${serviceDetails.title}`, 50, currentY + 35)
       .text(`Description: ${serviceDetails.description.substring(0, 200)}...`, 50, currentY + 50, { width: 500 })
       .text(`Amount: ${serviceDetails.amount} ${serviceDetails.currency}`, 50, currentY + 80)
       .text(`المبلغ: ${serviceDetails.amount} ${serviceDetails.currency}`, 200, currentY + 80)
       .text(`Delivery Time: ${serviceDetails.deliveryTime} days`, 50, currentY + 95)
       .text(`مدة التسليم: ${serviceDetails.deliveryTime} يوم`, 200, currentY + 95)
       .text(`Revisions: ${serviceDetails.revisions}`, 50, currentY + 110)
       .text(`المراجعات: ${serviceDetails.revisions}`, 200, currentY + 110);

    // Requirements
    if (requirements && requirements.length > 0) {
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Requirements / المتطلبات:', 50, currentY + 140);
      
      let reqY = currentY + 160;
      requirements.forEach((req, index) => {
        doc.fontSize(9)
           .font('Helvetica')
           .text(`${index + 1}. ${req.question}: ${req.answer}`, 50, reqY, { width: 500 });
        reqY += 15;
      });
    }

    doc.moveDown(2);
  }

  /**
   * Add terms and conditions
   */
  addTermsAndConditions(doc, contract) {
    const currentY = doc.y;

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('Terms and Conditions / الشروط والأحكام:', 50, currentY);

    const terms = contract.terms_and_conditions.split('\n');
    let termY = currentY + 20;
    
    terms.forEach((term, index) => {
      if (term.trim()) {
        doc.fontSize(9)
           .font('Helvetica')
           .text(`${index + 1}. ${term}`, 50, termY, { width: 500 });
        termY += 15;
      }
    });

    doc.moveDown(2);
  }

  /**
   * Add payment terms
   */
  addPaymentTerms(doc, contract, serviceDetails) {
    const currentY = doc.y;

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('Payment Terms / شروط الدفع:', 50, currentY);

    doc.fontSize(10)
       .font('Helvetica')
       .text('• Payment is held in escrow until service completion', 50, currentY + 20)
       .text('• يتم حجز الدفعة في الضمان حتى اكتمال الخدمة', 50, currentY + 35)
       .text('• Platform fee: 5% of service amount', 50, currentY + 50)
       .text('• رسوم المنصة: 5% من قيمة الخدمة', 50, currentY + 65)
       .text('• Seller receives payment after buyer approval', 50, currentY + 80)
       .text('• يحصل البائع على الدفع بعد موافقة المشتري', 50, currentY + 95);

    doc.moveDown(2);
  }

  /**
   * Add signature section
   */
  addSignatureSection(doc, contract) {
    const currentY = doc.y + 50;

    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Digital Signatures / التوقيعات الرقمية:', 50, currentY);

    // Buyer signature
    doc.fontSize(10)
       .font('Helvetica')
       .text('Buyer Signature / توقيع المشتري:', 50, currentY + 30);
    
    doc.rect(50, currentY + 50, 200, 50).stroke();
    doc.text('Date: _______________', 50, currentY + 110);

    // Seller signature
    doc.text('Seller Signature / توقيع البائع:', 300, currentY + 30);
    doc.rect(300, currentY + 50, 200, 50).stroke();
    doc.text('Date: _______________', 300, currentY + 110);

    doc.moveDown(2);
  }

  /**
   * Add PDF footer
   */
  addPDFFooter(doc, contract) {
    doc.fontSize(8)
       .font('Helvetica')
       .text('This contract is governed by the laws of the Kingdom of Saudi Arabia', 50, doc.page.height - 50)
       .text('هذا العقد محكوم بقوانين المملكة العربية السعودية', 50, doc.page.height - 35)
       .text(`Generated on: ${moment().format('YYYY-MM-DD HH:mm:ss')} UTC`, 50, doc.page.height - 20);
  }

  /**
   * Upload PDF to S3
   */
  async uploadToS3(buffer, key) {
    const params = {
      Bucket: this.contractBucket,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256',
      Metadata: {
        'generated-by': 'al-arabi-marketplace',
        'generated-at': new Date().toISOString()
      }
    };

    return await this.s3.upload(params).promise();
  }

  /**
   * Sign contract digitally
   */
  async signContract(contractId, userId, signatureData) {
    try {
      const contract = await db.findById('contracts', contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }

      // Verify user is party to the contract
      if (contract.buyer_id !== userId && contract.seller_id !== userId) {
        throw new Error('User not authorized to sign this contract');
      }

      const isBuyer = contract.buyer_id === userId;
      const signatureField = isBuyer ? 'buyer_signed' : 'seller_signed';
      const signatureDataField = isBuyer ? 'buyer_signature_data' : 'seller_signature_data';
      const signatureTimeField = isBuyer ? 'buyer_signed_at' : 'seller_signed_at';
      const signatureIpField = isBuyer ? 'buyer_ip_address' : 'seller_ip_address';

      // Check if already signed
      if (contract[signatureField]) {
        throw new Error('Contract already signed by this party');
      }

      // Update contract with signature
      const updateData = {
        [signatureField]: true,
        [signatureDataField]: signatureData,
        [signatureTimeField]: new Date(),
        [signatureIpField]: signatureData.ip_address
      };

      // Check if both parties have signed
      const otherPartyField = isBuyer ? 'seller_signed' : 'buyer_signed';
      if (contract[otherPartyField]) {
        updateData.status = 'active';
        updateData.activated_at = new Date();
        
        // Set expiration date (1 year from activation)
        updateData.expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      }

      const updatedContract = await db.update('contracts', contractId, updateData);

      // If contract is now fully signed, activate the order
      if (updatedContract.status === 'active') {
        await db.update('orders', contract.order_id, {
          status: 'active',
          started_at: new Date()
        });

        logger.info(`Contract fully signed and activated: ${contractId}`);
      }

      return updatedContract;
    } catch (error) {
      logger.error('Error signing contract:', error);
      throw error;
    }
  }

  /**
   * Get contract details with download URL
   */
  async getContract(contractId, userId) {
    try {
      const contract = await db.query(`
        SELECT 
          c.*,
          b.first_name as buyer_first_name,
          b.last_name as buyer_last_name,
          b.email as buyer_email,
          s.first_name as seller_first_name,
          s.last_name as seller_last_name,
          s.email as seller_email,
          o.title as order_title,
          o.total_amount,
          o.currency
        FROM contracts c
        JOIN users b ON c.buyer_id = b.id
        JOIN users s ON c.seller_id = s.id
        JOIN orders o ON c.order_id = o.id
        WHERE c.id = $1
      `, [contractId]);

      if (contract.rows.length === 0) {
        throw new Error('Contract not found');
      }

      const contractData = contract.rows[0];

      // Check authorization
      if (contractData.buyer_id !== userId && contractData.seller_id !== userId) {
        throw new Error('Access denied');
      }

      // Generate signed download URL
      if (contractData.pdf_url) {
        const s3Key = contractData.pdf_url.split('/').slice(-2).join('/');
        contractData.download_url = this.s3.getSignedUrl('getObject', {
          Bucket: this.contractBucket,
          Key: s3Key,
          Expires: 3600 // 1 hour
        });
      }

      return contractData;
    } catch (error) {
      logger.error('Error getting contract:', error);
      throw error;
    }
  }

  /**
   * Generate terms and conditions (English)
   */
  generateTermsAndConditions(serviceDetails, requirements) {
    return `
1. Service Description: The seller agrees to provide the service "${serviceDetails.title}" as described in the order requirements.

2. Delivery Timeline: The service will be completed and delivered within ${serviceDetails.deliveryTime} days from the contract activation date.

3. Revisions: The buyer is entitled to ${serviceDetails.revisions} revision(s) at no additional cost, provided the revisions are within the scope of the original requirements.

4. Payment: The total amount of ${serviceDetails.amount} ${serviceDetails.currency} will be held in escrow until service completion and buyer approval.

5. Intellectual Property: Upon full payment, all intellectual property rights for the delivered work will be transferred to the buyer.

6. Confidentiality: Both parties agree to maintain confidentiality regarding any proprietary information shared during the project.

7. Cancellation: Either party may cancel this contract under specific circumstances as outlined in the platform's cancellation policy.

8. Dispute Resolution: Any disputes will be resolved through the Al-Arabi platform's dispute resolution process.

9. Governing Law: This contract is governed by the laws of the Kingdom of Saudi Arabia.

10. Platform Terms: This contract is subject to Al-Arabi platform's Terms of Service and Privacy Policy.
    `.trim();
  }

  /**
   * Generate terms and conditions (Arabic)
   */
  generateTermsAndConditionsArabic(serviceDetails, requirements) {
    return `
1. وصف الخدمة: يوافق البائع على تقديم الخدمة "${serviceDetails.title}" كما هو موضح في متطلبات الطلب.

2. الجدول الزمني للتسليم: سيتم إكمال الخدمة وتسليمها خلال ${serviceDetails.deliveryTime} يوم من تاريخ تفعيل العقد.

3. المراجعات: يحق للمشتري ${serviceDetails.revisions} مراجعة بدون تكلفة إضافية، شريطة أن تكون المراجعات ضمن نطاق المتطلبات الأصلية.

4. الدفع: سيتم حجز المبلغ الإجمالي ${serviceDetails.amount} ${serviceDetails.currency} في الضمان حتى اكتمال الخدمة وموافقة المشتري.

5. الملكية الفكرية: عند الدفع الكامل، سيتم نقل جميع حقوق الملكية الفكرية للعمل المُسلم إلى المشتري.

6. السرية: يوافق الطرفان على الحفاظ على سرية أي معلومات خاصة يتم مشاركتها أثناء المشروع.

7. الإلغاء: يجوز لأي من الطرفين إلغاء هذا العقد في ظروف محددة كما هو موضح في سياسة الإلغاء الخاصة بالمنصة.

8. حل النزاعات: سيتم حل أي نزاعات من خلال عملية حل النزاعات الخاصة بمنصة العربي.

9. القانون الحاكم: هذا العقد محكوم بقوانين المملكة العربية السعودية.

10. شروط المنصة: هذا العقد خاضع لشروط الخدمة وسياسة الخصوصية الخاصة بمنصة العربي.
    `.trim();
  }

  /**
   * Generate deliverables description
   */
  generateDeliverables(serviceDetails, requirements) {
    let deliverables = `The seller will deliver the following:\n\n`;
    deliverables += `1. Completed service: ${serviceDetails.title}\n`;
    deliverables += `2. All source files and materials related to the service\n`;
    deliverables += `3. Documentation and instructions for use (if applicable)\n`;
    
    if (requirements && requirements.length > 0) {
      deliverables += `4. Fulfillment of all specified requirements:\n`;
      requirements.forEach((req, index) => {
        deliverables += `   - ${req.question}: ${req.answer}\n`;
      });
    }
    
    return deliverables;
  }

  /**
   * Generate payment terms
   */
  generatePaymentTerms(serviceDetails) {
    return `
Payment Terms:
- Total Amount: ${serviceDetails.amount} ${serviceDetails.currency}
- Platform Fee: 5% (included in total)
- Payment Method: Secure escrow through Al-Arabi platform
- Release Conditions: Payment released upon buyer approval or automatic release after 7 days of delivery
- Refund Policy: Governed by Al-Arabi platform refund policy
    `.trim();
  }

  /**
   * Generate cancellation policy
   */
  generateCancellationPolicy() {
    return `
Cancellation Policy:
- Buyer may cancel within 24 hours of order placement for full refund
- After work begins, cancellation subject to mutual agreement
- Seller may cancel for valid reasons (e.g., impossible requirements)
- Disputed cancellations resolved through platform mediation
- Cancellation fees may apply based on work completed
    `.trim();
  }

  /**
   * List user contracts
   */
  async getUserContracts(userId, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      
      const result = await db.query(`
        SELECT 
          c.*,
          CASE 
            WHEN c.buyer_id = $1 THEN 'buyer'
            WHEN c.seller_id = $1 THEN 'seller'
          END as user_role,
          o.title as order_title,
          o.total_amount,
          o.currency,
          o.status as order_status,
          other_user.first_name as other_party_name,
          other_user.last_name as other_party_last_name,
          COUNT(*) OVER() as total_count
        FROM contracts c
        JOIN orders o ON c.order_id = o.id
        JOIN users other_user ON (
          CASE 
            WHEN c.buyer_id = $1 THEN c.seller_id
            ELSE c.buyer_id
          END = other_user.id
        )
        WHERE c.buyer_id = $1 OR c.seller_id = $1
        ORDER BY c.created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);

      const contracts = result.rows;
      const totalCount = contracts.length > 0 ? parseInt(contracts[0].total_count) : 0;

      return {
        contracts: contracts.map(contract => ({
          ...contract,
          total_count: undefined
        })),
        pagination: {
          page,
          limit,
          total: totalCount,
          total_pages: Math.ceil(totalCount / limit)
        }
      };
    } catch (error) {
      logger.error('Error getting user contracts:', error);
      throw error;
    }
  }
}

module.exports = new ContractService();