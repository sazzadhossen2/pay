# Project Guidelines — SSLCommerz Subscription Payment Backend

## Architecture

Single-service Node.js backend for Flutter app subscription payments via SSLCommerz gateway.

- **Stack:** Express 5 + Mongoose 9 + MongoDB + SSLCommerz API
- **Entry point:** [server.js](../server.js) — bootstraps app, connects MongoDB, mounts routes, serves Swagger UI and `/payment-result` HTML page
- **Single collection:** `subscriptions` in MongoDB stores both payment and subscription data ([models/Subscription.js](../models/Subscription.js))
- **No authentication** — `userId` (Firebase UID) is trusted from the request body; endpoints are public
- **Payment flow:** Flutter → `POST /api/payment/init` → server creates pending subscription + calls SSLCommerz session API → returns `gatewayPageURL` → user pays on SSLCommerz page → SSLCommerz POSTs to `/api/payment/success` (or fail/cancel/ipn) → server validates, activates subscription, redirects to `/payment-result`

## Code Style

- CommonJS modules (`require`/`module.exports`), no TypeScript
- Controllers are `async (req, res)` handlers with try/catch; always return `{ success, message, data }` JSON envelope
- Manual field validation in controllers (no Joi/Zod/express-validator)
- Mongoose model statics for shared business logic: `calculateEndDate`, `getPricePerUnit`, `calculateTotalPrice` in [models/Subscription.js](../models/Subscription.js)
- SSLCommerz integration encapsulated in singleton class at [services/sslcommerz.js](../services/sslcommerz.js)
- Inline Bengali comments in some files — preserve them when editing

## Build and Test

```bash
npm install          # install dependencies
npm run dev          # development with nodemon
npm start            # production: node server.js
```

- No test framework configured — no tests exist
- Requires `.env` with: `PORT`, `BASE_URL`, `MONGODB_URI`, `FRONTEND_URL`, `STORE_ID`, `STORE_PASSWORD`, `SSLCOMMERZ_SESSION_API`, `SSLCOMMERZ_VALIDATION_API`, `IS_LIVE`
- Config centralized in [config/index.js](../config/index.js) via `dotenv`

## Project Conventions

- **Pricing is hardcoded** in both [models/Subscription.js](../models/Subscription.js) statics and [controllers/subscriptionController.js](../controllers/subscriptionController.js) `getPlans` — keep them in sync when changing prices
- **Lazy expiration:** expired subscriptions are deactivated on read (in `getUserSubscription`), not via cron or TTL
- **Dual activation path:** both `/success` callback and `/ipn` handler can activate a subscription for reliability
- **SSLCommerz callbacks** use `application/x-www-form-urlencoded` (not JSON) — server.js parses both
- **`/payment-result`** is a server-rendered HTML page with inline script for Flutter WebView detection — not a frontend route
- Swagger docs served via custom [swagger-ui.html](../swagger-ui.html) + [swagger.json](../swagger.json), not via `swagger-ui-express` middleware

## Known Issues

- 3 controller methods exported but **never routed**: `getPaymentHistory`, `validatePayment`, `refundPayment` in [controllers/paymentController.js](../controllers/paymentController.js)
- `uuid` and `swagger-ui-express` are in dependencies but unused
- No index on `transactionId` in Mongoose schema (used for callback lookups)
- `transactionQueryByTranId` in [services/sslcommerz.js](../services/sslcommerz.js) is defined but never called

## Integration Points

- **SSLCommerz:** Session init, transaction validation, refund — all via `axios` + `form-data` in [services/sslcommerz.js](../services/sslcommerz.js)
- **MongoDB Atlas:** DNS override in server.js (`dns.setServers`) for SRV resolution
- **Flutter WebView:** Detects `/payment-result` URL and reads query params (`status`, `tran_id`, `subscription_id`)
- CORS is fully open (`origin: "*"`)
