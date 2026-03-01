const mongoose = require("mongoose");

// ─────────────────────────────────────────────
// Subscription Model — mirrors Firestore structure from Flutter app
// Path: users/{userId}/subscriptions/{subscriptionId}
// ─────────────────────────────────────────────
const subscriptionSchema = new mongoose.Schema(
  {
    // ── User Reference ─────────────────────
    userId: {
      type: String,
      required: true,
      index: true,
    },

    // ── Order & Transaction ────────────────
    orderId: {
      type: String,
      required: true,
    },
    transactionId: {
      type: String,
      default: null,
    },

    // ── Plan Details ───────────────────────
    planType: {
      type: String,
      enum: ["self_managed", "company_managed"],
      required: true,
    },
    planLabel: {
      type: String, // "3 Months", "6 Months", "Yearly"
      required: true,
    },
    planKey: {
      type: String,
      enum: ["3m", "6m", "1y"],
      required: true,
    },
    units: {
      type: Number,
      required: true,
      min: 1,
    },
    pricePerUnit: {
      type: Number,
      required: true,
    },
    totalPrice: {
      type: Number,
      required: true,
    },

    // ── Dates ──────────────────────────────
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },

    // ── Payment Info ───────────────────────
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      default: "sslcommerz",
    },

    // ── SSLCommerz specific fields ─────────
    sessionKey: {
      type: String,
      default: null,
    },
    gatewayPageURL: {
      type: String,
      default: null,
    },
    bankTransactionId: {
      type: String,
      default: null,
    },
    cardType: {
      type: String,
      default: null,
    },
    cardIssuer: {
      type: String,
      default: null,
    },
    validationId: {
      type: String,
      default: null,
    },

    // ── Activation ─────────────────────────
    isActive: {
      type: Boolean,
      default: false,
    },

    // ── Raw IPN data ───────────────────────
    ipnResponse: {
      type: Object,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// ── Virtual: isExpired ──────────────────────
subscriptionSchema.virtual("isExpired").get(function () {
  return new Date() > this.endDate;
});

// ── Virtual: isValid ────────────────────────
// Matches: bool get isValid => isActive && !isExpired && paymentStatus == 'completed';
subscriptionSchema.virtual("isValid").get(function () {
  return this.isActive && !this.isExpired && this.paymentStatus === "completed";
});

// ── Virtual: daysRemaining ──────────────────
subscriptionSchema.virtual("daysRemaining").get(function () {
  const diff = this.endDate - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

// Include virtuals in JSON/Object output
subscriptionSchema.set("toJSON", { virtuals: true });
subscriptionSchema.set("toObject", { virtuals: true });

// ── Static: Calculate End Date ──────────────
// '3m' → +3 months, '6m' → +6 months, '1y' → +1 year
subscriptionSchema.statics.calculateEndDate = function (startDate, planKey) {
  const end = new Date(startDate);
  switch (planKey) {
    case "3m":
      end.setMonth(end.getMonth() + 3);
      break;
    case "6m":
      end.setMonth(end.getMonth() + 6);
      break;
    case "1y":
      end.setFullYear(end.getFullYear() + 1);
      break;
    default:
      end.setMonth(end.getMonth() + 3);
  }
  return end;
};

// ── Static: Get Plan Label ──────────────────
// '3m' → '3 Months', '6m' → '6 Months', '1y' → 'Yearly'
subscriptionSchema.statics.getPlanLabel = function (planKey) {
  const labels = {
    "3m": "3 Months",
    "6m": "6 Months",
    "1y": "Yearly",
  };
  return labels[planKey] || "3 Months";
};

// ── Static: Calculate Total Price ───────────
// units × pricePerUnit × months (yearly = 20% discount)
subscriptionSchema.statics.calculateTotalPrice = function (
  units,
  pricePerUnit,
  planKey
) {
  let total = units * pricePerUnit;
  switch (planKey) {
    case "3m":
      total *= 3;
      break;
    case "6m":
      total *= 6;
      break;
    case "1y":
      total *= 12 * 0.8; // 20% yearly discount
      break;
    default:
      total *= 3;
  }
  return total;
};

// ── Static: Get Price Per Unit by Plan Type ──
subscriptionSchema.statics.getPricePerUnit = function (planType) {
  return planType === "company_managed" ? 1500 : 200;
};

module.exports = mongoose.model("Subscription", subscriptionSchema);