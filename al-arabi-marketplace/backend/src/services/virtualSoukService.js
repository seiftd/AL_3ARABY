const axios = require('axios');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const logger = require('../utils/logger');
const config = require('../config');

class VirtualSoukService {
  constructor() {
    this.activeVirtualSessions = new Map();
    this.voiceAssistantConnections = new Map();
    
    this.soukEnvironments = {
      'traditional_souk': {
        name: 'السوق التقليدي',
        name_en: 'Traditional Souk',
        theme: 'historic_arabic',
        ambient_sounds: ['marketplace_chatter', 'arabic_music', 'call_to_prayer'],
        lighting: 'golden_hour',
        architecture: 'islamic_geometric',
        cultural_elements: ['arabic_calligraphy', 'geometric_patterns', 'traditional_shops']
      },
      'modern_digital_plaza': {
        name: 'الساحة الرقمية الحديثة',
        name_en: 'Modern Digital Plaza',
        theme: 'contemporary_arabic',
        ambient_sounds: ['modern_city', 'digital_notifications'],
        lighting: 'neon_arabic',
        architecture: 'modern_islamic',
        cultural_elements: ['digital_calligraphy', 'modern_patterns', 'glass_storefronts']
      },
      'heritage_bazaar': {
        name: 'بازار التراث',
        name_en: 'Heritage Bazaar',
        theme: 'cultural_preservation',
        ambient_sounds: ['traditional_instruments', 'craftsman_tools', 'storytelling'],
        lighting: 'lantern_glow',
        architecture: 'historical_accurate',
        cultural_elements: ['artisan_workshops', 'heritage_displays', 'cultural_performances']
      }
    };

    this.voiceCommands = {
      'ar': {
        'اعرض_لي': 'show_me',
        'ابحث_عن': 'search_for',
        'شراء': 'buy',
        'تفاصيل': 'details',
        'مقارنة': 'compare',
        'مساعدة': 'help',
        'تنقل_إلى': 'navigate_to',
        'اضافة_للمفضلة': 'add_to_favorites',
        'تحدث_مع_البائع': 'contact_seller',
        'طريقة_الدفع': 'payment_methods'
      },
      'gulf': {
        'ورني': 'show_me',
        'دور_لي': 'search_for',
        'اشتري': 'buy',
        'شلون': 'how',
        'وين': 'where',
        'كم_السعر': 'what_price'
      },
      'egyptian': {
        'فين': 'where',
        'إيه_ده': 'what_is_this',
        'عايز_اشتري': 'want_to_buy',
        'كام_ده': 'how_much'
      }
    };

    this.nlpProcessingEngine = {
      dialect_detection: true,
      intent_recognition: true,
      entity_extraction: true,
      sentiment_analysis: true,
      context_awareness: true
    };
  }

  /**
   * Initialize Virtual Souk session for user
   */
  async initializeVirtualSession(userId, preferences = {}) {
    try {
      const user = await db.findById('users', userId);
      const userProfile = await this.getUserProfile(userId);

      // Determine optimal souk environment based on user preferences and culture
      const environment = await this.selectOptimalEnvironment(userProfile, preferences);

      // Create virtual session
      const session = {
        session_id: uuidv4(),
        user_id: userId,
        environment: environment,
        start_time: new Date(),
        user_preferences: preferences,
        user_profile: userProfile,
        current_location: environment.starting_location || 'main_entrance',
        visited_shops: [],
        interaction_history: [],
        voice_assistant_enabled: preferences.voice_enabled !== false,
        cultural_context: await this.getCulturalContext(user),
        personalization_data: await this.getPersonalizationData(userId)
      };

      // Store session
      this.activeVirtualSessions.set(session.session_id, session);
      await db.create('virtual_souk_sessions', session);

      // Initialize 3D environment
      const environmentData = await this.generate3DEnvironment(session);

      // Initialize voice assistant if enabled
      let voiceAssistant = null;
      if (session.voice_assistant_enabled) {
        voiceAssistant = await this.initializeVoiceAssistant(session);
      }

      // Generate personalized shop recommendations
      const recommendedShops = await this.generateShopRecommendations(session);

      logger.info(`Virtual Souk session initialized for user ${userId}: ${session.session_id}`);

      return {
        session_id: session.session_id,
        environment_data: environmentData,
        voice_assistant: voiceAssistant,
        recommended_shops: recommendedShops,
        cultural_greeting: await this.generateCulturalGreeting(user),
        navigation_options: await this.getNavigationOptions(environment),
        ambient_experience: {
          sounds: environment.ambient_sounds,
          lighting: environment.lighting,
          cultural_elements: environment.cultural_elements
        }
      };
    } catch (error) {
      logger.error('Error initializing virtual session:', error);
      throw error;
    }
  }

