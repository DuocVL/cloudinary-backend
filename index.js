// server.js
const express = require('express');
const PayOS = require('@payos/node');
const cors = require("cors");
require('dotenv').config();
const admin = require('firebase-admin');
// No longer need crypto for manual signature if using SDK verification
// const { createHmac } = require('crypto'); // Removed

// Environment variables
const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;
const YOUR_DOMAIN = process.env.YOUR_DOMAIN || 'http://127.0.0.1:3000';
const PORT = process.env.PORT || 3000;

// Check for essential environment variables
if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY || !process.env.GOOGLE_CREDENTIALS) {
    console.error("❌ Thiếu các biến môi trường cần thiết (PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY, GOOGLE_CREDENTIALS).");
    process.exit(1); // Thoát nếu thiếu cấu hình
}

// PayOS instance - The SDK will use the provided keys internally for signing and verification
const payos = new PayOS(PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY);

// Express app setup
const app = express();
app.use(cors());
app.use(express.static("public"));
// Use raw body for webhook to allow signature verification
app.use(express.json({ limit: '10mb' })); // For regular JSON requests
app.use(express.urlencoded({ limit: '10mb', extended: true })); // For form data

// Firebase admin init
let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (e) {
    console.error("❌ GOOGLE_CREDENTIALS không phải là JSON hợp lệ:", e);
    process.exit(1);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}
const db = admin.firestore();

// --- REMOVED: Manual signature helpers are no longer needed ---
// function sortObjDataByKey(...)
// function convertObjToQueryStr(...)
// function isValidData(...)
// --------------------------------------------------------------

// --- REMOVED: Global variables for state are no longer needed ---
// let globalUserId = null;
// let globalPackageId = null;
// --------------------------------------------------------------


// --- Helper: Get Package Details ---
// Moved package details into a function for better organization
function getPackageDetails(packageId) {
    switch (packageId) {
        case "1":
            return { amount: 30000, description: "tháng", itemName: "Gói theo tháng", durationMonths: 1 };
        case "2":
            return { amount: 99000, description: "quý", itemName: "Gói theo quý", durationMonths: 3 };
        case "3":
            return { amount: 299000, description: "năm", itemName: "Gói theo năm", durationMonths: 12 };
        default:
            return null; // Invalid package
    }
}


// Route: Create Payment Link
app.get("/create-payment-link", async (req, res) => {
    try {
        const { userId, packageId } = req.query;
        console.log("Received request to create payment link:", { userId, packageId });

        if (!packageId || !userId) {
            return res.status(400).send("Thiếu thông tin gói đăng ký hoặc thông tin người dùng.");
        }

        const packageDetails = getPackageDetails(packageId);
        if (!packageDetails) {
            return res.status(400).send("Gói đăng ký không hợp lệ.");
        }

        // Generate a unique order code (using timestamp is generally okay for this)
        // Using Number(String(Date.now())) can be problematic if multiple requests happen in the *exact* same millisecond.
        // A safer approach for uniqueness might be Date.now() + random digits, or a dedicated ID generator.
        // For simplicity, let's keep Date.now() for now, but be aware of potential collisions under high load.
        const orderCode = Number(String(Date.now()).slice(-6) + Math.floor(Math.random() * 1000).toString().padStart(3, '0')); // Add random part
        // Ensure it's a number within reasonable limits if PayOS has restrictions
        if (orderCode > 1000000000) { // Example limit, check PayOS docs
             orderCode = Number(String(Date.now()).slice(-9)); // Try a different approach if needed
        }


        const order = {
            orderCode: orderCode,
            amount: packageDetails.amount, // Use actual package amount
            description: `Thanh toán gói ${packageDetails.description}`,
            items: [
                {
                    name: packageDetails.itemName,
                    quantity: 1,
                    price: packageDetails.amount,
                },
            ],
            returnUrl: `${YOUR_DOMAIN}/payment-success`,
            cancelUrl: `${YOUR_DOMAIN}/payment-cancel`,
            expiredAt: Math.floor(Date.now() / 1000) + 15 * 60, // Increased to 15 minutes expiry
            // --- REMOVED: Manual signature field - SDK handles this ---
            // signature: signature
            // ----------------------------------------------------
        };
        console.log("Creating payment link for order:", order);

        // --- NEW: Store order details with userId and packageId before creating link ---
        // This links the orderCode to the user and package reliably
        await db.collection('orders').doc(String(orderCode)).set({
            orderCode: orderCode,
            userId: userId,
            packageId: packageId,
            status: 'pending', // Initial status
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            amount: packageDetails.amount,
            description: order.description,
            returnUrl: order.returnUrl,
            cancelUrl: order.cancelUrl,
            expiredAt: order.expiredAt,
            // Optionally store PayOS response details later
        });
        console.log(`Stored order ${orderCode} for userId ${userId}, packageId ${packageId} with status 'pending'`);
        // ----------------------------------------------------------------------------

        const paymentLink = await payos.createPaymentLink(order);

        console.log("Payment link created:", paymentLink);
        res.redirect(paymentLink.checkoutUrl);

    } catch (error) {
        console.error("❌ Lỗi khi tạo liên kết thanh toán:", error);
        res.status(500).send("Đã xảy ra lỗi khi tạo liên kết thanh toán.");
    }
});


