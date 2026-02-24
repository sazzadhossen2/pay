const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");

// ══════════════════════════════════════════════
// 🔵 USER CALLS THESE APIs FROM FLUTTER
// ══════════════════════════════════════════════
router.post("/init", paymentController.initPayment);
router.get("/status/:transactionId", paymentController.getPaymentStatus);

// ══════════════════════════════════════════════
// 🔒 SSLCommerz Internal Callbacks (auto-called by SSLCommerz, NOT by user)
// ══════════════════════════════════════════════
router.post("/success", paymentController.paymentSuccess);
router.post("/fail", paymentController.paymentFail);
router.post("/cancel", paymentController.paymentCancel);
router.post("/ipn", paymentController.paymentIPN);

module.exports = router;
