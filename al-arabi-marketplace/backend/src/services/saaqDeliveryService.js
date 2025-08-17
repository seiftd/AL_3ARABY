const axios = require('axios');
const moment = require('moment');
const geolib = require('geolib');
const NodeGeocoder = require('node-geocoder');
const db = require('../database');
const logger = require('../utils/logger');
const config = require('../config');

class SaaqDeliveryService {
  constructor() {
    this.geocoder = NodeGeocoder({
      provider: 'google',
      apiKey: config.google.maps_api_key,
      language: 'ar',
      region: 'SA'
    });

    this.culturalLandmarks = {
      'SA': {
        'riyadh': [
          { name: 'المسجد الحرام', name_en: 'Masjid Al-Haram', lat: 21.4225, lng: 39.8262, radius: 500, priority: 'mandatory_stop' },
          { name: 'قصر المصمك', name_en: 'Masmak Fortress', lat: 24.6308, lng: 46.7186, radius: 200, priority: 'cultural' },
          { name: 'مركز الملك عبد العزيز التاريخي', name_en: 'King Abdulaziz Historical Center', lat: 24.6473, lng: 46.7105, radius: 300, priority: 'cultural' }
        ],
        'jeddah': [
          { name: 'البلد القديمة', name_en: 'Al-Balad Old Town', lat: 21.4858, lng: 39.1925, radius: 400, priority: 'heritage' },
          { name: 'نافورة الملك فهد', name_en: 'King Fahd Fountain', lat: 21.5169, lng: 39.1748, radius: 150, priority: 'landmark' }
        ],
        'mecca': [
          { name: 'المسجد الحرام', name_en: 'Masjid Al-Haram', lat: 21.4225, lng: 39.8262, radius: 1000, priority: 'sacred_zone' },
          { name: 'جبل النور', name_en: 'Jabal An-Nour', lat: 21.4607, lng: 39.8555, radius: 500, priority: 'sacred_zone' }
        ]
      },
      'AE': {
        'dubai': [
          { name: 'مسجد الشيخ زايد الكبير', name_en: 'Sheikh Zayed Grand Mosque', lat: 24.4129, lng: 54.4748, radius: 300, priority: 'cultural' },
          { name: 'قرية التراث', name_en: 'Heritage Village', lat: 25.2048, lng: 55.2708, radius: 200, priority: 'heritage' },
          { name: 'سوق الذهب', name_en: 'Gold Souk', lat: 25.2677, lng: 55.2960, radius: 150, priority: 'traditional_market' }
        ],
        'abu_dhabi': [
          { name: 'قصر الحصن', name_en: 'Qasr Al Hosn', lat: 24.4539, lng: 54.3773, radius: 200, priority: 'heritage' },
          { name: 'جزيرة ياس', name_en: 'Yas Island', lat: 24.4979, lng: 54.6098, radius: 500, priority: 'modern' }
        ]
      },
      'EG': {
        'cairo': [
          { name: 'الأزهر الشريف', name_en: 'Al-Azhar Mosque', lat: 30.0453, lng: 31.2623, radius: 300, priority: 'sacred' },
          { name: 'خان الخليلي', name_en: 'Khan el-Khalili', lat: 30.0478, lng: 31.2625, radius: 250, priority: 'traditional_market' },
          { name: 'قلعة صلاح الدين', name_en: 'Citadel of Saladin', lat: 30.0287, lng: 31.2601, radius: 400, priority: 'heritage' }
        ]
      }
    };

    this.deliveryZones = {
      'premium': { max_distance: 50, delivery_fee: 0, time_window: 60 },
      'standard': { max_distance: 100, delivery_fee: 15, time_window: 120 },
      'extended': { max_distance: 200, delivery_fee: 35, time_window: 240 }
    };

    this.culturalDeliveryProtocols = {
      'prayer_times': {
        'fajr': { avoid_delivery: true, respect_period: 30 },
        'dhuhr': { slow_delivery: true, respect_period: 15 },
        'asr': { normal_delivery: true },
        'maghrib': { avoid_delivery: true, respect_period: 30 },
        'isha': { slow_delivery: true, respect_period: 15 }
      },
      'ramadan': {
        'iftar_hours': { priority_delivery: true, time_window: 30 },
        'suhoor_hours': { priority_delivery: true, time_window: 60 },
        'fasting_hours': { respectful_delivery: true, no_food_ads: true }
      },
      'cultural_events': {
        'national_day': { patriotic_decorations: true, special_greetings: true },
        'eid': { festive_packaging: true, special_rates: true },
        'hajj_season': { sacred_awareness: true, flexible_timing: true }
      }
    };

    this.driverVerificationLevels = {
      'basic': { background_check: true, driving_license: true },
      'cultural': { cultural_training: true, language_skills: true, basic: true },
      'premium': { heritage_knowledge: true, customer_service_cert: true, cultural: true },
      'sacred': { religious_etiquette: true, sacred_sites_training: true, premium: true }
    };
  }

