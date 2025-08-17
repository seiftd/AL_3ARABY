const axios = require('axios');
const crypto = require('crypto');
const db = require('../database');
const logger = require('../utils/logger');
const config = require('../config');

class CulturalIntelligenceService {
  constructor() {
    this.dialectMap = {
      // Gulf Arabic (Khaleeji)
      'gulf': {
        regions: ['SA', 'AE', 'QA', 'KW', 'BH', 'OM'],
        keywords: ['خوش', 'شلون', 'وين', 'هذا الحجي', 'يالله'],
        greeting: 'السلام عليكم ومرحبا',
        currency_preference: 'SAR'
      },
      // Egyptian Arabic (Masri)
      'egyptian': {
        regions: ['EG'],
        keywords: ['إزيك', 'إيه', 'فين', 'كده', 'يلا'],
        greeting: 'أهلا وسهلا',
        currency_preference: 'EGP'
      },
      // Levantine Arabic (Shami)
      'levantine': {
        regions: ['SY', 'LB', 'JO', 'PS'],
        keywords: ['كيفك', 'شو', 'وين', 'هيك', 'يلا'],
        greeting: 'مرحبا وأهلا وسهلا',
        currency_preference: 'USD'
      },
      // Maghrebi Arabic
      'maghrebi': {
        regions: ['MA', 'TN', 'DZ', 'LY'],
        keywords: ['كيراك', 'آش', 'فين', 'هكا', 'بسرعة'],
        greeting: 'السلام عليكم',
        currency_preference: 'DZD'
      },
      // Modern Standard Arabic (MSA)
      'msa': {
        regions: ['*'], // Universal
        keywords: ['كيف حالك', 'ماذا', 'أين', 'هكذا', 'بسرعة'],
        greeting: 'السلام عليكم ورحمة الله وبركاته',
        currency_preference: 'SAR'
      }
    };

    this.heritageCategories = {
      'traditional_crafts': {
        name: 'الحرف التراثية',
        name_en: 'Traditional Crafts',
        subcategories: ['pottery', 'weaving', 'calligraphy', 'jewelry', 'woodwork'],
        verification_required: true,
        cultural_significance: 'high'
      },
      'culinary_arts': {
        name: 'الفنون الطبخية',
        name_en: 'Culinary Arts',
        subcategories: ['traditional_cooking', 'pastry', 'spices', 'beverages'],
        verification_required: true,
        cultural_significance: 'high'
      },
      'textile_arts': {
        name: 'الفنون النسجية',
        name_en: 'Textile Arts',
        subcategories: ['embroidery', 'carpet_weaving', 'traditional_clothing'],
        verification_required: true,
        cultural_significance: 'medium'
      },
      'digital_heritage': {
        name: 'التراث الرقمي',
        name_en: 'Digital Heritage',
        subcategories: ['arabic_typography', 'digital_calligraphy', 'cultural_content'],
        verification_required: false,
        cultural_significance: 'medium'
      }
    };

    this.nasijVerificationLevels = {
      'apprentice': { name: 'متدرب', min_experience: 0, max_experience: 2 },
      'craftsman': { name: 'حرفي', min_experience: 2, max_experience: 10 },
      'master': { name: 'أستاذ', min_experience: 10, max_experience: 25 },
      'grandmaster': { name: 'أستاذ كبير', min_experience: 25, max_experience: null }
    };
  }

  /**
   * Detect user's dialect based on text input and location
   */
  async detectDialect(text, userCountry = null, userCity = null) {
    try {
      const dialectScores = {};
      
      // Initialize scores
      Object.keys(this.dialectMap).forEach(dialect => {
        dialectScores[dialect] = 0;
      });

      // Keyword matching
      Object.entries(this.dialectMap).forEach(([dialect, data]) => {
        data.keywords.forEach(keyword => {
          if (text.includes(keyword)) {
            dialectScores[dialect] += 2;
          }
        });
      });

      // Geographic preference
      if (userCountry) {
        Object.entries(this.dialectMap).forEach(([dialect, data]) => {
          if (data.regions.includes(userCountry) || data.regions.includes('*')) {
            dialectScores[dialect] += 1;
          }
        });
      }

      // Find highest scoring dialect
      const detectedDialect = Object.entries(dialectScores)
        .sort(([,a], [,b]) => b - a)[0][0];

      // Advanced NLP analysis using external Arabic NLP service
      const nlpAnalysis = await this.performAdvancedDialectAnalysis(text);
      
      return {
        primary_dialect: detectedDialect,
        confidence: this.calculateConfidence(dialectScores[detectedDialect], text.length),
        nlp_analysis: nlpAnalysis,
        regional_preferences: this.dialectMap[detectedDialect],
        cultural_context: await this.getCulturalContext(detectedDialect, userCountry)
      };
    } catch (error) {
      logger.error('Error detecting dialect:', error);
      return {
        primary_dialect: 'msa',
        confidence: 0.5,
        regional_preferences: this.dialectMap.msa
      };
    }
  }

