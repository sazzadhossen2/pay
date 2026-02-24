# SSLCommerz Subscription Payment Backend — AHTM Property Management

> **Backend for:** Flutter Web subscription payment (mirrors Stripe flow from docs)  
> **Payment Gateway:** SSLCommerz (Sandbox/Live)  
> **Stack:** Node.js + Express.js + MongoDB + Mongoose

---

## Setup

```bash
npm install
# Update .env with your credentials
npm run dev    # development (nodemon)
npm start      # production
```

---

## Complete API Reference

### PAYMENT ENDPOINTS

---

#### `POST /api/payment/init` — Initialize Payment

Flutter app calls this to start SSLCommerz payment session. Creates a **PENDING** subscription and returns `gatewayPageURL` to redirect user.

**Request Body:**
```json
{
  "userId": "firebase_user_uid_123",
  "customerName": "Sazzad",
  "customerEmail": "sazzad@example.com",
  "customerPhone": "01700000000",
  "customerAddress": "Dhaka, Bangladesh",
  "planType": "self_managed",
  "planKey": "3m",
  "units": 2
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `userId` | string | ✅ | Firebase UID |
| `customerName` | string | ✅ | |
| `customerEmail` | string | ✅ | |
| `customerPhone` | string | ✅ | |
| `customerAddress` | string | ❌ | Default: "Dhaka" |
| `planType` | string | ✅ | `self_managed` \| `company_managed` |
| `planKey` | string | ✅ | `3m` \| `6m` \| `1y` |
| `units` | number | ✅ | min: 1 |

**Response (200):**
```json
{
  "success": true,
  "message": "Payment session created",
  "data": {
    "subscriptionId": "65f1a2b3c4d5e6f7a8b9c0d1",
    "orderId": "ORD_1740307200000",
    "transactionId": "SSL_firebase_user_uid_123_1740307200000",
    "gatewayPageURL": "https://sandbox.sslcommerz.com/EasyCheckOut/testcde123",
    "sessionKey": "A1B2C3D4E5F6...",
    "amount": 1200,
    "currency": "BDT",
    "planType": "self_managed",
    "planLabel": "3 Months",
    "planKey": "3m",
    "units": 2,
    "pricePerUnit": 200,
    "startDate": "2026-02-23T00:00:00.000Z",
    "endDate": "2026-05-23T00:00:00.000Z"
  }
}
```

**Price Calculation (matches Flutter):**
- Self Managed: ৳200/unit/month
- Company Managed: ৳1500/unit/month
- Yearly: 20% discount
- Example: 2 units × ৳200 × 3 months = **৳1,200**

---

#### `POST /api/payment/success` — SSLCommerz Success Callback

SSLCommerz POSTs here after successful payment. **Do NOT call from Flutter.**

**What happens:**
1. Validates with SSLCommerz API
2. Deactivates ALL old active subscriptions for the user
3. Activates the new subscription: `paymentStatus: 'completed'`, `isActive: true`
4. Redirects to: `{FRONTEND_URL}/payment/success?tran_id=xxx&subscription_id=xxx`

---

#### `POST /api/payment/fail` — SSLCommerz Fail Callback

SSLCommerz POSTs here on failed payment. Sets `paymentStatus: 'failed'`.  
Redirects to: `{FRONTEND_URL}/payment/fail?tran_id=xxx`

---

#### `POST /api/payment/cancel` — SSLCommerz Cancel Callback

SSLCommerz POSTs here when user cancels. Sets `paymentStatus: 'cancelled'`.  
Redirects to: `{FRONTEND_URL}/payment/cancel?tran_id=xxx`

---

#### `POST /api/payment/ipn` — Instant Payment Notification

Server-to-server notification from SSLCommerz.

**Response (200):**
```json
{ "message": "IPN received" }
```

---

#### `GET /api/payment/status/:transactionId` — Check Payment Status

**Response (200):**
```json
{
  "success": true,
  "data": {
    "subscriptionId": "65f1a2b3c4d5e6f7a8b9c0d1",
    "orderId": "ORD_1740307200000",
    "transactionId": "SSL_user123_1740307200000",
    "planType": "self_managed",
    "planLabel": "3 Months",
    "planKey": "3m",
    "units": 2,
    "pricePerUnit": 200,
    "totalPrice": 1200,
    "startDate": "2026-02-23T00:00:00.000Z",
    "endDate": "2026-05-23T00:00:00.000Z",
    "paymentStatus": "completed",
    "paymentMethod": "sslcommerz",
    "isActive": true,
    "isExpired": false,
    "isValid": true,
    "daysRemaining": 89,
    "createdAt": "2026-02-23T00:00:00.000Z"
  }
}
```

---

#### `GET /api/payment/history/:userId` — Payment History

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "subscriptionId": "...",
      "orderId": "ORD_...",
      "transactionId": "SSL_...",
      "planType": "self_managed",
      "planLabel": "3 Months",
      "planKey": "3m",
      "units": 2,
      "pricePerUnit": 200,
      "totalPrice": 1200,
      "paymentStatus": "completed",
      "paymentMethod": "sslcommerz",
      "isActive": true,
      "isExpired": false,
      "isValid": true,
      "daysRemaining": 89,
      "startDate": "...",
      "endDate": "...",
      "createdAt": "..."
    }
  ]
}
```