  /**
   * Register new Saaq Al-Arabi driver
   */
  async registerDriver(driverData) {
    try {
      // Validate driver requirements
      const validation = await this.validateDriverRequirements(driverData);
      if (!validation.eligible) {
        throw new Error(`Driver registration failed: ${validation.reason}`);
      }

      // Determine verification level based on area and services
      const verificationLevel = await this.determineVerificationLevel(driverData);

      // Create driver profile
      const driver = {
        user_id: driverData.user_id,
        driver_number: await this.generateDriverNumber(),
        full_name: driverData.full_name,
        full_name_ar: driverData.full_name_ar,
        phone: driverData.phone,
        email: driverData.email,
        national_id: driverData.national_id,
        driving_license: driverData.driving_license,
        vehicle_type: driverData.vehicle_type,
        vehicle_registration: driverData.vehicle_registration,
        vehicle_color: driverData.vehicle_color,
        vehicle_make_model: driverData.vehicle_make_model,
        service_areas: driverData.service_areas,
        verification_level: verificationLevel,
        cultural_background: driverData.cultural_background,
        languages_spoken: driverData.languages_spoken,
        dialects_known: driverData.dialects_known,
        heritage_knowledge_areas: driverData.heritage_knowledge_areas,
        availability_schedule: driverData.availability_schedule,
        cultural_sensitivity_score: 0,
        customer_rating: 0,
        total_deliveries: 0,
        status: 'pending_verification',
        registered_at: new Date()
      };

      // Store driver record
      const driverRecord = await db.create('saaq_drivers', driver);

      // Initiate verification process
      const verificationProcess = await this.initiateDriverVerification(driverRecord, verificationLevel);

      // Setup cultural training if required
      if (verificationLevel !== 'basic') {
        await this.scheduleCulturalTraining(driverRecord.id, verificationLevel);
      }

      // Generate driver app credentials
      const appCredentials = await this.generateDriverAppCredentials(driverRecord);

      logger.info(`Driver registered: ${driver.driver_number} for user ${driverData.user_id}`);

      return {
        driver_id: driverRecord.id,
        driver_number: driver.driver_number,
        verification_level: verificationLevel,
        verification_process: verificationProcess,
        app_credentials: appCredentials,
        next_steps: await this.getDriverNextSteps(verificationLevel),
        training_schedule: verificationLevel !== 'basic' ? await this.getTrainingSchedule(verificationLevel) : null
      };
    } catch (error) {
      logger.error('Error registering driver:', error);
      throw error;
    }
  }