  /**
   * Real-time dialect translation API
   */
  async translateDialect(text, sourceDialect, targetDialect, preserveCulturalContext = true) {
    try {
      // Check cache first
      const cacheKey = crypto.createHash('md5')
        .update(`${text}_${sourceDialect}_${targetDialect}`)
        .digest('hex');
      
      const cached = await this.getCachedTranslation(cacheKey);
      if (cached) {
        return cached;
      }

      // Perform translation
      const translation = await this.performDialectTranslation(
        text, 
        sourceDialect, 
        targetDialect, 
        preserveCulturalContext
      );

      // Cache the result
      await this.cacheTranslation(cacheKey, translation);

      // Log translation for learning
      await this.logTranslation({
        source_text: text,
        source_dialect: sourceDialect,
        target_dialect: targetDialect,
        translated_text: translation.translated_text,
        confidence: translation.confidence,
        cultural_adaptations: translation.cultural_adaptations
      });

      return translation;
    } catch (error) {
      logger.error('Error translating dialect:', error);
      throw error;
    }
  }

  /**
   * Heritage matching algorithm for services and artisans
   */
  async performHeritageMatching(userProfile, serviceCategories, preferences = {}) {
    try {
      const heritageScore = {};
      
      // Analyze user's cultural background
      const userHeritage = await this.analyzeUserHeritage(userProfile);
      
      // Score services based on cultural relevance
      for (const category of serviceCategories) {
        const categoryData = this.heritageCategories[category];
        if (!categoryData) continue;

        let score = 0;

        // Cultural significance weight
        if (categoryData.cultural_significance === 'high') score += 30;
        else if (categoryData.cultural_significance === 'medium') score += 20;
        else score += 10;

        // Regional relevance
        if (userHeritage.regional_affinity) {
          const regionalBonus = await this.calculateRegionalRelevance(
            category, 
            userHeritage.regional_affinity
          );
          score += regionalBonus;
        }

        // Personal preference alignment
        if (preferences.traditional_crafts && categoryData.verification_required) {
          score += 25;
        }

        // Dialect compatibility
        if (userProfile.preferred_dialect) {
          const dialectBonus = await this.calculateDialectCompatibility(
            category,
            userProfile.preferred_dialect
          );
          score += dialectBonus;
        }

        heritageScore[category] = score;
      }

      // Sort by relevance score
      const rankedCategories = Object.entries(heritageScore)
        .sort(([,a], [,b]) => b - a)
        .map(([category, score]) => ({
          category,
          score,
          cultural_context: this.heritageCategories[category],
          recommendations: await this.getHeritageRecommendations(category, userProfile)
        }));

      return {
        user_heritage_profile: userHeritage,
        ranked_categories: rankedCategories,
        cultural_insights: await this.generateCulturalInsights(userProfile, rankedCategories),
        preservation_opportunities: await this.identifyPreservationOpportunities(rankedCategories)
      };
    } catch (error) {
      logger.error('Error performing heritage matching:', error);
      throw error;
    }
  }