  /**
   * Process Arabic NLP voice commands
   */
  async processVoiceCommand(sessionId, audioData, detectedText = null) {
    try {
      const session = this.activeVirtualSessions.get(sessionId);
      if (!session) {
        throw new Error('Virtual session not found');
      }

      let processedText = detectedText;
      
      // Convert audio to text if not provided
      if (!processedText && audioData) {
        processedText = await this.convertArabicSpeechToText(audioData, session.user_profile.preferred_dialect);
      }

      if (!processedText) {
        throw new Error('Could not process voice input');
      }

      // Detect dialect and cultural context
      const dialectAnalysis = await this.analyzeDialect(processedText, session.cultural_context);

      // Extract intent and entities
      const nlpAnalysis = await this.processArabicNLP(processedText, dialectAnalysis, session);

      // Execute command based on intent
      const commandResult = await this.executeVoiceCommand(nlpAnalysis, session);

      // Generate culturally appropriate response
      const response = await this.generateVoiceResponse(commandResult, session.cultural_context, dialectAnalysis);

      // Update session history
      session.interaction_history.push({
        timestamp: new Date(),
        user_input: processedText,
        dialect: dialectAnalysis.detected_dialect,
        intent: nlpAnalysis.intent,
        entities: nlpAnalysis.entities,
        command_result: commandResult,
        response: response
      });

      // Convert response to speech
      const audioResponse = await this.convertTextToArabicSpeech(response.text, dialectAnalysis.detected_dialect);

      logger.info(`Voice command processed for session ${sessionId}: ${nlpAnalysis.intent}`);

      return {
        success: true,
        dialect_detected: dialectAnalysis.detected_dialect,
        intent: nlpAnalysis.intent,
        command_result: commandResult,
        response: response,
        audio_response: audioResponse,
        cultural_context: dialectAnalysis.cultural_context
      };
    } catch (error) {
      logger.error('Error processing voice command:', error);
      
      // Generate error response in user's dialect
      const errorResponse = await this.generateErrorResponse(error.message, sessionId);
      return {
        success: false,
        error: error.message,
        response: errorResponse
      };
    }
  }

  /**
   * Navigate user through virtual souk
   */
  async navigateVirtualSouk(sessionId, destination, navigationMode = 'walk') {
    try {
      const session = this.activeVirtualSessions.get(sessionId);
      if (!session) {
        throw new Error('Virtual session not found');
      }

      const currentLocation = session.current_location;
      const environment = session.environment;

      // Calculate optimal path
      const navigationPath = await this.calculateNavigationPath(currentLocation, destination, environment);

      // Generate 3D navigation animation
      const navigationAnimation = await this.generateNavigationAnimation(navigationPath, navigationMode);

      // Cultural landmarks and points of interest along the route
      const culturalLandmarks = await this.getCulturalLandmarks(navigationPath, session.cultural_context);

      // Update session location
      session.current_location = destination;
      session.visited_shops.push(...navigationPath.shops_along_route);

      // Generate location-specific content
      const locationContent = await this.generateLocationContent(destination, session);

      logger.info(`Navigation completed for session ${sessionId}: ${currentLocation} -> ${destination}`);

      return {
        navigation_path: navigationPath,
        animation_data: navigationAnimation,
        cultural_landmarks: culturalLandmarks,
        destination_content: locationContent,
        ambient_changes: await this.getAmbientChanges(destination, environment),
        interaction_opportunities: await this.getInteractionOpportunities(destination, session)
      };
    } catch (error) {
      logger.error('Error navigating virtual souk:', error);
      throw error;
    }
  }

