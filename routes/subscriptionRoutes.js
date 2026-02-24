const express = require("express");
const router = express.Router();
const subscriptionController = require("../controllers/subscriptionController");

// ── GET Routes ───────────────────────────────

// Get available subscription plans (Self Managed & Company Managed)
router.get("/plans", subscriptionController.getPlans);

// Get active subscription for a user
router.get("/user/:userId", subscriptionController.getUserSubscription);

// Get full subscription history for a user
router.get("/user/:userId/history", subscriptionController.getUserSubscriptionHistory);

// ── POST Routes ──────────────────────────────

// Calculate price before payment (preview)
router.post("/calculate-price", subscriptionController.calculatePrice);

// Check subscription validity
router.post("/check-validity", subscriptionController.checkValidity);

module.exports = router;
