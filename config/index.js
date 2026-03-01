require("dotenv").config();

module.exports = {
  port: process.env.PORT || 5000,
  baseUrl: process.env.BASE_URL || "http://localhost:5000",
  mongodbUri:
    process.env.MONGODB_URI || "mongodb://localhost:27017/subscription_payment",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:8080",

  // SSLCommerz
  sslcommerz: {
    storeId: process.env.STORE_ID,
    storePassword: process.env.STORE_PASSWORD,
    sessionApi: process.env.SSLCOMMERZ_SESSION_API,
    validationApi: process.env.SSLCOMMERZ_VALIDATION_API,
    isLive: process.env.IS_LIVE === "true",
  },
};