const axios = require("axios");
const FormData = require("form-data");
const config = require("../config");

// ─────────────────────────────────────────────
// SSLCommerz Payment Service
// Mirrors StripeService flow from Flutter app
// Handles: Session init, Validation, Refund, Query
// ─────────────────────────────────────────────
class SSLCommerzService {
  constructor() {
    this.storeId = config.sslcommerz.storeId;
    this.storePassword = config.sslcommerz.storePassword;
    this.sessionApi = config.sslcommerz.sessionApi;
    this.validationApi = config.sslcommerz.validationApi;
    this.isLive = config.sslcommerz.isLive;
    this.baseUrl = config.baseUrl;
  }

  /**
   * Initialize SSLCommerz payment session
   * Equivalent to StripeService.processStripePayment() step 5d
   * Returns gatewayPageURL to redirect the Flutter WebView
   */
  async initPayment({
    transactionId,
    amount,
    currency = "BDT",
    customerName,
    customerEmail,
    customerPhone,
    customerAddress = "Dhaka",
    productName = "Subscription Plan",
    productCategory = "Subscription",
  }) {
    const formData = new FormData();

    // Store credentials
    formData.append("store_id", this.storeId);
    formData.append("store_passwd", this.storePassword);

    // Transaction info
    formData.append("total_amount", amount);
    formData.append("currency", currency);
    formData.append("tran_id", transactionId);

    // Callback URLs — ALWAYS use server baseUrl (never client-sent URLs)
    // SSLCommerz POSTs to these, server validates & redirects user
    formData.append("success_url", `${this.baseUrl}/api/payment/success`);
    formData.append("fail_url", `${this.baseUrl}/api/payment/fail`);
    formData.append("cancel_url", `${this.baseUrl}/api/payment/cancel`);
    formData.append("ipn_url", `${this.baseUrl}/api/payment/ipn`);

    // Customer info
      // Customer info
    formData.append("cus_name", customerName);
    formData.append("cus_email", customerEmail);
    formData.append("cus_phone", customerPhone);
    formData.append("cus_add1", customerAddress);
    formData.append("cus_city", "Dhaka");
    formData.append("cus_country", "Bangladesh");

    // Product info (required even for non-physical/subscription)
    formData.append("shipping_method", "NO");
    formData.append("num_of_item", 1);
    formData.append("product_name", productName);
    formData.append("product_category", productCategory);
    formData.append("product_profile", "non-physical-goods");

    try {
      const response = await axios.post(this.sessionApi, formData, {
        headers: formData.getHeaders(),
      });

      if (response.data.status === "SUCCESS") {
        return {
          success: true,
          sessionKey: response.data.sessionkey,
          gatewayPageURL: response.data.GatewayPageURL,
          redirectGatewayURL: response.data.redirectGatewayURL,
          data: response.data,
        };
      } else {
        return {
          success: false,
          message: response.data.failedreason || "Payment session failed",
          data: response.data,
        };
      }
    } catch (error) {
      console.error("SSLCommerz Init Error:", error.message);
      throw new Error("Failed to initialize SSLCommerz payment session");
    }
  }

  /**
   * Validate transaction with SSLCommerz
   * Called after success callback to verify payment is genuine
   * Equivalent to the Stripe validation step
   */
  async validateTransaction(valId) {
    try {
      const url = `${this.validationApi}?val_id=${valId}&store_id=${this.storeId}&store_passwd=${this.storePassword}&format=json`;
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error("SSLCommerz Validation Error:", error.message);
      throw new Error("Failed to validate transaction");
    }
  }

  /**
   * Query transaction status by transaction ID
   */
  async transactionQueryByTranId(transactionId) {
    const queryUrl = this.isLive
      ? "https://securepay.sslcommerz.com/validator/api/merchantTransIDvalidationAPI.php"
      : "https://sandbox.sslcommerz.com/validator/api/merchantTransIDvalidationAPI.php";

    try {
      const response = await axios.get(queryUrl, {
        params: {
          store_id: this.storeId,
          store_passwd: this.storePassword,
          tran_id: transactionId,
          format: "json",
        },
      });
      return response.data;
    } catch (error) {
      console.error("SSLCommerz Query Error:", error.message);
      throw new Error("Failed to query transaction");
    }
  }

  /**
   * Initiate refund for a completed transaction
   */
  async initiateRefund({
    bankTransactionId,
    refundAmount,
    refundRemarks = "Subscription refund",
  }) {
    const refundUrl = this.isLive
      ? "https://securepay.sslcommerz.com/adminapi/v1/refundpayment"
      : "https://sandbox.sslcommerz.com/adminapi/v1/refundpayment";

    try {
      const response = await axios.get(refundUrl, {
        params: {
          store_id: this.storeId,
          store_passwd: this.storePassword,
          bank_tran_id: bankTransactionId,
          refund_amount: refundAmount,
          refund_remarks: refundRemarks,
          format: "json",
        },
      });
      return response.data;
    } catch (error) {
      console.error("SSLCommerz Refund Error:", error.message);
      throw new Error("Failed to initiate refund");
    }
  }
}

module.exports = new SSLCommerzService();