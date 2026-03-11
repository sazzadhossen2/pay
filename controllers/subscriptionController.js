const Subscription = require("../models/Subscription");

// ═════════════════════════════════════════════════════════════
// SUBSCRIPTION CONTROLLER
// Mirrors the Flutter app's SubscriptionService:
//   - loadCurrentSubscription()
//   - hasActiveSubscription check
//   - Subscription validity: isActive && !isExpired && paymentStatus == 'completed'
//   - Plan info (pricing cards from PricingCardsSection)
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// GET /api/subscription/plans
// ─────────────────────────────────────────────
// Returns available subscription plans (matches PricingCardsSection)
//
// RESPONSE (200):
// {
//   "success": true,
//   "data": {
//     "self_managed": {
//       "name": "Self Managed",
//       "description": "User manages units & tenants themselves",
//       "pricePerUnit": 200,
//       "currency": "BDT",
//       "durations": {
//         "3m": { "label": "3 Months", "months": 3, "discount": 0, "totalPerUnit": 600 },
//         "6m": { "label": "6 Months", "months": 6, "discount": 0, "totalPerUnit": 1200 },
//         "1y": { "label": "Yearly", "months": 12, "discount": 20, "totalPerUnit": 1920 }
//       }
//     },
//     "company_managed": {
//       "name": "Company Managed",
//       "description": "Company handles full management",
//       "pricePerUnit": 1500,
//       "currency": "BDT",
//       "durations": {
//         "3m": { "label": "3 Months", "months": 3, "discount": 0, "totalPerUnit": 4500 },
//         "6m": { "label": "6 Months", "months": 6, "discount": 0, "totalPerUnit": 9000 },
//         "1y": { "label": "Yearly", "months": 12, "discount": 20, "totalPerUnit": 14400 }
//       }
//     }
//   }
// }
// ─────────────────────────────────────────────
exports.getPlans = async (req, res) => {
  try {
    const plans = {
      self_managed: {
        name: "Self Managed",
        description: "User manages units & tenants themselves",
        pricePerUnit: 200,
        currency: "BDT",
        durations: {
          "1m": {
            label: "1 Month",
            months: 1,
            discount: 0,
            totalPerUnit: 200 * 1,
          },
          "3m": {
            label: "3 Months",
            months: 3,
            discount: 0,
            totalPerUnit: 200 * 3,
          },
          "6m": {
            label: "6 Months",
            months: 6,
            discount: 0,
            totalPerUnit: 200 * 6,
          },
          "1y": {
            label: "Yearly",
            months: 12,
            discount: 20,
            totalPerUnit: 200 * 12 * 0.8,
          },
        },
      },
      company_managed: {
        name: "Company Managed",
        description: "Company handles full management",
        pricePerUnit: 1500,
        currency: "BDT",
        durations: {
          "1m": {
            label: "1 Month",
            months: 1,
            discount: 0,
            totalPerUnit: 1500 * 1,
          },
          "3m": {
            label: "3 Months",
            months: 3,
            discount: 0,
            totalPerUnit: 1500 * 3,
          },
          "6m": {
            label: "6 Months",
            months: 6,
            discount: 0,
            totalPerUnit: 1500 * 6,
          },
          "1y": {
            label: "Yearly",
            months: 12,
            discount: 20,
            totalPerUnit: 1500 * 12 * 0.8,
          },
        },
      },
    };

    return res.status(200).json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error("Get Plans Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ─────────────────────────────────────────────
// POST /api/subscription/calculate-price
// ─────────────────────────────────────────────
// Calculate price before payment (preview)
// Mirrors Flutter's totalPrice getter in popup
//
// REQUEST BODY:
// {
//   "planType": "self_managed",
//   "planKey": "3m",
//   "units": 2
// }
//
// RESPONSE (200):
// {
//   "success": true,
//   "data": {
//     "planType": "self_managed",
//     "planLabel": "3 Months",
//     "planKey": "3m",
//     "units": 2,
//     "pricePerUnit": 200,
//     "totalPrice": 1200,
//     "currency": "BDT",
//     "breakdown": "2 units × ৳200 × 3 months = ৳1,200",
//     "startDate": "2026-02-23T...",
//     "endDate": "2026-05-23T..."
//   }
// }
// ─────────────────────────────────────────────
exports.calculatePrice = async (req, res) => {
  try {
    const { planType, planKey, units } = req.body;

    if (!planType || !planKey || !units) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: planType, planKey, units",
      });
    }

    if (!["self_managed", "company_managed"].includes(planType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid planType. Must be 'self_managed' or 'company_managed'",
      });
    }

    if (!["3m", "6m", "1y", "1m"].includes(planKey)) {
      return res.status(400).json({
        success: false,
        message: "Invalid planKey. Must be '1m', '3m', '6m', or '1y'",
      });
    }

    const pricePerUnit = Subscription.getPricePerUnit(planType);
    const totalPrice = Subscription.calculateTotalPrice(units, pricePerUnit, planKey);
    const planLabel = Subscription.getPlanLabel(planKey);

    const startDate = new Date();
    const endDate = Subscription.calculateEndDate(startDate, planKey);

    // Build human-readable breakdown
    let monthsText;
    let discountText = "";
    switch (planKey) {
      case "1m":
        monthsText = "1 month";
        break;
      case "3m":
        monthsText = "3 months";
        break;
      case "6m":
        monthsText = "6 months";
        break;
      case "1y":
        monthsText = "12 months";
        discountText = " (20% discount)";
        break;
    }
    const breakdown = `${units} units × ৳${pricePerUnit} × ${monthsText}${discountText} = ৳${totalPrice.toLocaleString()}`;

    return res.status(200).json({
      success: true,
      data: {
        planType,
        planLabel,
        planKey,
        units: Number(units),
        pricePerUnit,
        totalPrice,
        currency: "BDT",
        breakdown,
        startDate,
        endDate,
      },
    });
  } catch (error) {
    console.error("Calculate Price Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ─────────────────────────────────────────────
// GET /api/subscription/user/:userId
// ─────────────────────────────────────────────
// Get active subscription for user
// Mirrors Flutter's loadCurrentSubscription()
//
// Logic (from doc):
//   1. Query where isActive == true
//   2. Filter: paymentStatus == 'completed' && !isExpired
//   3. Sort by endDate descending → get latest
//
// RESPONSE (200) — Active subscription found:
// {
//   "success": true,
//   "hasActiveSubscription": true,
//   "data": {
//     "subscriptionId": "...",
//     "orderId": "ORD_...",
//     "planType": "self_managed",
//     "planLabel": "3 Months",
//     "planKey": "3m",
//     "units": 2,
//     "pricePerUnit": 200,
//     "totalPrice": 1200,
//     "startDate": "2026-02-23T...",
//     "endDate": "2026-05-23T...",
//     "paymentStatus": "completed",
//     "isActive": true,
//     "isExpired": false,
//     "isValid": true,
//     "daysRemaining": 89,
//     "paymentMethod": "sslcommerz",
//     "createdAt": "..."
//   }
// }
//
// RESPONSE (200) — No active subscription:
// {
//   "success": true,
//   "hasActiveSubscription": false,
//   "message": "No active subscription found",
//   "data": null
// }
// ─────────────────────────────────────────────
exports.getUserSubscription = async (req, res) => {
  try {
    const { userId } = req.params;

    // Step 1: Query isActive == true
    const activeSubscriptions = await Subscription.find({
      userId,
      isActive: true,
    });

    // Step 2: Filter completed & non-expired (mirrors Flutter logic)
    const validSubscriptions = activeSubscriptions.filter(
      (sub) => sub.paymentStatus === "completed" && !sub.isExpired
    );

    if (validSubscriptions.length === 0) {
      // Auto-deactivate any expired subs still marked active
      for (const sub of activeSubscriptions) {
        if (sub.isExpired) {
          sub.isActive = false;
          await sub.save();
        }
      }

      return res.status(200).json({
        success: true,
        hasActiveSubscription: false,
        message: "No active subscription found",
        data: null,
      });
    }

    // Step 3: Sort by endDate descending → get latest
    validSubscriptions.sort((a, b) => b.endDate - a.endDate);
    const current = validSubscriptions[0];

    return res.status(200).json({
      success: true,
      hasActiveSubscription: true,
      data: {
        subscriptionId: current._id,
        orderId: current.orderId,
        transactionId: current.transactionId,
        planType: current.planType,
        planLabel: current.planLabel,
        planKey: current.planKey,
        units: current.units,
        pricePerUnit: current.pricePerUnit,
        totalPrice: current.totalPrice,
        startDate: current.startDate,
        endDate: current.endDate,
        paymentStatus: current.paymentStatus,
        paymentMethod: current.paymentMethod,
        isActive: current.isActive,
        isExpired: current.isExpired,
        isValid: current.isValid,
        daysRemaining: current.daysRemaining,
        createdAt: current.createdAt,
      },
    });
  } catch (error) {
    console.error("Get User Subscription Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ─────────────────────────────────────────────
// GET /api/subscription/user/:userId/history
// ─────────────────────────────────────────────
// Get full subscription history for a user
//
// RESPONSE (200):
// {
//   "success": true,
//   "data": [
//     {
//       "subscriptionId": "...",
//       "orderId": "ORD_...",
//       "planType": "self_managed",
//       "planLabel": "3 Months",
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
exports.getUserSubscriptionHistory = async (req, res) => {
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
    console.error("Get Subscription History Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ─────────────────────────────────────────────
// POST /api/subscription/check-validity
// ─────────────────────────────────────────────
// Check if subscription is valid
// Mirrors Flutter's: bool get isValid => isActive && !isExpired && paymentStatus == 'completed'
//
// REQUEST BODY:
// {
//   "userId": "firebase_user_uid_123"
// }
//
// RESPONSE (200):
// {
//   "success": true,
//   "isValid": true,
//   "isActive": true,
//   "isExpired": false,
//   "paymentStatus": "completed",
//   "daysRemaining": 89,
//   "planType": "self_managed",
//   "planLabel": "3 Months"
// }
// ─────────────────────────────────────────────
exports.checkValidity = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const subscription = await Subscription.findOne({
      userId,
      isActive: true,
      paymentStatus: "completed",
    }).sort({ endDate: -1 });

    if (!subscription) {
      return res.status(200).json({
        success: true,
        isValid: false,
        isActive: false,
        isExpired: true,
        paymentStatus: null,
        daysRemaining: 0,
        planType: null,
        planLabel: null,
      });
    }

    // Auto-deactivate if expired
    if (subscription.isExpired) {
      subscription.isActive = false;
      await subscription.save();

      return res.status(200).json({
        success: true,
        isValid: false,
        isActive: false,
        isExpired: true,
        paymentStatus: subscription.paymentStatus,
        daysRemaining: 0,
        planType: subscription.planType,
        planLabel: subscription.planLabel,
      });
    }

    return res.status(200).json({
      success: true,
      isValid: subscription.isValid,
      isActive: subscription.isActive,
      isExpired: subscription.isExpired,
      paymentStatus: subscription.paymentStatus,
      daysRemaining: subscription.daysRemaining,
      planType: subscription.planType,
      planLabel: subscription.planLabel,
    });
  } catch (error) {
    console.error("Check Validity Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};