  /**
   * Create delivery with cultural geofencing
   */
  async createCulturalDelivery(orderData, pickupLocation, deliveryLocation, preferences = {}) {
    try {
      // Analyze cultural context of route
      const routeAnalysis = await this.analyzeCulturalRoute(pickupLocation, deliveryLocation);

      // Find appropriate driver based on cultural requirements
      const availableDrivers = await this.findCulturallyAwareDrivers(routeAnalysis, preferences);

      if (availableDrivers.length === 0) {
        throw new Error('No culturally-aware drivers available for this route');
      }

      // Select optimal driver
      const selectedDriver = await this.selectOptimalDriver(availableDrivers, routeAnalysis, orderData);

      // Generate culturally-sensitive route
      const culturalRoute = await this.generateCulturalRoute(pickupLocation, deliveryLocation, routeAnalysis);

      // Create delivery record
      const delivery = {
        delivery_number: await this.generateDeliveryNumber(),
        order_id: orderData.order_id,
        driver_id: selectedDriver.id,
        pickup_location: pickupLocation,
        delivery_location: deliveryLocation,
        cultural_route: culturalRoute,
        cultural_landmarks: routeAnalysis.landmarks_along_route,
        estimated_duration: culturalRoute.estimated_duration,
        estimated_distance: culturalRoute.total_distance,
        delivery_fee: await this.calculateCulturalDeliveryFee(culturalRoute, selectedDriver),
        cultural_considerations: routeAnalysis.cultural_requirements,
        prayer_time_awareness: await this.getPrayerTimeConsiderations(deliveryLocation),
        special_instructions: await this.generateCulturalInstructions(routeAnalysis, selectedDriver),
        status: 'assigned',
        created_at: new Date(),
        estimated_pickup_time: moment().add(selectedDriver.eta_to_pickup, 'minutes').toDate(),
        estimated_delivery_time: moment().add(culturalRoute.estimated_duration, 'minutes').toDate()
      };

      // Store delivery
      const deliveryRecord = await db.create('saaq_deliveries', delivery);

      // Notify driver
      await this.notifyDriverAssignment(selectedDriver, deliveryRecord);

      // Setup real-time tracking with cultural awareness
      await this.setupCulturalTracking(deliveryRecord);

      // Schedule cultural checkpoints
      await this.scheduleCulturalCheckpoints(deliveryRecord, culturalRoute);

      logger.info(`Cultural delivery created: ${delivery.delivery_number} assigned to driver ${selectedDriver.driver_number}`);

      return {
        delivery_id: deliveryRecord.id,
        delivery_number: delivery.delivery_number,
        driver_info: {
          name: selectedDriver.full_name,
          name_ar: selectedDriver.full_name_ar,
          phone: selectedDriver.phone,
          vehicle_info: `${selectedDriver.vehicle_color} ${selectedDriver.vehicle_make_model}`,
          cultural_level: selectedDriver.verification_level,
          languages: selectedDriver.languages_spoken,
          heritage_areas: selectedDriver.heritage_knowledge_areas
        },
        route_info: {
          total_distance: culturalRoute.total_distance,
          estimated_duration: culturalRoute.estimated_duration,
          cultural_landmarks: routeAnalysis.landmarks_along_route,
          prayer_considerations: delivery.prayer_time_awareness
        },
        tracking_info: {
          tracking_url: await this.generateTrackingURL(deliveryRecord.id),
          cultural_updates_enabled: true,
          landmark_notifications: true
        },
        estimated_times: {
          pickup: delivery.estimated_pickup_time,
          delivery: delivery.estimated_delivery_time
        },
        cultural_features: {
          heritage_route: routeAnalysis.heritage_significance,
          landmark_stories: await this.getLandmarkStories(routeAnalysis.landmarks_along_route),
          cultural_greetings: await this.generateCulturalGreetings(selectedDriver, orderData)
        }
      };
    } catch (error) {
      logger.error('Error creating cultural delivery:', error);
      throw error;
    }
  }

  /**
   * Real-time cultural geofencing and landmark detection
   */
  async processGeofenceEvent(driverId, currentLocation, deliveryId) {
    try {
      const delivery = await db.findById('saaq_deliveries', deliveryId);
      const driver = await db.findById('saaq_drivers', driverId);

      // Check for cultural landmarks in vicinity
      const nearbyLandmarks = await this.detectNearbyLandmarks(currentLocation, driver.service_areas);

      // Process each landmark
      const landmarkEvents = [];
      for (const landmark of nearbyLandmarks) {
        const event = await this.processLandmarkEncounter(landmark, driver, delivery, currentLocation);
        if (event) {
          landmarkEvents.push(event);
        }
      }

      // Check for cultural zones
      const culturalZones = await this.detectCulturalZones(currentLocation);

      // Prayer time awareness
      const prayerTimeStatus = await this.checkPrayerTimeProximity(currentLocation);

      // Generate cultural notifications
      const culturalNotifications = await this.generateCulturalNotifications(
        landmarkEvents,
        culturalZones,
        prayerTimeStatus,
        driver
      );

      // Update delivery tracking
      await this.updateCulturalTracking(deliveryId, {
        current_location: currentLocation,
        landmark_events: landmarkEvents,
        cultural_zones: culturalZones,
        prayer_status: prayerTimeStatus,
        timestamp: new Date()
      });

      // Notify customer if significant cultural event
      if (landmarkEvents.some(e => e.significance === 'high')) {
        await this.notifyCustomerCulturalEvent(delivery, landmarkEvents);
      }

      return {
        geofence_events: landmarkEvents,
        cultural_zones: culturalZones,
        prayer_time_status: prayerTimeStatus,
        notifications: culturalNotifications,
        cultural_insights: await this.generateCulturalInsights(nearbyLandmarks, driver),
        next_landmarks: await this.getUpcomingLandmarks(delivery.cultural_route, currentLocation)
      };
    } catch (error) {
      logger.error('Error processing geofence event:', error);
      throw error;
    }
  }

