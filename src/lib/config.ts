export const config = {
  // Database
  database: {
    url: process.env.DATABASE_URL!,
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL!,
  },

  // OCR Providers
  ocr: {
    google: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS!,
    },
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      region: process.env.AWS_REGION!,
    },
    azure: {
      subscriptionKey: process.env.AZURE_COMPUTER_VISION_SUBSCRIPTION_KEY!,
      endpoint: process.env.AZURE_COMPUTER_VISION_ENDPOINT!,
    },
  },

  // AI Services
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY!,
    googleAiApiKey: process.env.GOOGLE_AI_API_KEY!,
  },

  // File Storage
  storage: {
    s3: {
      bucket: process.env.AWS_S3_BUCKET!,
      region: process.env.AWS_S3_REGION!,
    },
  },

  // Rate Limiting
  rateLimit: {
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000'),
  },

  // App Settings
  app: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    supportedFormats: ['image/jpeg', 'image/png', 'application/pdf'],
    ocrTimeout: 30000, // 30 seconds
    evaluationTimeout: 60000, // 1 minute
  },
} as const;