  /**
   * Nasij Artisan Verification System
   */
  async verifyArtisan(userId, craftCategory, experienceYears, portfolioItems, references = []) {
    try {
      const verification = {
        user_id: userId,
        craft_category: craftCategory,
        experience_years: experienceYears,
        status: 'pending',
        verification_level: null,
        verification_score: 0,
        created_at: new Date()
      };

      // Determine verification level based on experience
      const level = this.determineVerificationLevel(experienceYears);
      verification.verification_level = level;

      // Portfolio analysis
      const portfolioAnalysis = await this.analyzePortfolio(portfolioItems, craftCategory);
      verification.portfolio_score = portfolioAnalysis.score;
      verification.portfolio_feedback = portfolioAnalysis.feedback;

      // Reference verification
      if (references.length > 0) {
        const referenceVerification = await this.verifyReferences(references, craftCategory);
        verification.reference_score = referenceVerification.score;
        verification.verified_references = referenceVerification.verified_count;
      }

      // Cultural authenticity check
      const authenticityCheck = await this.performAuthenticityCheck(
        portfolioItems, 
        craftCategory,
        userId
      );
      verification.authenticity_score = authenticityCheck.score;
      verification.authenticity_notes = authenticityCheck.notes;

      // Calculate final score
      verification.verification_score = this.calculateVerificationScore({
        experience_years: experienceYears,
        portfolio_score: verification.portfolio_score,
        reference_score: verification.reference_score || 0,
        authenticity_score: verification.authenticity_score
      });

      // Auto-approve or require manual review
      if (verification.verification_score >= 80) {
        verification.status = 'approved';
        verification.auto_approved = true;
      } else if (verification.verification_score >= 60) {
        verification.status = 'manual_review';
        await this.requestManualReview(verification);
      } else {
        verification.status = 'rejected';
        verification.rejection_reason = 'Insufficient evidence of craft mastery';
      }

      // Store verification record
      const verificationRecord = await db.create('nasij_verifications', verification);

      // Update user profile if approved
      if (verification.status === 'approved') {
        await this.updateArtisanProfile(userId, {
          is_verified_artisan: true,
          verification_level: level,
          craft_specialties: [craftCategory],
          nasij_badge: this.generateNasijBadge(level, craftCategory)
        });

        // Create certificate
        const certificate = await this.generateArtisanCertificate(userId, verification);
        verificationRecord.certificate_url = certificate.url;
      }

      logger.info(`Artisan verification completed for user ${userId}: ${verification.status}`);

      return {
        verification_id: verificationRecord.id,
        status: verification.status,
        level: verification.verification_level,
        score: verification.verification_score,
        feedback: this.generateVerificationFeedback(verification),
        next_steps: this.getVerificationNextSteps(verification.status),
        certificate_url: verificationRecord.certificate_url
      };
    } catch (error) {
      logger.error('Error verifying artisan:', error);
      throw error;
    }
  }

  /**
   * Cultural context matching for services
   */
  async matchCulturalContext(serviceId, buyerProfile) {
    try {
      const service = await db.findById('services', serviceId);
      const seller = await db.findById('users', service.seller_id);

      // Analyze cultural compatibility
      const compatibility = {
        dialect_match: 0,
        regional_familiarity: 0,
        cultural_understanding: 0,
        religious_considerations: 0,
        traditional_knowledge: 0
      };

      // Dialect compatibility
      if (buyerProfile.preferred_dialect && seller.preferred_dialect) {
        compatibility.dialect_match = this.calculateDialectCompatibility(
          buyerProfile.preferred_dialect,
          seller.preferred_dialect
        );
      }

      // Regional familiarity
      if (buyerProfile.country === seller.country) {
        compatibility.regional_familiarity = 100;
      } else if (this.areRegionsRelated(buyerProfile.country, seller.country)) {
        compatibility.regional_familiarity = 70;
      } else {
        compatibility.regional_familiarity = 30;
      }

      // Cultural understanding score
      const sellerCulturalProfile = await this.getSellerCulturalProfile(seller.id);
      compatibility.cultural_understanding = this.assessCulturalUnderstanding(
        buyerProfile,
        sellerCulturalProfile
      );

      // Traditional knowledge (for heritage services)
      if (service.category_type === 'traditional_crafts') {
        const sellerVerification = await this.getArtisanVerification(seller.id);
        compatibility.traditional_knowledge = sellerVerification ? 
          sellerVerification.verification_score : 0;
      }

      // Calculate overall compatibility
      const overallScore = (
        compatibility.dialect_match * 0.2 +
        compatibility.regional_familiarity * 0.3 +
        compatibility.cultural_understanding * 0.3 +
        compatibility.traditional_knowledge * 0.2
      );

      return {
        overall_compatibility: overallScore,
        compatibility_breakdown: compatibility,
        cultural_bridge_suggestions: await this.generateCulturalBridgeSuggestions(
          buyerProfile,
          seller,
          compatibility
        ),
        communication_tips: await this.generateCommunicationTips(
          buyerProfile.preferred_dialect,
          seller.preferred_dialect
        )
      };
    } catch (error) {
      logger.error('Error matching cultural context:', error);
      throw error;
    }
  }