  /**
   * Optimize delivery routes with cultural awareness
   */
  async optimizeCulturalRoute(deliveries, driverLocation) {
    try {
      // Group deliveries by cultural significance
      const culturalGroups = await this.groupDeliveriesByCulturalContext(deliveries);

      // Consider prayer times for route optimization
      const prayerTimes = await this.getCurrentPrayerTimes(driverLocation);

      // Analyze cultural landmarks for each potential route
      const routeOptions = [];
      
      for (const group of culturalGroups) {
        const route = await this.calculateOptimalCulturalRoute(group, driverLocation, prayerTimes);
        routeOptions.push(route);
      }

      // Score routes based on multiple factors
      const routeScores = await this.scoreCulturalRoutes(routeOptions);

      // Select best route
      const optimalRoute = routeOptions[routeScores.indexOf(Math.max(...routeScores))];

      // Add cultural waypoints
      const enhancedRoute = await this.addCulturalWaypoints(optimalRoute);

      // Generate cultural delivery schedule
      const culturalSchedule = await this.generateCulturalSchedule(enhancedRoute, prayerTimes);

      return {
        optimized_route: enhancedRoute,
        cultural_waypoints: enhancedRoute.cultural_waypoints,
        prayer_time_considerations: culturalSchedule.prayer_considerations,
        estimated_completion: culturalSchedule.estimated_completion,
        cultural_score: Math.max(...routeScores),
        heritage_highlights: await this.getRouteHeritageHighlights(enhancedRoute),
        delivery_schedule: culturalSchedule.delivery_times
      };
    } catch (error) {
      logger.error('Error optimizing cultural route:', error);
      throw error;
    }
  }

  /**
   * Driver cultural performance tracking
   */
  async trackDriverCulturalPerformance(driverId, deliveryId, customerFeedback) {
    try {
      const driver = await db.findById('saaq_drivers', driverId);
      const delivery = await db.findById('saaq_deliveries', deliveryId);

      // Analyze cultural performance metrics
      const performance = {
        landmark_awareness: customerFeedback.landmark_awareness || 0,
        cultural_sensitivity: customerFeedback.cultural_sensitivity || 0,
        language_communication: customerFeedback.language_communication || 0,
        heritage_knowledge: customerFeedback.heritage_knowledge || 0,
        prayer_time_respect: customerFeedback.prayer_time_respect || 0,
        overall_cultural_experience: customerFeedback.overall_cultural_experience || 0
      };

      // Calculate weighted cultural score
      const culturalScore = this.calculateCulturalScore(performance);

      // Update driver's cultural performance
      await this.updateDriverCulturalMetrics(driverId, culturalScore, performance);

      // Check for cultural excellence achievements
      const achievements = await this.checkCulturalAchievements(driver, culturalScore);

      // Recommend training if needed
      const trainingRecommendations = await this.generateTrainingRecommendations(driver, performance);

      // Update verification level if warranted
      const levelUpgrade = await this.checkVerificationLevelUpgrade(driver, culturalScore);

      logger.info(`Cultural performance tracked for driver ${driver.driver_number}: Score ${culturalScore}`);

      return {
        cultural_score: culturalScore,
        performance_breakdown: performance,
        achievements_unlocked: achievements,
        training_recommendations: trainingRecommendations,
        level_upgrade: levelUpgrade,
        next_milestone: await this.getNextCulturalMilestone(driver),
        cultural_ranking: await this.getDriverCulturalRanking(driverId)
      };
    } catch (error) {
      logger.error('Error tracking driver cultural performance:', error);
      throw error;
    }
  }