  /**
   * Enable immersive shop interaction
   */
  async enterVirtualShop(sessionId, shopId, interactionType = 'browse') {
    try {
      const session = this.activeVirtualSessions.get(sessionId);
      const shop = await this.getShopData(shopId);

      if (!shop) {
        throw new Error('Shop not found');
      }

      // Generate 3D shop interior
      const shopInterior = await this.generate3DShopInterior(shop, session.cultural_context);

      // Get shop owner/seller avatar
      const sellerAvatar = await this.generateSellerAvatar(shop.seller_id, session.cultural_context);

      // Cultural interaction protocol
      const interactionProtocol = await this.getCulturalInteractionProtocol(
        shop.seller_cultural_background,
        session.user_profile.cultural_background
      );

      // Available services and products in 3D space
      const virtualProducts = await this.generateVirtualProducts(shop.services, session);

      // Interactive elements
      const interactiveElements = await this.generateInteractiveElements(shop, interactionType);

      // Voice interaction setup for this specific shop
      const shopVoiceContext = await this.setupShopVoiceContext(shop, session);

      logger.info(`User entered virtual shop ${shopId} in session ${sessionId}`);

      return {
        shop_interior: shopInterior,
        seller_avatar: sellerAvatar,
        interaction_protocol: interactionProtocol,
        virtual_products: virtualProducts,
        interactive_elements: interactiveElements,
        voice_context: shopVoiceContext,
        cultural_atmosphere: await this.generateCulturalAtmosphere(shop, session.cultural_context),
        recommended_interactions: await this.getRecommendedInteractions(shop, session)
      };
    } catch (error) {
      logger.error('Error entering virtual shop:', error);
      throw error;
    }
  }

  /**
   * Process real-time marketplace interactions
   */
  async processRealtimeInteraction(sessionId, interaction) {
    try {
      const session = this.activeVirtualSessions.get(sessionId);
      
      switch (interaction.type) {
        case 'product_examination':
          return await this.handleProductExamination(interaction, session);
          
        case 'seller_conversation':
          return await this.handleSellerConversation(interaction, session);
          
        case 'price_negotiation':
          return await this.handlePriceNegotiation(interaction, session);
          
        case 'cultural_inquiry':
          return await this.handleCulturalInquiry(interaction, session);
          
        case 'heritage_exploration':
          return await this.handleHeritageExploration(interaction, session);
          
        default:
          return await this.handleGenericInteraction(interaction, session);
      }
    } catch (error) {
      logger.error('Error processing realtime interaction:', error);
      throw error;
    }
  }