---

#### `GET /api/payment/validate/:valId` — Validate Transaction

**Response (200):**
```json
{
  "success": true,
  "data": { "...SSLCommerz validation response..." }
}
```

---

#### `POST /api/payment/refund` — Refund Payment

**Request Body:**
```json
{
  "transactionId": "SSL_user123_1740307200000",
  "refundAmount": 1200,
  "refundRemarks": "Customer request"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Refund initiated",
  "data": { "...SSLCommerz refund response..." }
}
```

---

### SUBSCRIPTION ENDPOINTS

---

#### `GET /api/subscription/plans` — Get Available Plans

Returns plan details matching the Flutter PricingCardsSection.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "self_managed": {
      "name": "Self Managed",
      "description": "User manages units & tenants themselves",
      "pricePerUnit": 200,
      "currency": "BDT",
      "durations": {
        "3m": { "label": "3 Months", "months": 3, "discount": 0, "totalPerUnit": 600 },
        "6m": { "label": "6 Months", "months": 6, "discount": 0, "totalPerUnit": 1200 },
        "1y": { "label": "Yearly", "months": 12, "discount": 20, "totalPerUnit": 1920 }
      }
    },
    "company_managed": {
      "name": "Company Managed",
      "description": "Company handles full management",
      "pricePerUnit": 1500,
      "currency": "BDT",
      "durations": {
        "3m": { "label": "3 Months", "months": 3, "discount": 0, "totalPerUnit": 4500 },
        "6m": { "label": "6 Months", "months": 6, "discount": 0, "totalPerUnit": 9000 },
        "1y": { "label": "Yearly", "months": 12, "discount": 20, "totalPerUnit": 14400 }
      }
    }
  }
}
```

---

#### `POST /api/subscription/calculate-price` — Price Preview

**Request Body:**
```json
{
  "planType": "self_managed",
  "planKey": "3m",
  "units": 2
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "planType": "self_managed",
    "planLabel": "3 Months",
    "planKey": "3m",
    "units": 2,
    "pricePerUnit": 200,
    "totalPrice": 1200,
    "currency": "BDT",
    "breakdown": "2 units × ৳200 × 3 months = ৳1,200",
    "startDate": "2026-02-23T00:00:00.000Z",
    "endDate": "2026-05-23T00:00:00.000Z"
  }
}
```

---

#### `GET /api/subscription/user/:userId` — Get Active Subscription

Mirrors Flutter's `loadCurrentSubscription()`.

**Response (200) — Active:**
```json
{
  "success": true,
  "hasActiveSubscription": true,
  "data": {
    "subscriptionId": "...",
    "orderId": "ORD_...",
    "transactionId": "SSL_...",
    "planType": "self_managed",
    "planLabel": "3 Months",
    "planKey": "3m",
    "units": 2,
    "pricePerUnit": 200,
    "totalPrice": 1200,
    "startDate": "2026-02-23T...",
    "endDate": "2026-05-23T...",
    "paymentStatus": "completed",
    "paymentMethod": "sslcommerz",
    "isActive": true,
    "isExpired": false,
    "isValid": true,
    "daysRemaining": 89,
    "createdAt": "..."
  }
}
```

**Response (200) — No subscription:**
```json
{
  "success": true,
  "hasActiveSubscription": false,
  "message": "No active subscription found",
  "data": null
}
```

---

#### `GET /api/subscription/user/:userId/history` — Subscription History

**Response (200):**
```json
{
  "success": true,
  "data": [ "...array of subscription objects..." ]
}
```

---

#### `POST /api/subscription/check-validity` — Check Validity

Mirrors Flutter's: `bool get isValid => isActive && !isExpired && paymentStatus == 'completed'`

**Request Body:**
```json
{
  "userId": "firebase_user_uid_123"
}
```

**Response (200):**
```json
{
  "success": true,
  "isValid": true,
  "isActive": true,
  "isExpired": false,
  "paymentStatus": "completed",
  "daysRemaining": 89,
  "planType": "self_managed",
  "planLabel": "3 Months"
}
```

---

## Complete Payment Flow (SSLCommerz version of Stripe flow)

```
Flutter App                          Backend Server                    SSLCommerz
─────────                            ──────────────                    ──────────
1. User selects plan
   (self_managed/company_managed)
   Configures: units, duration(3m/6m/1y)
              │
              ▼