  /**
   * Generate personalized cultural recommendations
   */
  async generateCulturalRecommendations(userId) {
    try {
      const user = await db.findById('users', userId);
      const userDialect = await this.detectUserDialect(user);
      const heritageProfile = await this.analyzeUserHeritage(user);

      const recommendations = {
        heritage_services: [],
        cultural_events: [],
        learning_opportunities: [],
        artisan_connections: []
      };

      // Heritage services recommendations
      const heritageServices = await db.query(`
        SELECT s.*, u.first_name, u.country, nv.verification_level
        FROM services s
        JOIN users u ON s.seller_id = u.id
        LEFT JOIN nasij_verifications nv ON u.id = nv.user_id AND nv.status = 'approved'
        WHERE s.heritage_category IS NOT NULL
          AND (u.country = $1 OR nv.verification_level IS NOT NULL)
        ORDER BY s.average_rating DESC, s.total_orders DESC
        LIMIT 10
      `, [user.country]);

      recommendations.heritage_services = heritageServices.rows.map(service => ({
        ...service,
        cultural_relevance: this.calculateCulturalRelevance(service, heritageProfile),
        dialect_compatibility: this.calculateDialectCompatibility(
          userDialect.primary_dialect,
          service.seller_dialect
        )
      }));

      // Cultural learning opportunities
      recommendations.learning_opportunities = await this.getCulturalLearningOpportunities(
        user.country,
        userDialect.primary_dialect,
        heritageProfile.interests
      );

      // Artisan connections
      recommendations.artisan_connections = await this.getRecommendedArtisans(
        user.country,
        heritageProfile.craft_interests,
        userDialect.primary_dialect
      );

      return {
        user_cultural_profile: {
          primary_dialect: userDialect.primary_dialect,
          heritage_background: heritageProfile,
          cultural_interests: await this.inferCulturalInterests(userId)
        },
        recommendations,
        cultural_calendar: await this.getCulturalCalendar(user.country),
        heritage_preservation_opportunities: await this.getPreservationOpportunities(userId)
      };
    } catch (error) {
      logger.error('Error generating cultural recommendations:', error);
      throw error;
    }
  }

  // Helper methods
  async performAdvancedDialectAnalysis(text) {
    // Integration with advanced Arabic NLP services
    try {
      const response = await axios.post(config.nlp.arabic_service_url, {
        text: text,
        analysis_type: 'dialect_classification',
        include_morphology: true,
        include_sentiment: true
      }, {
        headers: {
          'Authorization': `Bearer ${config.nlp.api_key}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('NLP service error:', error);
      return { confidence: 0.5, features: [] };
    }
  }

  calculateConfidence(score, textLength) {
    const baseConfidence = Math.min(score * 0.1, 1.0);
    const lengthBonus = Math.min(textLength * 0.01, 0.3);
    return Math.min(baseConfidence + lengthBonus, 1.0);
  }

  async getCulturalContext(dialect, country) {
    return {
      traditional_greetings: this.dialectMap[dialect].greeting,
      cultural_norms: await this.getCulturalNorms(country),
      business_etiquette: await this.getBusinessEtiquette(dialect, country),
      religious_considerations: await this.getReligiousConsiderations(country)
    };
  }

  determineVerificationLevel(experienceYears) {
    for (const [level, data] of Object.entries(this.nasijVerificationLevels)) {
      if (experienceYears >= data.min_experience && 
          (data.max_experience === null || experienceYears <= data.max_experience)) {
        return level;
      }
    }
    return 'apprentice';
  }

  async analyzePortfolio(portfolioItems, craftCategory) {
    const analysis = {
      score: 0,
      feedback: [],
      strengths: [],
      areas_for_improvement: []
    };

    // Analyze each portfolio item
    for (const item of portfolioItems) {
      const itemAnalysis = await this.analyzePortfolioItem(item, craftCategory);
      analysis.score += itemAnalysis.score;
      analysis.feedback.push(itemAnalysis.feedback);
    }

    // Normalize score
    analysis.score = Math.min(analysis.score / portfolioItems.length, 100);

    return analysis;
  }

  calculateVerificationScore(factors) {
    const weights = {
      experience_years: 0.3,
      portfolio_score: 0.4,
      reference_score: 0.2,
      authenticity_score: 0.1
    };

    let totalScore = 0;
    
    // Experience score (logarithmic scale)
    const experienceScore = Math.min(Math.log(factors.experience_years + 1) * 20, 100);
    totalScore += experienceScore * weights.experience_years;

    // Other factors
    totalScore += factors.portfolio_score * weights.portfolio_score;
    totalScore += factors.reference_score * weights.reference_score;
    totalScore += factors.authenticity_score * weights.authenticity_score;

    return Math.round(totalScore);
  }

  generateNasijBadge(level, craftCategory) {
    const levelNames = {
      'apprentice': 'متدرب',
      'craftsman': 'حرفي',
      'master': 'أستاذ',
      'grandmaster': 'أستاذ كبير'
    };

    return {
      level_name: levelNames[level],
      level_name_en: level,
      craft_category: craftCategory,
      badge_color: this.getBadgeColor(level),
      issued_date: new Date(),
      verification_code: this.generateVerificationCode()
    };
  }

  getBadgeColor(level) {
    const colors = {
      'apprentice': '#CD7F32', // Bronze
      'craftsman': '#C0C0C0',  // Silver
      'master': '#FFD700',     // Gold
      'grandmaster': '#E5E4E2' // Platinum
    };
    return colors[level] || colors.apprentice;
  }

  generateVerificationCode() {
    return 'NASIJ-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }
}

module.exports = new CulturalIntelligenceService();