  /**
   * Generate 3D environment data for WebGL rendering
   */
  async generate3DEnvironment(session) {
    try {
      const environment = session.environment;
      
      const environmentData = {
        scene_config: {
          environment_type: environment.name,
          lighting_setup: environment.lighting,
          ambient_audio: environment.ambient_sounds,
          weather_effects: await this.getWeatherEffects(session.user_profile.location),
          time_of_day: this.calculateTimeOfDay(session.user_profile.timezone)
        },
        
        architectural_elements: {
          buildings: await this.generateBuildings(environment.architecture),
          walkways: await this.generateWalkways(environment),
          landmarks: await this.generateLandmarks(environment, session.cultural_context),
          decorative_elements: await this.generateDecorativeElements(environment.cultural_elements)
        },
        
        interactive_objects: {
          shops: await this.generateShopObjects(session),
          information_points: await this.generateInformationPoints(environment),
          cultural_displays: await this.generateCulturalDisplays(session.cultural_context),
          navigation_aids: await this.generateNavigationAids(environment)
        },
        
        dynamic_content: {
          crowd_simulation: await this.generateCrowdSimulation(environment),
          merchant_calls: await this.generateMerchantCalls(session.cultural_context),
          cultural_performances: await this.generateCulturalPerformances(environment),
          seasonal_decorations: await this.getSeasonalDecorations()
        },
        
        webgl_assets: {
          textures: await this.generateTexturePaths(environment),
          models: await this.generate3DModelPaths(environment),
          animations: await this.generateAnimationPaths(environment),
          shaders: await this.generateShaderConfigs(environment)
        }
      };

      return environmentData;
    } catch (error) {
      logger.error('Error generating 3D environment:', error);
      throw error;
    }
  }

  /**
   * Initialize "Hey العربي" voice assistant
   */
  async initializeVoiceAssistant(session) {
    try {
      const assistantConfig = {
        assistant_id: `arabi_${session.session_id}`,
        user_profile: session.user_profile,
        cultural_context: session.cultural_context,
        preferred_dialect: session.user_profile.preferred_dialect || 'msa',
        voice_personality: await this.generateVoicePersonality(session.cultural_context),
        knowledge_base: await this.loadCulturalKnowledgeBase(session.cultural_context),
        interaction_style: await this.determineInteractionStyle(session.user_profile)
      };

      // Initialize NLP processing for Arabic
      const nlpProcessor = await this.initializeArabicNLP(assistantConfig);

      // Setup voice recognition and synthesis
      const voiceEngine = await this.setupArabicVoiceEngine(assistantConfig);

      // Cultural context awareness
      const culturalProcessor = await this.initializeCulturalProcessor(assistantConfig);

      // Create assistant instance
      const assistant = {
        config: assistantConfig,
        nlp_processor: nlpProcessor,
        voice_engine: voiceEngine,
        cultural_processor: culturalProcessor,
        session_context: session,
        active_since: new Date(),
        wake_phrase: 'Hey العربي',
        alternative_wake_phrases: this.getAlternativeWakePhrases(session.cultural_context)
      };

      // Store assistant connection
      this.voiceAssistantConnections.set(session.session_id, assistant);

      // Generate welcome message
      const welcomeMessage = await this.generateWelcomeMessage(session);

      logger.info(`Voice assistant initialized for session ${session.session_id}`);

      return {
        assistant_id: assistant.config.assistant_id,
        wake_phrase: assistant.wake_phrase,
        alternative_wake_phrases: assistant.alternative_wake_phrases,
        welcome_message: welcomeMessage,
        supported_commands: await this.getSupportedCommands(session.cultural_context),
        voice_settings: {
          language: 'ar',
          dialect: assistantConfig.preferred_dialect,
          voice_personality: assistantConfig.voice_personality,
          speech_rate: session.user_profile.speech_rate_preference || 'normal'
        }
      };
    } catch (error) {
      logger.error('Error initializing voice assistant:', error);
      throw error;
    }
  }