2. POST /api/payment/init ──────────► 3. Calculate price
   { userId, planType,                   Create PENDING subscription
     planKey, units,                     Init SSLCommerz session ──────► 4. Create session
     customerName, ... }                                               ◄── Return gatewayPageURL
                                     ◄── Return gatewayPageURL
              │
              ▼
5. Open gatewayPageURL
   in WebView/browser ─────────────────────────────────────────────────► 6. User pays on
                                                                           SSLCommerz page
                                                                              │
                                     7. POST /api/payment/success ◄───────────┘
                                        Validate with SSLCommerz ──────► 8. Validate
                                        Deactivate old subs              ◄── VALID ✅
                                        Activate new sub:
                                          paymentStatus: 'completed'
                                          isActive: true
                                        Redirect to frontend
              │
              ▼
9. Frontend receives redirect
   /payment/success?tran_id=xxx
              │
              ▼
10. GET /api/subscription/user/:userId ──► 11. Return active subscription
              │                                 isValid: true ✅
              ▼
12. Dashboard shows "Active"
    All features unlocked ✅
```

---

## Subscription Validity (3 conditions — matches Flutter)

```
isValid = isActive && !isExpired && paymentStatus == 'completed'
           ──────     ─────────     ─────────────────────────────
             ✅          ✅                    ✅
```

| Condition | Set By | When |
|-----------|--------|------|
| `isActive: true` | `/api/payment/success` callback | After SSLCommerz confirms payment |
| `paymentStatus: 'completed'` | `/api/payment/success` callback | Same time |
| `!isExpired` | Calculated | `now < endDate` |

---

## MongoDB Document Structure

**Collection:** `subscriptions`

| Field | Type | Example |
|-------|------|---------|
| `userId` | String | `firebase_uid_123` |
| `orderId` | String | `ORD_1740307200000` |
| `transactionId` | String | `SSL_uid123_1740307200000` |
| `planType` | String | `self_managed` |
| `planLabel` | String | `3 Months` |
| `planKey` | String | `3m` |
| `units` | Number | `2` |
| `pricePerUnit` | Number | `200` |
| `totalPrice` | Number | `1200` |
| `startDate` | Date | `2026-02-23` |
| `endDate` | Date | `2026-05-23` |
| `paymentStatus` | String | `completed` ✅ |
| `paymentMethod` | String | `sslcommerz` |
| `isActive` | Boolean | `true` ✅ |
| `sessionKey` | String | SSLCommerz session key |
| `gatewayPageURL` | String | SSLCommerz gateway URL |
| `bankTransactionId` | String | Bank tran ID |
| `cardType` | String | VISA/Master |
| `validationId` | String | SSLCommerz val_id |
| `ipnResponse` | Object | Raw IPN data |
| `createdAt` | Date | Auto |
| `updatedAt` | Date | Auto |

---

## SSLCommerz Sandbox Credentials

| Key | Value |
|-----|-------|
| **Store ID** | `sazza694eb99831101` |
| **Store Password** | `sazza694eb99831101@ssl` |
| **Session API** | `https://sandbox.sslcommerz.com/gwprocess/v3/api.php` |
| **Validation API** | `https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php` |
| **Mode** | Sandbox |