// Route: webhook callback
app.post("/payment-callback", async (req, res) => {
    console.log("--- Webhook Received ---");
    console.log("Raw body length:", req.body ? JSON.stringify(req.body).length : 0);

    // --- NEW: Use SDK's webhook verification ---
    let webhookData;
    try {
        // The PayOS SDK expects the raw body data for verification.
        // Ensure your express middleware (`express.json()`) is configured correctly
        // or use a separate middleware for raw body if needed.
        // For simplicity, assuming `req.body` is the parsed JSON payload here as per original code structure.
        // If verification fails, the SDK throws an error.
         webhookData = payos.verifyPaymentWebhook(req.body); // SDK verifies signature and structure

         console.log("✅ Webhook verified successfully via SDK:", webhookData);

    } catch (error) {
        console.error("❌ Lỗi xác thực webhook:", error);
        // If verification fails, return 400 Bad Request as per PayOS documentation
        return res.status(400).send("Webhook signature verification failed.");
    }

    const { code, desc, success, data } = webhookData; // Use verified data


    if (!data || typeof data.orderCode === 'undefined') {
        console.warn("❌ Dữ liệu webhook thiếu trường 'data' hoặc 'orderCode'");
        return res.status(400).send("Invalid webhook data structure.");
    }

    const orderCode = data.orderCode;
    console.log(`--- Processing Order Code: ${orderCode} ---`);

    try {
        // --- NEW: Idempotency check and retrieving user/package info ---
        const orderRef = db.collection('orders').doc(String(orderCode));
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
            console.warn(`⚠️ Order code ${orderCode} không tồn tại trong database.`);
            // This might happen if create-payment-link failed partially, or a malicious request.
            // Acknowledge with 200 to prevent retries, but investigate why it's missing.
            return res.status(200).send("Order not found in database (ignored).");
        }

        const orderData = orderSnap.data();

        if (orderData.status === 'processed') {
            console.log(`✅ Order code ${orderCode} đã được xử lý trước đó (idempotent). Bỏ qua.`);
            // Already processed, just acknowledge the webhook again
            return res.status(200).send("Order already processed.");
        }

        if (code !== "00" || desc !== "success" || success !== true) {
             console.warn(`⚠️ Webhook status cho đơn hàng ${orderCode} chỉ ra thất bại:`, { code, desc, success });
             // Log the failure and potentially update the order status to 'failed'
             await orderRef.update({
                 status: 'failed',
                 payosCode: code,
                 payosDesc: desc,
                 payosData: data, // Store PayOS data for debugging failure
                 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
             });
             return res.status(200).send("Payment status indicates failure (logged)."); // Acknowledge failure webhook
         }

        // Payment is successful (code 00) and order is not yet processed
        const userId = orderData.userId; // Get userId from stored order data
        const packageId = orderData.packageId; // Get packageId from stored order data

        if (!userId || !packageId) {
             console.error(`❌ Dữ liệu đơn hàng ${orderCode} trong database thiếu userId hoặc packageId.`);
             await orderRef.update({
                 status: 'error', // Indicate an internal error
                 errorMessage: 'Missing userId or packageId in stored order data',
                 payosData: data,
                 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
             });
             return res.status(500).send("Internal processing error: Missing user/package info.");
        }

        console.log(`✅ Order ${orderCode} verified and retrieved. User: ${userId}, Package: ${packageId}`);

        const now = Date.now();
        const packageDetails = getPackageDetails(packageId);
        if (!packageDetails) {
             console.error(`❌ Package ID ${packageId} từ đơn hàng ${orderCode} không hợp lệ.`);
             await orderRef.update({
                 status: 'error', // Indicate an internal error
                 errorMessage: `Invalid packageId in stored order data: ${packageId}`,
                 payosData: data,
                 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
             });
             return res.status(500).send("Internal processing error: Invalid package ID.");
        }
        const durationMonths = packageDetails.durationMonths;
        const oneMonthMs = 30 * 24 * 60 * 60 * 1000; // Approximation
        const addedDuration = durationMonths * oneMonthMs;

        const userRef = db.collection("users").doc(userId);
        const paymentsRef = userRef.collection("payments");

        // --- NEW: Use Firestore Transaction for atomic status update ---
        await db.runTransaction(async (transaction) => {
            const statusRef = paymentsRef.doc("status");
            const statusSnap = await transaction.get(statusRef);

            const transactionLogData = {
                 packageId: packageId,
                 orderCode: orderCode,
                 amount: data.amount, // Use amount from PayOS webhook data
                 description: data.description || orderData.description, // Use webhook desc or stored desc
                 counterAccountBankId: data.counterAccountBankId,
                 transactionDateTime: data.transactionDateTime,
                 counterAccountName: data.counterAccountName,
                 counterAccountNumber: data.counterAccountNumber,
                 createdAt: admin.firestore.FieldValue.serverTimestamp(), // Timestamp when transaction log is created
                 webhookReceivedAt: admin.firestore.Timestamp.now(), // Timestamp when webhook was received
             };

            // Always log the individual payment transaction
            transaction.set(paymentsRef.doc(String(orderCode)), transactionLogData);
            console.log(`-> Logged individual payment for order ${orderCode} for user ${userId}`);


            let newStatusData = {};
            const current = statusSnap.exists ? statusSnap.data() : null;
            const currentEnd = current ? (current.endTime || 0) : 0;

            if (!statusSnap.exists || currentEnd <= now) {
                // ❇️ Chưa có gói hoặc gói đã hết hạn → tạo mới/reset
                console.log(`-> User ${userId}: No active package or package expired. Setting new package.`);
                newStatusData = {
                    packageId: packageId,
                    orderCode: orderCode, // Order that activated/reset the package
                    amount: data.amount,
                    description: data.description || packageDetails.description,
                    startTime: now,
                    endTime: now + addedDuration,
                    transactionDateTime: data.transactionDateTime,
                    counterAccountName: data.counterAccountName,
                    counterAccountNumber: data.counterAccountNumber,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(), // Timestamp when status was updated
                };
                transaction.set(statusRef, newStatusData);
            } else {
                // ⏳ Gói còn hiệu lực → gia hạn thêm
                 console.log(`-> User ${userId}: Active package found. Extending end time from ${new Date(currentEnd).toISOString()}.`);
                newStatusData = {
                    // Keep original packageId, startTime if extending? Or update to new package details?
                    // Decide if extending just adds time, or updates to the new package type if different.
                    // Current logic just adds time, let's keep that, but update updated fields.
                    orderCode: orderCode, // Record which order extended it
                    amount: data.amount, // Update with new payment amount
                    description: data.description || current.description, // Update desc if webhook has it
                    endTime: currentEnd + addedDuration,
                    transactionDateTime: data.transactionDateTime, // Update with latest transaction time
                    counterAccountName: data.counterAccountName || current.counterAccountName,
                    counterAccountNumber: data.counterAccountNumber || current.counterAccountNumber,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                };
                // Update specific fields, keeping existing ones if not provided/changed
                transaction.update(statusRef, newStatusData);
            }
            console.log(`-> User ${userId}: Status update prepared in transaction.`);

        }); // Transaction ends here

        // --- Update main order status AFTER successful user status update ---
        // If the transaction above succeeded, the order is processed.
        await orderRef.update({
            status: 'processed', // Mark as processed
            payosCode: code, // Store final PayOS status codes
            payosDesc: desc,
            payosData: data, // Store the full verified webhook data
            processedAt: admin.firestore.FieldValue.serverTimestamp(), // When processing was completed
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
         console.log(`✅ Order ${orderCode} status updated to 'processed'.`);


        // Ghi giao dịch tổng quan (Optional - you might just rely on the 'orders' collection
        // and user's subcollection logs, or refine this global collection)
        // await db.collection("transactions").doc(String(data.orderCode)).set({ ... }); // Re-evaluate if this is needed

        res.status(200).send("✅ Webhook verified & transaction stored");

    } catch (error) {
        console.error(`❌ Lỗi khi xử lý webhook cho đơn hàng ${orderCode}:`, error);
        // Attempt to mark order as failed if processing fails (optional, depends on error type)
        // This could itself fail, so handle carefully.
        // A simple catch-all might just log and send 500.
        try {
             await db.collection('orders').doc(String(orderCode)).update({
                 status: 'processing_error',
                 errorMessage: error.message,
                 updatedAt: admin.firestore.FieldValue.serverTimestamp(),
             }).catch(e => console.error("Error updating order status to processing_error:", e));
        } catch (e) {
            console.error("Severe error updating order status after processing failure:", e);
        }

        res.status(500).send("Internal Server Error");
    } finally {
        console.log(`--- End Processing Order Code: ${orderCode} ---`);
    }
});


// Route: payment result pages - These are for user display, NOT critical backend logic
app.get("/payment-success", (req, res) => {
    console.log("✅ Payment success page hit:", req.query);
    // You would typically render an HTML page here showing a success message.
    // You could fetch the order status from Firestore using req.query.orderCode
    // to show the user if the payment was confirmed by the webhook.
    res.send(`
        <html>
        <head><title>Payment Success</title></head>
        <body>
            <h1>Thanh toán thành công!</h1>
            <p>Mã đơn hàng: ${req.query.orderCode}</p>
            <p>Trạng thái: Đang cập nhật (Vui lòng kiểm tra lại tài khoản của bạn sau ít phút).</p>
            <pre>${JSON.stringify(req.query, null, 2)}</pre>
             <p><a href="/">Quay về trang chủ</a></p>
        </body>
        </html>
    `);
});

app.get("/payment-cancel", (req, res) => {
    console.log("⚠️ Payment canceled page hit:", req.query);
     // You would typically render an HTML page here showing a cancel message.
    res.send(`
        <html>
        <head><title>Payment Canceled</title></head>
        <body>
            <h1>Thanh toán đã bị hủy bỏ hoặc thất bại.</h1>
            <p>Mã đơn hàng: ${req.query.orderCode}</p>
             <pre>${JSON.stringify(req.query, null, 2)}</pre>
             <p><a href="/">Quay về trang chủ</a></p>
        </body>
        </html>
    `);
});


// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
    console.log(` PayOS Client ID: ${PAYOS_CLIENT_ID ? 'Loaded' : 'Missing!'}`);
    console.log(` PayOS Checksum Key: ${PAYOS_CHECKSUM_KEY ? 'Loaded' : 'Missing!'}`);
    console.log(` Firebase Credentials: ${serviceAccount ? 'Loaded' : 'Missing!'}`);
    console.log(` Your Domain: ${YOUR_DOMAIN}`);
});