  // Helper methods for advanced functionality
  async convertArabicSpeechToText(audioData, dialect) {
    try {
      const speechAPIConfig = {
        language: 'ar',
        dialect: dialect,
        model: 'arabic_marketplace_optimized',
        enable_diacritics: true,
        cultural_context_aware: true
      };

      const response = await axios.post(config.ai.arabic_speech_api_url, {
        audio_data: audioData,
        config: speechAPIConfig
      }, {
        headers: {
          'Authorization': `Bearer ${config.ai.arabic_speech_api_key}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.transcribed_text;
    } catch (error) {
      logger.error('Error converting Arabic speech to text:', error);
      throw error;
    }
  }

  async processArabicNLP(text, dialectAnalysis, session) {
    try {
      const nlpRequest = {
        text: text,
        dialect: dialectAnalysis.detected_dialect,
        cultural_context: session.cultural_context,
        session_context: {
          current_location: session.current_location,
          visited_shops: session.visited_shops,
          user_preferences: session.user_preferences
        },
        processing_options: {
          extract_intent: true,
          extract_entities: true,
          analyze_sentiment: true,
          detect_urgency: true,
          cultural_sensitivity_check: true
        }
      };

      const response = await axios.post(config.ai.arabic_nlp_api_url, nlpRequest, {
        headers: {
          'Authorization': `Bearer ${config.ai.arabic_nlp_api_key}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error processing Arabic NLP:', error);
      throw error;
    }
  }

  async executeVoiceCommand(nlpAnalysis, session) {
    const { intent, entities, confidence } = nlpAnalysis;

    if (confidence < 0.7) {
      return {
        action: 'clarification_needed',
        message: 'عذرًا، لم أفهم طلبك بوضوح. هل يمكنك إعادة صياغته؟'
      };
    }

    switch (intent) {
      case 'search_for':
        return await this.handleSearchCommand(entities, session);
        
      case 'show_me':
        return await this.handleShowCommand(entities, session);
        
      case 'navigate_to':
        return await this.handleNavigationCommand(entities, session);
        
      case 'buy':
        return await this.handlePurchaseCommand(entities, session);
        
      case 'details':
        return await this.handleDetailsCommand(entities, session);
        
      case 'contact_seller':
        return await this.handleContactCommand(entities, session);
        
      case 'help':
        return await this.handleHelpCommand(entities, session);
        
      default:
        return await this.handleUnknownCommand(nlpAnalysis, session);
    }
  }

  async generateVoiceResponse(commandResult, culturalContext, dialectAnalysis) {
    try {
      const responseConfig = {
        content: commandResult,
        cultural_context: culturalContext,
        dialect: dialectAnalysis.detected_dialect,
        formality_level: dialectAnalysis.formality_level || 'polite',
        gender_appropriate: true,
        include_cultural_elements: true
      };

      const response = await this.generateCulturallyAppropriateResponse(responseConfig);

      return {
        text: response.text,
        audio_cues: response.audio_cues,
        visual_accompaniment: response.visual_elements,
        cultural_gestures: response.cultural_gestures,
        follow_up_suggestions: response.follow_up_suggestions
      };
    } catch (error) {
      logger.error('Error generating voice response:', error);
      throw error;
    }
  }

  async convertTextToArabicSpeech(text, dialect) {
    try {
      const ttsRequest = {
        text: text,
        language: 'ar',
        dialect: dialect,
        voice_personality: 'friendly_merchant',
        speech_rate: 'normal',
        emotional_tone: 'warm',
        cultural_pronunciation: true
      };

      const response = await axios.post(config.ai.arabic_tts_api_url, ttsRequest, {
        headers: {
          'Authorization': `Bearer ${config.ai.arabic_tts_api_key}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.audio_url;
    } catch (error) {
      logger.error('Error converting text to Arabic speech:', error);
      throw error;
    }
  }

  async selectOptimalEnvironment(userProfile, preferences) {
    // Select environment based on user's cultural background and preferences
    const culturalBackground = userProfile.cultural_background;
    const userPreferences = preferences.environment || 'auto';

    if (userPreferences !== 'auto') {
      return this.soukEnvironments[userPreferences];
    }

    // Auto-select based on cultural affinity
    if (culturalBackground.heritage_interest === 'high') {
      return this.soukEnvironments.heritage_bazaar;
    } else if (culturalBackground.modernization_preference === 'high') {
      return this.soukEnvironments.modern_digital_plaza;
    } else {
      return this.soukEnvironments.traditional_souk;
    }
  }
}

module.exports = new VirtualSoukService();