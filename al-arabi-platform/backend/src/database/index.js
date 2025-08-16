const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

// Create PostgreSQL connection pool
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  max: config.database.max,
  idleTimeoutMillis: config.database.idleTimeoutMillis,
  connectionTimeoutMillis: config.database.connectionTimeoutMillis
});

// Test database connection
pool.on('connect', () => {
  logger.info('Database connected successfully');
});

pool.on('error', (err) => {
  logger.error('Database connection error:', err);
});

/**
 * Execute a query with parameters
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
const query = async (text, params = []) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (config.nodeEnv === 'development') {
      logger.debug(`Query executed in ${duration}ms: ${text}`);
    }
    
    return result;
  } catch (error) {
    logger.error('Database query error:', {
      query: text,
      params,
      error: error.message
    });
    throw error;
  }
};

/**
 * Execute a transaction
 * @param {Function} callback - Transaction callback function
 * @returns {Promise} Transaction result
 */
const transaction = async (callback) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction error:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get a client from the pool for multiple queries
 * @returns {Promise} Database client
 */
const getClient = async () => {
  return await pool.connect();
};

/**
 * Build WHERE clause from filters
 * @param {Object} filters - Filter object
 * @param {number} startIndex - Starting parameter index
 * @returns {Object} WHERE clause and parameters
 */
const buildWhereClause = (filters, startIndex = 1) => {
  const conditions = [];
  const params = [];
  let paramIndex = startIndex;

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value)) {
        // Handle array values (IN clause)
        const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`${key} IN (${placeholders})`);
        params.push(...value);
      } else if (typeof value === 'object' && value.operator) {
        // Handle complex operators
        conditions.push(`${key} ${value.operator} $${paramIndex++}`);
        params.push(value.value);
      } else if (key.includes('_search')) {
        // Handle text search
        const field = key.replace('_search', '');
        conditions.push(`${field} ILIKE $${paramIndex++}`);
        params.push(`%${value}%`);
      } else {
        // Handle simple equality
        conditions.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    }
  });

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
};

/**
 * Build pagination clause
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Object} LIMIT/OFFSET clause and parameters
 */
const buildPaginationClause = (page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  return {
    clause: `LIMIT $${1} OFFSET $${2}`,
    params: [limit, offset]
  };
};

/**
 * Build ORDER BY clause
 * @param {string} sortBy - Sort field
 * @param {string} sortOrder - Sort order (ASC/DESC)
 * @returns {string} ORDER BY clause
 */
const buildOrderClause = (sortBy = 'created_at', sortOrder = 'DESC') => {
  const validOrders = ['ASC', 'DESC'];
  const order = validOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
  return `ORDER BY ${sortBy} ${order}`;
};

/**
 * Generic find function
 * @param {string} table - Table name
 * @param {Object} filters - Filter conditions
 * @param {Object} options - Query options (pagination, sorting)
 * @returns {Promise} Query results
 */
const find = async (table, filters = {}, options = {}) => {
  const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC' } = options;
  
  const { whereClause, params } = buildWhereClause(filters);
  const orderClause = buildOrderClause(sortBy, sortOrder);
  const { clause: paginationClause, params: paginationParams } = buildPaginationClause(page, limit);
  
  const queryText = `
    SELECT * FROM ${table}
    ${whereClause}
    ${orderClause}
    ${paginationClause}
  `;
  
  const allParams = [...params, ...paginationParams];
  return await query(queryText, allParams);
};

/**
 * Generic findById function
 * @param {string} table - Table name
 * @param {string} id - Record ID
 * @returns {Promise} Query result
 */
const findById = async (table, id) => {
  const queryText = `SELECT * FROM ${table} WHERE id = $1`;
  const result = await query(queryText, [id]);
  return result.rows[0];
};

/**
 * Generic create function
 * @param {string} table - Table name
 * @param {Object} data - Data to insert
 * @returns {Promise} Created record
 */
const create = async (table, data) => {
  const fields = Object.keys(data);
  const values = Object.values(data);
  const placeholders = values.map((_, index) => `$${index + 1}`);
  
  const queryText = `
    INSERT INTO ${table} (${fields.join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING *
  `;
  
  const result = await query(queryText, values);
  return result.rows[0];
};

/**
 * Generic update function
 * @param {string} table - Table name
 * @param {string} id - Record ID
 * @param {Object} data - Data to update
 * @returns {Promise} Updated record
 */
const update = async (table, id, data) => {
  const fields = Object.keys(data);
  const values = Object.values(data);
  const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
  
  const queryText = `
    UPDATE ${table}
    SET ${setClause}, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  
  const result = await query(queryText, [id, ...values]);
  return result.rows[0];
};

/**
 * Generic delete function
 * @param {string} table - Table name
 * @param {string} id - Record ID
 * @returns {Promise} Deleted record
 */
const deleteById = async (table, id) => {
  const queryText = `DELETE FROM ${table} WHERE id = $1 RETURNING *`;
  const result = await query(queryText, [id]);
  return result.rows[0];
};

/**
 * Count records with filters
 * @param {string} table - Table name
 * @param {Object} filters - Filter conditions
 * @returns {Promise} Count result
 */
const count = async (table, filters = {}) => {
  const { whereClause, params } = buildWhereClause(filters);
  const queryText = `SELECT COUNT(*) as count FROM ${table} ${whereClause}`;
  const result = await query(queryText, params);
  return parseInt(result.rows[0].count);
};

/**
 * Check if record exists
 * @param {string} table - Table name
 * @param {Object} filters - Filter conditions
 * @returns {Promise} Boolean result
 */
const exists = async (table, filters) => {
  const { whereClause, params } = buildWhereClause(filters);
  const queryText = `SELECT EXISTS(SELECT 1 FROM ${table} ${whereClause}) as exists`;
  const result = await query(queryText, params);
  return result.rows[0].exists;
};

// Close all database connections
const end = async () => {
  await pool.end();
  logger.info('Database pool ended');
};

module.exports = {
  pool,
  query,
  transaction,
  getClient,
  buildWhereClause,
  buildPaginationClause,
  buildOrderClause,
  find,
  findById,
  create,
  update,
  deleteById,
  count,
  exists,
  end
};