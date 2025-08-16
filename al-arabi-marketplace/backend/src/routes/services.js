const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const db = require('../database');
const logger = require('../utils/logger');
const { authenticate, authorize } = require('../middleware/auth');
const contractService = require('../services/contractService');
const uploadService = require('../services/uploadService');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      message_ar: 'فشل في التحقق من البيانات',
      errors: errors.array()
    });
  }
  next();
};

/**
 * GET /services - Browse services with filters and search
 */
router.get('/', [
  query('category').optional().isUUID(),
  query('min_price').optional().isNumeric(),
  query('max_price').optional().isNumeric(),
  query('delivery_time').optional().isInt({ min: 1, max: 365 }),
  query('seller_level').optional().isIn(['new', 'level_1', 'level_2', 'top_rated']),
  query('location').optional().isString(),
  query('search').optional().isString(),
  query('sort').optional().isIn(['price_asc', 'price_desc', 'rating', 'popular', 'newest']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      category,
      min_price,
      max_price,
      delivery_time,
      seller_level,
      location,
      search,
      sort = 'popular',
      page = 1,
      limit = 20
    } = req.query;

    const userId = req.user?.id;
    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereConditions = ['s.status = $1'];
    let queryParams = ['active'];
    let paramIndex = 2;

    if (category) {
      whereConditions.push(`s.category_id = $${paramIndex}`);
      queryParams.push(category);
      paramIndex++;
    }

    if (min_price) {
      whereConditions.push(`s.starting_price >= $${paramIndex}`);
      queryParams.push(min_price);
      paramIndex++;
    }

    if (max_price) {
      whereConditions.push(`s.starting_price <= $${paramIndex}`);
      queryParams.push(max_price);
      paramIndex++;
    }

    if (delivery_time) {
      whereConditions.push(`s.delivery_time <= $${paramIndex}`);
      queryParams.push(delivery_time);
      paramIndex++;
    }

    if (seller_level) {
      whereConditions.push(`u.seller_level = $${paramIndex}`);
      queryParams.push(seller_level);
      paramIndex++;
    }

    if (location) {
      whereConditions.push(`(s.service_location ILIKE $${paramIndex} OR u.city ILIKE $${paramIndex})`);
      queryParams.push(`%${location}%`);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(
        s.title ILIKE $${paramIndex} OR 
        s.title_ar ILIKE $${paramIndex} OR 
        s.description ILIKE $${paramIndex} OR 
        s.description_ar ILIKE $${paramIndex} OR
        $${paramIndex} = ANY(s.tags) OR
        $${paramIndex} = ANY(s.tags_ar)
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Build ORDER BY clause
    let orderBy = '';
    switch (sort) {
      case 'price_asc':
        orderBy = 'ORDER BY s.starting_price ASC';
        break;
      case 'price_desc':
        orderBy = 'ORDER BY s.starting_price DESC';
        break;
      case 'rating':
        orderBy = 'ORDER BY s.average_rating DESC, s.total_reviews DESC';
        break;
      case 'newest':
        orderBy = 'ORDER BY s.created_at DESC';
        break;
      case 'popular':
      default:
        orderBy = 'ORDER BY s.total_orders DESC, s.views_count DESC, s.average_rating DESC';
        break;
    }

    const whereClause = whereConditions.join(' AND ');

    // Main query with user favorites if authenticated
    const servicesQuery = `
      SELECT 
        s.*,
        c.name as category_name,
        c.name_ar as category_name_ar,
        u.first_name,
        u.last_name,
        u.first_name_ar,
        u.last_name_ar,
        u.avatar_url,
        u.seller_level,
        u.average_rating as seller_rating,
        u.total_reviews as seller_reviews,
        u.is_online,
        u.country,
        ${userId ? `f.id IS NOT NULL as is_favorited,` : ''}
        COUNT(*) OVER() as total_count
      FROM services s
      JOIN categories c ON s.category_id = c.id
      JOIN users u ON s.seller_id = u.id
      ${userId ? 'LEFT JOIN favorites f ON s.id = f.service_id AND f.user_id = $' + paramIndex : ''}
      WHERE ${whereClause}
      ${orderBy}
      LIMIT $${paramIndex + (userId ? 1 : 0)} OFFSET $${paramIndex + (userId ? 2 : 1)}
    `;

    if (userId) {
      queryParams.push(userId);
      paramIndex++;
    }
    queryParams.push(limit, offset);

    const result = await db.query(servicesQuery, queryParams);
    const services = result.rows;
    const totalCount = services.length > 0 ? parseInt(services[0].total_count) : 0;

    // Increment view counts for displayed services (async, don't wait)
    if (services.length > 0 && !userId) {
      const serviceIds = services.map(s => s.id);
      db.query(`
        UPDATE services 
        SET views_count = views_count + 1 
        WHERE id = ANY($1)
      `, [serviceIds]).catch(err => logger.error('Error updating view counts:', err));
    }

    res.json({
      success: true,
      data: {
        services: services.map(service => ({
          ...service,
          total_count: undefined // Remove from individual items
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          total_pages: Math.ceil(totalCount / limit)
        },
        filters_applied: {
          category,
          price_range: min_price || max_price ? { min: min_price, max: max_price } : null,
          delivery_time,
          seller_level,
          location,
          search
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching services:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services',
      message_ar: 'فشل في جلب الخدمات',
      error: error.message
    });
  }
});

/**
 * GET /services/:id - Get service details
 */
router.get('/:id', [
  param('id').isUUID(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Get service with seller details
    const serviceQuery = `
      SELECT 
        s.*,
        c.name as category_name,
        c.name_ar as category_name_ar,
        c.slug as category_slug,
        u.first_name,
        u.last_name,
        u.first_name_ar,
        u.last_name_ar,
        u.avatar_url,
        u.seller_level,
        u.average_rating as seller_rating,
        u.total_reviews as seller_reviews,
        u.orders_completed as seller_orders_completed,
        u.is_online,
        u.last_seen,
        u.country,
        u.city,
        u.timezone,
        ${userId ? `f.id IS NOT NULL as is_favorited,` : ''}
        ${userId && userId !== s.seller_id ? `blocked.id IS NOT NULL as is_blocked` : 'false as is_blocked'}
      FROM services s
      JOIN categories c ON s.category_id = c.id
      JOIN users u ON s.seller_id = u.id
      ${userId ? 'LEFT JOIN favorites f ON s.id = f.service_id AND f.user_id = $2' : ''}
      ${userId ? 'LEFT JOIN user_blocks blocked ON u.id = blocked.blocked_user_id AND blocked.user_id = $2' : ''}
      WHERE s.id = $1 AND s.status = 'active'
    `;

    const params = userId ? [id, userId] : [id];
    const serviceResult = await db.query(serviceQuery, params);

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        message_ar: 'الخدمة غير موجودة'
      });
    }

    const service = serviceResult.rows[0];

    // Get service packages
    const packagesResult = await db.query(`
      SELECT * FROM service_packages 
      WHERE service_id = $1 AND is_active = true 
      ORDER BY sort_order ASC
    `, [id]);

    // Get seller skills
    const skillsResult = await db.query(`
      SELECT skill_name, skill_name_ar, proficiency_level, years_experience, is_certified
      FROM user_skills 
      WHERE user_id = $1 
      ORDER BY proficiency_level DESC, years_experience DESC
    `, [service.seller_id]);

    // Get recent reviews
    const reviewsResult = await db.query(`
      SELECT 
        r.*,
        u.first_name,
        u.last_name,
        u.avatar_url,
        u.country
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.service_id = $1 AND r.is_public = true
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [id]);

    // Get similar services
    const similarServicesResult = await db.query(`
      SELECT 
        s.id,
        s.title,
        s.title_ar,
        s.thumbnail_url,
        s.starting_price,
        s.currency,
        s.delivery_time,
        s.average_rating,
        s.total_reviews,
        u.first_name,
        u.last_name,
        u.seller_level
      FROM services s
      JOIN users u ON s.seller_id = u.id
      WHERE s.category_id = $1 
        AND s.id != $2 
        AND s.status = 'active'
        AND s.seller_id != $3
      ORDER BY s.average_rating DESC, s.total_orders DESC
      LIMIT 6
    `, [service.category_id, id, service.seller_id]);

    // Increment view count (async, don't wait)
    if (!userId || userId !== service.seller_id) {
      db.query(`
        UPDATE services 
        SET views_count = views_count + 1 
        WHERE id = $1
      `, [id]).catch(err => logger.error('Error updating view count:', err));
    }

    // Check if user can contact seller (not blocked, etc.)
    const canContact = userId && userId !== service.seller_id && !service.is_blocked;

    res.json({
      success: true,
      data: {
        service: {
          ...service,
          packages: packagesResult.rows,
          seller_skills: skillsResult.rows,
          can_contact: canContact,
          can_order: canContact && service.auto_accept_orders
        },
        reviews: reviewsResult.rows,
        similar_services: similarServicesResult.rows
      }
    });
  } catch (error) {
    logger.error('Error fetching service details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service details',
      message_ar: 'فشل في جلب تفاصيل الخدمة',
      error: error.message
    });
  }
});

/**
 * POST /services - Create new service (seller only)
 */
router.post('/', authenticate, [
  body('title').isLength({ min: 10, max: 200 }).trim(),
  body('title_ar').optional().isLength({ min: 10, max: 200 }).trim(),
  body('description').isLength({ min: 50, max: 2000 }).trim(),
  body('description_ar').optional().isLength({ min: 50, max: 2000 }).trim(),
  body('category_id').isUUID(),
  body('starting_price').isFloat({ min: 5 }),
  body('currency').isIn(['SAR', 'AED', 'EGP', 'DZD', 'USD']),
  body('delivery_time').isInt({ min: 1, max: 365 }),
  body('revisions_included').optional().isInt({ min: 0, max: 10 }),
  body('tags').isArray({ min: 1, max: 10 }),
  body('tags_ar').optional().isArray({ min: 1, max: 10 }),
  body('service_location').optional().isString(),
  body('languages_offered').isArray({ min: 1 }),
  body('requirements').optional().isArray(),
  body('faqs').optional().isArray(),
  handleValidationErrors
], async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user can sell (verified seller)
    const user = await db.findById('users', userId);
    if (!user.is_verified || !['seller', 'both'].includes(user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'You must be a verified seller to create services',
        message_ar: 'يجب أن تكون بائع موثق لإنشاء الخدمات'
      });
    }

    // Check seller limits (e.g., max 20 active services)
    const activeServicesCount = await db.count('services', {
      seller_id: userId,
      status: 'active'
    });

    if (activeServicesCount >= 20) {
      return res.status(400).json({
        success: false,
        message: 'Maximum number of active services reached',
        message_ar: 'تم الوصول للحد الأقصى من الخدمات النشطة'
      });
    }

    const {
      title,
      title_ar,
      description,
      description_ar,
      category_id,
      starting_price,
      currency,
      delivery_time,
      revisions_included = 1,
      tags,
      tags_ar,
      service_location,
      languages_offered,
      requirements,
      faqs,
      thumbnail_url,
      gallery_urls,
      packages
    } = req.body;

    // Generate slug
    const slug = title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 250) + '-' + Date.now();

    const serviceData = {
      seller_id: userId,
      category_id,
      title,
      title_ar,
      description,
      description_ar,
      tags,
      tags_ar,
      starting_price,
      currency,
      delivery_time,
      revisions_included,
      service_location,
      languages_offered,
      requirements,
      faqs,
      thumbnail_url,
      gallery_urls,
      slug,
      status: 'draft' // Start as draft
    };

    const service = await db.create('services', serviceData);

    // Create packages if provided
    if (packages && packages.length > 0) {
      for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i];
        await db.create('service_packages', {
          service_id: service.id,
          package_type: pkg.type,
          name: pkg.name,
          name_ar: pkg.name_ar,
          description: pkg.description,
          description_ar: pkg.description_ar,
          price: pkg.price,
          currency: currency,
          delivery_time: pkg.delivery_time,
          revisions_included: pkg.revisions_included || 1,
          features: pkg.features,
          sort_order: i
        });
      }
    }

    logger.info(`Service created: ${service.id} by user ${userId}`);

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      message_ar: 'تم إنشاء الخدمة بنجاح',
      data: { service }
    });
  } catch (error) {
    logger.error('Error creating service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create service',
      message_ar: 'فشل في إنشاء الخدمة',
      error: error.message
    });
  }
});

/**
 * POST /services/:id/order - Create order for service
 */
router.post('/:id/order', authenticate, [
  param('id').isUUID(),
  body('package_id').optional().isUUID(),
  body('requirements').isArray({ min: 1 }),
  body('additional_notes').optional().isString(),
  body('expected_delivery').optional().isISO8601(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id: serviceId } = req.params;
    const buyerId = req.user.id;
    const { package_id, requirements, additional_notes, expected_delivery } = req.body;

    // Get service details
    const service = await db.query(`
      SELECT s.*, u.first_name as seller_name 
      FROM services s
      JOIN users u ON s.seller_id = u.id
      WHERE s.id = $1 AND s.status = 'active'
    `, [serviceId]);

    if (service.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service not found or not available',
        message_ar: 'الخدمة غير موجودة أو غير متاحة'
      });
    }

    const serviceData = service.rows[0];

    // Check if buyer is trying to order from themselves
    if (serviceData.seller_id === buyerId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot order your own service',
        message_ar: 'لا يمكنك طلب خدمتك الخاصة'
      });
    }

    // Get package details if specified
    let packageData = null;
    if (package_id) {
      const packageResult = await db.query(`
        SELECT * FROM service_packages 
        WHERE id = $1 AND service_id = $2 AND is_active = true
      `, [package_id, serviceId]);

      if (packageResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Package not found',
          message_ar: 'الباقة غير موجودة'
        });
      }
      packageData = packageResult.rows[0];
    }

    // Calculate pricing
    const basePrice = packageData ? packageData.price : serviceData.starting_price;
    const deliveryTime = packageData ? packageData.delivery_time : serviceData.delivery_time;
    const platformFeeRate = 0.05; // 5%
    const platformFee = basePrice * platformFeeRate;
    const sellerFee = basePrice * 0.02; // 2% seller fee
    const totalAmount = basePrice + platformFee;

    // Calculate expected delivery date
    const deliveryDate = expected_delivery 
      ? new Date(expected_delivery)
      : new Date(Date.now() + deliveryTime * 24 * 60 * 60 * 1000);

    const orderData = {
      buyer_id: buyerId,
      seller_id: serviceData.seller_id,
      service_id: serviceId,
      package_id,
      title: packageData ? packageData.name : serviceData.title,
      description: packageData ? packageData.description : serviceData.description,
      requirements: requirements,
      subtotal: basePrice,
      platform_fee: platformFee,
      seller_fee: sellerFee,
      total_amount: totalAmount,
      currency: serviceData.currency,
      delivery_time: deliveryTime,
      revisions_allowed: packageData ? packageData.revisions_included : serviceData.revisions_included,
      expected_delivery: deliveryDate,
      status: serviceData.auto_accept_orders ? 'active' : 'pending'
    };

    const order = await db.create('orders', orderData);

    // Create auto-contract
    const contract = await contractService.generateServiceContract({
      orderId: order.id,
      buyerId,
      sellerId: serviceData.seller_id,
      serviceDetails: {
        title: orderData.title,
        description: orderData.description,
        deliveryTime: deliveryTime,
        revisions: orderData.revisions_allowed,
        amount: totalAmount,
        currency: serviceData.currency
      },
      requirements
    });

    // Send notifications
    // This would be handled by notification service

    logger.info(`Order created: ${order.id} for service ${serviceId}`);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      message_ar: 'تم إنشاء الطلب بنجاح',
      data: {
        order,
        contract_id: contract.id,
        payment_required: true,
        next_step: 'payment'
      }
    });
  } catch (error) {
    logger.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      message_ar: 'فشل في إنشاء الطلب',
      error: error.message
    });
  }
});

/**
 * POST /services/:id/favorite - Add/remove service from favorites
 */
router.post('/:id/favorite', authenticate, [
  param('id').isUUID(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id: serviceId } = req.params;
    const userId = req.user.id;

    // Check if service exists
    const service = await db.findById('services', serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        message_ar: 'الخدمة غير موجودة'
      });
    }

    // Check if already favorited
    const existingFavorite = await db.findOne('favorites', {
      user_id: userId,
      service_id: serviceId
    });

    if (existingFavorite) {
      // Remove from favorites
      await db.deleteById('favorites', existingFavorite.id);
      
      // Update service favorite count
      await db.query(`
        UPDATE services 
        SET favorites_count = favorites_count - 1 
        WHERE id = $1
      `, [serviceId]);

      res.json({
        success: true,
        message: 'Service removed from favorites',
        message_ar: 'تم إزالة الخدمة من المفضلة',
        data: { is_favorited: false }
      });
    } else {
      // Add to favorites
      await db.create('favorites', {
        user_id: userId,
        service_id: serviceId
      });

      // Update service favorite count
      await db.query(`
        UPDATE services 
        SET favorites_count = favorites_count + 1 
        WHERE id = $1
      `, [serviceId]);

      res.json({
        success: true,
        message: 'Service added to favorites',
        message_ar: 'تم إضافة الخدمة للمفضلة',
        data: { is_favorited: true }
      });
    }
  } catch (error) {
    logger.error('Error toggling favorite:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update favorites',
      message_ar: 'فشل في تحديث المفضلة',
      error: error.message
    });
  }
});

/**
 * PUT /services/:id - Update service (seller only)
 */
router.put('/:id', authenticate, [
  param('id').isUUID(),
  body('title').optional().isLength({ min: 10, max: 200 }).trim(),
  body('description').optional().isLength({ min: 50, max: 2000 }).trim(),
  body('starting_price').optional().isFloat({ min: 5 }),
  body('delivery_time').optional().isInt({ min: 1, max: 365 }),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if service exists and user owns it
    const service = await db.findOne('services', {
      id,
      seller_id: userId
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found or access denied',
        message_ar: 'الخدمة غير موجودة أو الوصول مرفوض'
      });
    }

    // Update only provided fields
    const updateData = {};
    const allowedFields = [
      'title', 'title_ar', 'description', 'description_ar',
      'starting_price', 'delivery_time', 'revisions_included',
      'tags', 'tags_ar', 'service_location', 'languages_offered',
      'requirements', 'faqs', 'thumbnail_url', 'gallery_urls'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update',
        message_ar: 'لا توجد حقول صالحة للتحديث'
      });
    }

    const updatedService = await db.update('services', id, updateData);

    logger.info(`Service updated: ${id} by user ${userId}`);

    res.json({
      success: true,
      message: 'Service updated successfully',
      message_ar: 'تم تحديث الخدمة بنجاح',
      data: { service: updatedService }
    });
  } catch (error) {
    logger.error('Error updating service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service',
      message_ar: 'فشل في تحديث الخدمة',
      error: error.message
    });
  }
});

/**
 * DELETE /services/:id - Delete service (seller only)
 */
router.delete('/:id', authenticate, [
  param('id').isUUID(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if service exists and user owns it
    const service = await db.findOne('services', {
      id,
      seller_id: userId
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found or access denied',
        message_ar: 'الخدمة غير موجودة أو الوصول مرفوض'
      });
    }

    // Check if there are active orders
    const activeOrders = await db.count('orders', {
      service_id: id,
      status: ['pending', 'active', 'delivered']
    });

    if (activeOrders > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete service with active orders',
        message_ar: 'لا يمكن حذف خدمة بها طلبات نشطة'
      });
    }

    // Soft delete by updating status
    await db.update('services', id, { status: 'deleted' });

    logger.info(`Service deleted: ${id} by user ${userId}`);

    res.json({
      success: true,
      message: 'Service deleted successfully',
      message_ar: 'تم حذف الخدمة بنجاح'
    });
  } catch (error) {
    logger.error('Error deleting service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service',
      message_ar: 'فشل في حذف الخدمة',
      error: error.message
    });
  }
});

module.exports = router;