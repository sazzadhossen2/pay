const Subscription = require("../models/Subscription");
const sslcommerzService = require("../services/sslcommerz");
const config = require("../config");

// ═════════════════════════════════════════════════════════════
// PAYMENT CONTROLLER
// Mirrors the Stripe flow from the Flutter doc:
//   Step 3: processPayment() → Step 5: processStripePayment()
//   Step 7: Payment Processing → Step 8: Activation
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// POST /api/payment/init
// ─────────────────────────────────────────────
// Flutter app calls this to start SSLCommerz payment
// Equivalent to: StripeService.processStripePayment() (Step 5)
//
// REQUEST BODY:
// {
//   "userId": "firebase_user_uid_123",
//   "customerName": "Sazzad",
//   "customerEmail": "sazzad@example.com",
//   "customerPhone": "01700000000",
//   "customerAddress": "Dhaka, Bangladesh",   // optional
//   "planType": "self_managed",               // "self_managed" | "company_managed"
//   "planKey": "3m",                          // "3m" | "6m" | "1y"
//   "units": 2                                // number of units
// }
//
// RESPONSE (200):
// {
//   "success": true,
//   "message": "Payment session created",
//   "data": {
//     "subscriptionId": "mongo_doc_id",
//     "orderId": "ORD_1740307200000",
//     "transactionId": "SSL_firebase_user_uid_123_1740307200000",
//     "gatewayPageURL": "https://sandbox.sslcommerz.com/...",
//     "sessionKey": "...",
//     "amount": 1200,
//     "currency": "BDT",
//     "planType": "self_managed",
//     "planLabel": "3 Months",
//     "planKey": "3m",
//     "units": 2,
//     "pricePerUnit": 200,
//     "startDate": "2026-02-23T...",
//     "endDate": "2026-05-23T..."
//   }
// }
// ─────────────────────────────────────────────
exports.initPayment = async (req, res) => {
  try {
    const {
      userId,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      planType,
      planKey,
      units,
      // ── Dynamic client-side redirect URLs (from Flutter) ──
      // Flutter WebView থেকে pass করবে, payment শেষে এই URL-এ redirect হবে
      success_url,  // e.g. "myapp://payment/success"
      fail_url,     // e.g. "myapp://payment/fail"
      cancel_url,   // e.g. "myapp://payment/cancel"
    } = req.body;

    // ── Validate required fields ──────────
    if (!userId || !customerName || !customerEmail || !customerPhone || !planType || !planKey || !units) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        requiredFields: {
          userId: "string (Firebase UID)",
          customerName: "string",
          customerEmail: "string",
          customerPhone: "string",
          planType: "self_managed | company_managed",
          planKey: "3m | 6m | 1y",
          units: "number (min 1)",
        },
      });
    }

    // ── Validate planType ─────────────────
    if (!["self_managed", "company_managed"].includes(planType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid planType. Must be 'self_managed' or 'company_managed'",
      });
    }

    // ── Validate planKey ──────────────────
    if (!["1m", "3m", "6m", "1y"].includes(planKey)) {
      return res.status(400).json({
        success: false,
        message: "Invalid planKey. Must be '1m', '3m', '6m', or '1y'",
      });
    }

    // ── Calculate pricing (mirrors Flutter totalPrice getter) ──
    const pricePerUnit = Subscription.getPricePerUnit(planType);
    const totalPrice = Subscription.calculateTotalPrice(units, pricePerUnit, planKey);
    const planLabel = Subscription.getPlanLabel(planKey);

    // ── Generate IDs (mirrors Step 5a) ────
    const now = Date.now();
    const transactionId = `SSL_${userId}_${now}`;
    const orderId = `ORD_${now}`;

    // ── Calculate dates (mirrors Step 5b) ──
    const startDate = new Date();
    const endDate = Subscription.calculateEndDate(startDate, planKey);

    // ── Create PENDING subscription in DB (mirrors Step 5c) ──
    // Firestore equivalent: users/{userId}/subscriptions/{autoId}
    // paymentStatus: 'pending', isActive: false
    const subscription = await Subscription.create({
      userId,
      orderId,
      transactionId,
      planType,
      planLabel,
      planKey,
      units,
      pricePerUnit,
      totalPrice,
      startDate,
      endDate,
      paymentStatus: "pending",
      paymentMethod: "sslcommerz",
      isActive: false,
      // ── Store client redirect URLs (Flutter WebView এ dynamic URL) ──
      clientSuccessUrl: success_url || null,
      clientFailUrl: fail_url || null,
      clientCancelUrl: cancel_url || null,
    });

    // ── Init SSLCommerz session (mirrors Step 5d) ──
    // Dynamically detect base URL from the incoming request
    // so callback URLs always match the website's actual domain
    const dynamicBaseUrl = `${req.protocol}://${req.get("host")}`;

    const sslResult = await sslcommerzService.initPayment({
      transactionId,
      amount: totalPrice,
      currency: "BDT",
      customerName,
      customerEmail,
      customerPhone,
      customerAddress: customerAddress || "Dhaka",
      productName: `${planType === "company_managed" ? "Company Managed" : "Self Managed"} - ${planLabel}`,
      productCategory: "Subscription",
      baseUrl: dynamicBaseUrl,
    });

    if (!sslResult.success) {
      subscription.paymentStatus = "failed";
      await subscription.save();
      return res.status(400).json({
        success: false,
        message: sslResult.message || "Failed to create payment session",
        details: sslResult.data || null,
      });
    }

    // ── Save session info ─────────────────
    subscription.sessionKey = sslResult.sessionKey;
    subscription.gatewayPageURL = sslResult.gatewayPageURL;
    await subscription.save();

    // ── Return gateway URL to Flutter ─────
    return res.status(200).json({
      success: true,
      message: "Payment session created",
      data: {
        subscriptionId: subscription._id,
        orderId: subscription.orderId,
        transactionId: subscription.transactionId,
        gatewayPageURL: sslResult.gatewayPageURL,
        sessionKey: sslResult.sessionKey,
        amount: totalPrice,
        currency: "BDT",
        planType,
        planLabel,
        planKey,
        units,
        pricePerUnit,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
      },
    });
  } catch (error) {
    console.error("Payment Init Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// POST /api/payment/success  (SSLCommerz callback)
// ─────────────────────────────────────────────
// Mirrors Step 8: _activateSubscription()
//   - Deactivate ALL old active subs for user
//   - Activate the NEW subscription
//   - paymentStatus → 'completed', isActive → true
//
// SSLCommerz POSTs this data:
// { tran_id, val_id, amount, card_type, card_issuer, bank_tran_id, status, ... }
//
// REDIRECTS to: {FRONTEND_URL}/payment/success?tran_id=xxx
// ─────────────────────────────────────────────
exports.paymentSuccess = async (req, res) => {
  try {
    const { tran_id, val_id, amount, card_type, card_issuer, bank_tran_id } =
      req.body;

    console.log("✅ Payment Success Callback:", { tran_id, val_id, amount });

    const subscription = await Subscription.findOne({ transactionId: tran_id });
    if (!subscription) {
      return res.redirect(
        `/payment-result?status=fail&message=Transaction+not+found`
      );
    }

    // ── Validate with SSLCommerz (verify genuine payment) ──
    const validation = await sslcommerzService.validateTransaction(val_id);

    if (validation.status === "VALID" || validation.status === "VALIDATED") {
      // ── Step 8a: Deactivate ALL existing active subs for this user ──
      await Subscription.updateMany(
        { userId: subscription.userId, isActive: true },
        { isActive: false, updatedAt: new Date() }
      );

      // ── Step 8b: Activate the NEW subscription ──
      subscription.paymentStatus = "completed";
      subscription.isActive = true;
      subscription.bankTransactionId = bank_tran_id;
      subscription.cardType = card_type;
      subscription.cardIssuer = card_issuer;
      subscription.validationId = val_id;
      subscription.ipnResponse = req.body;
      await subscription.save();

      console.log("✅ Subscription Activated:", {
        id: subscription._id,
        userId: subscription.userId,
        plan: subscription.planLabel,
        endDate: subscription.endDate,
      });

      // ── Redirect to client-provided URL or fallback to payment-result page ──
      if (subscription.clientSuccessUrl) {
        const redirectUrl = new URL(subscription.clientSuccessUrl);
        redirectUrl.searchParams.set('status', 'success');
        redirectUrl.searchParams.set('tran_id', tran_id);
        redirectUrl.searchParams.set('subscription_id', subscription._id.toString());
        return res.redirect(303, redirectUrl.toString());
      }
      return res.redirect(303, `/payment-result?status=success&tran_id=${tran_id}&subscription_id=${subscription._id}`);
    } else {
      subscription.paymentStatus = "failed";
      subscription.ipnResponse = req.body;
      await subscription.save();

      // ── Redirect to client-provided fail URL or fallback ──
      if (subscription.clientFailUrl) {
        const redirectUrl = new URL(subscription.clientFailUrl);
        redirectUrl.searchParams.set('status', 'fail');
        redirectUrl.searchParams.set('tran_id', tran_id);
        return res.redirect(303, redirectUrl.toString());
      }
      return res.redirect(303, `/payment-result?status=fail&tran_id=${tran_id}`);
    }
  } catch (error) {
    console.error("Payment Success Error:", error);
    return res.redirect(303, `/payment-result?status=fail&message=Server+error`);
  }
};

// ─────────────────────────────────────────────
// POST /api/payment/fail  (SSLCommerz callback)
// ─────────────────────────────────────────────
// SSLCommerz POSTs: { tran_id, ... }
// REDIRECTS to: {FRONTEND_URL}/payment/fail?tran_id=xxx
// ─────────────────────────────────────────────
exports.paymentFail = async (req, res) => {
  try {
    const { tran_id } = req.body;
    console.log("❌ Payment Failed:", { tran_id });

    const subscription = await Subscription.findOne({ transactionId: tran_id });
    if (subscription) {
      subscription.paymentStatus = "failed";
      subscription.ipnResponse = req.body;
      await subscription.save();

      // ── Redirect to client-provided fail URL or fallback ──
      if (subscription.clientFailUrl) {
        const redirectUrl = new URL(subscription.clientFailUrl);
        redirectUrl.searchParams.set('status', 'fail');
        redirectUrl.searchParams.set('tran_id', tran_id);
        return res.redirect(303, redirectUrl.toString());
      }
    }

    return res.redirect(303, `/payment-result?status=fail&tran_id=${tran_id || ''}`);
  } catch (error) {
    console.error("Payment Fail Error:", error);
    return res.redirect(303, `/payment-result?status=fail`);
  }
};

// ─────────────────────────────────────────────
// POST /api/payment/cancel  (SSLCommerz callback)
// ─────────────────────────────────────────────
// SSLCommerz POSTs: { tran_id, ... }
// REDIRECTS to: {FRONTEND_URL}/payment/cancel?tran_id=xxx
// ─────────────────────────────────────────────
exports.paymentCancel = async (req, res) => {
  try {
    const { tran_id } = req.body;
    console.log("🚫 Payment Cancelled:", { tran_id });

    const subscription = await Subscription.findOne({ transactionId: tran_id });
    if (subscription) {
      subscription.paymentStatus = "cancelled";
      subscription.ipnResponse = req.body;
      await subscription.save();

      // ── Redirect to client-provided cancel URL or fallback ──
      if (subscription.clientCancelUrl) {
        const redirectUrl = new URL(subscription.clientCancelUrl);
        redirectUrl.searchParams.set('status', 'cancelled');
        redirectUrl.searchParams.set('tran_id', tran_id);
        return res.redirect(303, redirectUrl.toString());
      }
    }

    return res.redirect(303, `/payment-result?status=cancelled&tran_id=${tran_id || ''}`);
  } catch (error) {
    console.error("Payment Cancel Error:", error);
    return res.redirect(303, `/payment-result?status=cancelled`);
  }
};

// ─────────────────────────────────────────────
// POST /api/payment/ipn  (Instant Payment Notification)
// ─────────────────────────────────────────────
// SSLCommerz server-to-server notification
// SSLCommerz POSTs: { tran_id, val_id, status, ... }
//
// RESPONSE (200):
// { "message": "IPN received" }
// ─────────────────────────────────────────────
exports.paymentIPN = async (req, res) => {
  try {
    const { tran_id, val_id, status } = req.body;
    console.log("📨 IPN Received:", { tran_id, val_id, status });

    const subscription = await Subscription.findOne({ transactionId: tran_id });
    if (!subscription) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    // Validate with SSLCommerz
    if (val_id) {
      const validation = await sslcommerzService.validateTransaction(val_id);
      if (validation.status === "VALID" || validation.status === "VALIDATED") {
        // Deactivate old subscriptions
        await Subscription.updateMany(
          { userId: subscription.userId, isActive: true, _id: { $ne: subscription._id } },
          { isActive: false, updatedAt: new Date() }
        );
        // Activate this one
        subscription.paymentStatus = "completed";
        subscription.isActive = true;
        subscription.validationId = val_id;
      } else {
        subscription.paymentStatus = "failed";
      }
    }

    subscription.ipnResponse = req.body;
    await subscription.save();

    return res.status(200).json({ message: "IPN received" });
  } catch (error) {
    console.error("IPN Error:", error);
    return res.status(500).json({ message: "IPN processing error" });
  }
};

// ─────────────────────────────────────────────
// GET /api/payment/status/:transactionId
// ─────────────────────────────────────────────
// Check payment & subscription status by transaction ID
//
// RESPONSE (200):
// {
//   "success": true,
//   "data": {
//     "subscriptionId": "...",
//     "orderId": "ORD_1740307200000",
//     "transactionId": "SSL_user123_1740307200000",
//     "planType": "self_managed",
//     "planLabel": "3 Months",
//     "planKey": "3m",
//     "units": 2,
//     "pricePerUnit": 200,
//     "totalPrice": 1200,
//     "startDate": "2026-02-23T...",
//     "endDate": "2026-05-23T...",
//     "paymentStatus": "completed",
//     "paymentMethod": "sslcommerz",
//     "isActive": true,
//     "isExpired": false,
//     "isValid": true,
//     "daysRemaining": 89,
//     "createdAt": "2026-02-23T..."
//   }
// }
// ─────────────────────────────────────────────
exports.getPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const subscription = await Subscription.findOne({ transactionId });
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        subscriptionId: subscription._id,
        orderId: subscription.orderId,
        transactionId: subscription.transactionId,
        planType: subscription.planType,
        planLabel: subscription.planLabel,
        planKey: subscription.planKey,
        units: subscription.units,
        pricePerUnit: subscription.pricePerUnit,
        totalPrice: subscription.totalPrice,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        paymentStatus: subscription.paymentStatus,
        paymentMethod: subscription.paymentMethod,
        isActive: subscription.isActive,
        isExpired: subscription.isExpired,
        isValid: subscription.isValid,
        daysRemaining: subscription.daysRemaining,
        createdAt: subscription.createdAt,
      },
    });
  } catch (error) {
    console.error("Get Payment Status Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ─────────────────────────────────────────────
// GET /api/payment/history/:userId
// ─────────────────────────────────────────────
// Get all payment/subscription history for a user (sorted newest first)
//
// RESPONSE (200):
// {
//   "success": true,
//   "data": [
//     {
//       "subscriptionId": "...",
//       "orderId": "ORD_...",
//       "transactionId": "SSL_...",
//       "planType": "self_managed",
//       "planLabel": "3 Months",
//       "units": 2,
//       "pricePerUnit": 200,
//       "totalPrice": 1200,
//       "paymentStatus": "completed",
//       "isActive": true,
//       "isValid": true,
//       "daysRemaining": 89,
//       "startDate": "...",
//       "endDate": "...",
//       "createdAt": "..."
//     }
//   ]
// }
// ─────────────────────────────────────────────
exports.getPaymentHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    const subscriptions = await Subscription.find({ userId }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      data: subscriptions.map((sub) => ({
        subscriptionId: sub._id,
        orderId: sub.orderId,
        transactionId: sub.transactionId,
        planType: sub.planType,
        planLabel: sub.planLabel,
        planKey: sub.planKey,
        units: sub.units,
        pricePerUnit: sub.pricePerUnit,
        totalPrice: sub.totalPrice,
        paymentStatus: sub.paymentStatus,
        paymentMethod: sub.paymentMethod,
        isActive: sub.isActive,
        isExpired: sub.isExpired,
        isValid: sub.isValid,
        daysRemaining: sub.daysRemaining,
        startDate: sub.startDate,
        endDate: sub.endDate,
        createdAt: sub.createdAt,
      })),
    });
  } catch (error) {
    console.error("Get Payment History Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ─────────────────────────────────────────────
// GET /api/payment/validate/:valId
// ─────────────────────────────────────────────
// Manually validate a transaction with SSLCommerz
//
// RESPONSE (200):
// {
//   "success": true,
//   "data": { ... SSLCommerz validation response ... }
// }
// ─────────────────────────────────────────────
exports.validatePayment = async (req, res) => {
  try {
    const { valId } = req.params;
    const result = await sslcommerzService.validateTransaction(valId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Validate Payment Error:", error);
    return res.status(500).json({
      success: false,
      message: "Validation failed",
    });
  }
};

// ─────────────────────────────────────────────
// POST /api/payment/refund
// ─────────────────────────────────────────────
// Initiate refund for a completed subscription
//
// REQUEST BODY:
// {
//   "transactionId": "SSL_user123_1740307200000",
//   "refundAmount": 1200,        // optional, defaults to full amount
//   "refundRemarks": "Reason"    // optional
// }
//
// RESPONSE (200):
// {
//   "success": true,
//   "message": "Refund initiated",
//   "data": { ... SSLCommerz refund response ... }
// }
// ─────────────────────────────────────────────
exports.refundPayment = async (req, res) => {
  try {
    const { transactionId, refundAmount, refundRemarks } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "transactionId is required",
      });
    }

    const subscription = await Subscription.findOne({ transactionId });
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    if (subscription.paymentStatus !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Only completed payments can be refunded",
      });
    }

    const result = await sslcommerzService.initiateRefund({
      bankTransactionId: subscription.bankTransactionId,
      refundAmount: refundAmount || subscription.totalPrice,
      refundRemarks: refundRemarks || "Subscription refund",
    });

    if (result.status === "success") {
      subscription.paymentStatus = "refunded";
      subscription.isActive = false;
      await subscription.save();
    }

    return res.status(200).json({
      success: true,
      message: "Refund initiated",
      data: result,
    });
  } catch (error) {
    console.error("Refund Error:", error);
    return res.status(500).json({
      success: false,
      message: "Refund failed",
    });
  }
};