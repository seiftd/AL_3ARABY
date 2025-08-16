module.exports = {
  // API Configuration
  apiVersion: process.env.API_VERSION || 'v1',
  
  // Server Configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'al_arabi_platform',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  },
  
  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || null
  },
  
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },
  
  // AWS Configuration
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3BucketName: process.env.S3_BUCKET_NAME,
    s3ContractsBucket: process.env.S3_CONTRACTS_BUCKET,
    cloudfrontUrl: process.env.CLOUDFRONT_URL
  },
  
  // Payment Gateway Configuration
  payments: {
    stripe: {
      publicKey: process.env.STRIPE_PUBLIC_KEY,
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
    },
    paypal: {
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      mode: process.env.PAYPAL_MODE || 'sandbox'
    },
    baridimob: {
      merchantId: process.env.BARIDIMOB_MERCHANT_ID,
      secretKey: process.env.BARIDIMOB_SECRET_KEY,
      apiUrl: process.env.BARIDIMOB_API_URL
    },
    stcPay: {
      merchantId: process.env.STC_PAY_MERCHANT_ID,
      secretKey: process.env.STC_PAY_SECRET_KEY,
      apiUrl: process.env.STC_PAY_API_URL
    },
    fawry: {
      merchantCode: process.env.FAWRY_MERCHANT_CODE,
      secretKey: process.env.FAWRY_SECRET_KEY,
      apiUrl: process.env.FAWRY_API_URL
    },
    telr: {
      storeId: process.env.TELR_STORE_ID,
      authKey: process.env.TELR_AUTH_KEY,
      apiUrl: process.env.TELR_API_URL
    }
  },
  
  // SMS Gateway Configuration
  sms: {
    unifonic: {
      appSid: process.env.UNIFONIC_APP_SID,
      apiUrl: process.env.UNIFONIC_API_URL
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER
    }
  },
  
  // Email Configuration
  email: {
    smtp: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  },
  
  // Google Maps Configuration
  googleMaps: {
    apiKey: process.env.GOOGLE_MAPS_API_KEY
  },
  
  // File Upload Configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
    allowedImageTypes: process.env.ALLOWED_IMAGE_TYPES?.split(',') || ['image/jpeg', 'image/png', 'image/webp'],
    allowedDocumentTypes: process.env.ALLOWED_DOCUMENT_TYPES?.split(',') || ['application/pdf']
  },
  
  // Rate Limiting Configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },
  
  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: process.env.CORS_CREDENTIALS === 'true'
  },
  
  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log'
  },
  
  // Contract Configuration
  contracts: {
    templatePath: process.env.CONTRACT_TEMPLATE_PATH || './templates/contract_template.pdf',
    signatureFontPath: process.env.SIGNATURE_FONT_PATH || './fonts/amiri-regular.ttf'
  },
  
  // Notification Services Configuration
  notifications: {
    fcm: {
      serverKey: process.env.FCM_SERVER_KEY
    },
    apns: {
      keyId: process.env.APNS_KEY_ID,
      teamId: process.env.APNS_TEAM_ID,
      bundleId: process.env.APNS_BUNDLE_ID
    }
  },
  
  // Currency Exchange Configuration
  exchange: {
    apiKey: process.env.EXCHANGE_RATE_API_KEY
  },
  
  // Analytics Configuration
  analytics: {
    mixpanel: {
      token: process.env.MIXPANEL_TOKEN
    },
    googleAnalytics: {
      trackingId: process.env.GOOGLE_ANALYTICS_ID
    }
  },
  
  // Supported currencies
  supportedCurrencies: ['SAR', 'AED', 'EGP', 'DZD', 'USD', 'EUR'],
  
  // Supported languages
  supportedLanguages: ['ar', 'en'],
  
  // Default language
  defaultLanguage: 'ar'
};