  // Helper methods
  async analyzeCulturalRoute(pickupLocation, deliveryLocation) {
    try {
      const country = await this.detectCountryFromLocation(pickupLocation);
      const landmarks = this.culturalLandmarks[country] || [];
      
      // Find landmarks along the route
      const routeLandmarks = [];
      const route = await this.getBaseRoute(pickupLocation, deliveryLocation);
      
      for (const point of route.path) {
        for (const landmark of landmarks) {
          const distance = geolib.getDistance(point, landmark);
          if (distance <= landmark.radius) {
            routeLandmarks.push({
              ...landmark,
              distance_from_route: distance,
              route_position: point
            });
          }
        }
      }

      // Assess cultural requirements
      const culturalRequirements = [];
      
      if (routeLandmarks.some(l => l.priority === 'sacred_zone')) {
        culturalRequirements.push('sacred_site_protocol');
      }
      
      if (routeLandmarks.some(l => l.priority === 'heritage')) {
        culturalRequirements.push('heritage_awareness');
      }

      return {
        landmarks_along_route: routeLandmarks.sort((a, b) => a.distance_from_route - b.distance_from_route),
        cultural_requirements: culturalRequirements,
        heritage_significance: routeLandmarks.length > 0 ? 'high' : 'low',
        required_driver_level: this.determineRequiredDriverLevel(routeLandmarks),
        cultural_sensitivity_needed: routeLandmarks.some(l => ['sacred_zone', 'sacred'].includes(l.priority))
      };
    } catch (error) {
      logger.error('Error analyzing cultural route:', error);
      throw error;
    }
  }

  async findCulturallyAwareDrivers(routeAnalysis, preferences) {
    const requiredLevel = routeAnalysis.required_driver_level;
    const culturalRequirements = routeAnalysis.cultural_requirements;

    const query = `
      SELECT d.*, u.first_name, u.preferred_dialect
      FROM saaq_drivers d
      JOIN users u ON d.user_id = u.id
      WHERE d.status = 'active'
        AND d.verification_level >= $1
        AND d.cultural_sensitivity_score >= $2
        AND ST_DWithin(d.current_location, $3, $4)
      ORDER BY d.cultural_sensitivity_score DESC, d.customer_rating DESC
    `;

    const drivers = await db.query(query, [
      requiredLevel,
      culturalRequirements.includes('sacred_site_protocol') ? 90 : 70,
      `POINT(${preferences.pickup_lat} ${preferences.pickup_lng})`,
      5000 // 5km radius
    ]);

    return drivers.rows;
  }

  async detectNearbyLandmarks(location, serviceAreas) {
    const landmarks = [];
    
    for (const area of serviceAreas) {
      const areaLandmarks = this.culturalLandmarks[area.country]?.[area.city] || [];
      
      for (const landmark of areaLandmarks) {
        const distance = geolib.getDistance(location, landmark);
        if (distance <= landmark.radius * 2) { // Detection radius
          landmarks.push({
            ...landmark,
            distance: distance,
            bearing: geolib.getBearing(location, landmark)
          });
        }
      }
    }

    return landmarks.sort((a, b) => a.distance - b.distance);
  }

  async processLandmarkEncounter(landmark, driver, delivery, currentLocation) {
    // Create landmark encounter event
    const encounter = {
      landmark_name: landmark.name,
      landmark_name_en: landmark.name_en,
      priority: landmark.priority,
      distance: landmark.distance,
      driver_knowledge_level: await this.assessDriverLandmarkKnowledge(driver, landmark),
      cultural_action_required: this.determineCulturalAction(landmark, driver),
      timestamp: new Date()
    };

    // Store encounter
    await db.create('landmark_encounters', {
      driver_id: driver.id,
      delivery_id: delivery.id,
      landmark_data: landmark,
      encounter_details: encounter,
      location: currentLocation
    });

    return encounter;
  }

  determineRequiredDriverLevel(landmarks) {
    if (landmarks.some(l => l.priority === 'sacred_zone')) return 'sacred';
    if (landmarks.some(l => l.priority === 'heritage')) return 'premium';
    if (landmarks.some(l => l.priority === 'cultural')) return 'cultural';
    return 'basic';
  }

  calculateCulturalScore(performance) {
    const weights = {
      landmark_awareness: 0.2,
      cultural_sensitivity: 0.25,
      language_communication: 0.15,
      heritage_knowledge: 0.15,
      prayer_time_respect: 0.15,
      overall_cultural_experience: 0.1
    };

    let score = 0;
    for (const [metric, value] of Object.entries(performance)) {
      score += value * (weights[metric] || 0);
    }

    return Math.round(score);
  }

  async generateDriverNumber() {
    const year = moment().year();
    const sequence = await this.getNextDriverSequence(year);
    return `SAAQ-${year}-${String(sequence).padStart(5, '0')}`;
  }

  async generateDeliveryNumber() {
    const date = moment().format('YYYYMMDD');
    const sequence = await this.getNextDeliverySequence(date);
    return `DLV-${date}-${String(sequence).padStart(4, '0')}`;
  }
}

module.exports = new SaaqDeliveryService();