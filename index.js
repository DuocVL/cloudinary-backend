// server.js
const express = require('express');
const PayOS = require('@payos/node');
const cors = require("cors");
require('dotenv').config();
const admin = require('firebase-admin');
const { createHmac } = require('crypto');

// Environment variables
const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;
const YOUR_DOMAIN = process.env.YOUR_DOMAIN || 'http://127.0.0.1:3000';
const PORT = process.env.PORT || 3000;

// PayOS instance
const payos = new PayOS(PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY);

// Express app setup
const app = express();
app.use(cors());
app.use(express.static("public"));
app.use(express.json());

// Firebase admin init
const serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// Helpers
function sortObjDataByKey(object) {
  return Object.keys(object)
    .sort()
    .reduce((obj, key) => {
      obj[key] = object[key];
      return obj;
    }, {});
}

function convertObjToQueryStr(object) {
  return Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .map((key) => {
      let value = object[key];
      if (Array.isArray(value)) {
        value = JSON.stringify(value.map((val) => sortObjDataByKey(val)));
      }
      if ([null, undefined, "undefined", "null"].includes(value)) {
        value = "";
      }
      return `${key}=${value}`;
    })
    .join("&");
}

function isValidData(data, currentSignature, checksumKey) {
  const sortedDataByKey = sortObjDataByKey(data);
  const dataQueryStr = convertObjToQueryStr(sortedDataByKey);
  const dataToSignature = createHmac("sha256", checksumKey)
    .update(dataQueryStr)
    .digest("hex");
  return dataToSignature === currentSignature;
}

let globalUserId = null;
let globalPackageId = null;

app.get("/create-payment-link", async (req, res) => {
  try {
    const { userId , packageId } = req.query;
    console.log("Received request to create payment link:", req.query);

    if (!packageId || !userId) {
      return res.status(400).send("Thiếu thông tin gói đăng ký hoặc thông tin người dùng.");
    }
    globalUserId = userId;
    globalPackageId = packageId;

    let amount;
    let description;
    let itemName;

    if (packageId == "1") {
      amount = 30000;
      description = "tháng";
      itemName = "Gói theo tháng";
    } else if (packageId == "2") {
      amount = 99000;
      description = "quý";
      itemName = "Gói theo quý";
    } else if (packageId == "3") {
      amount = 299000;
      description = "năm";
      itemName = "Gói theo năm";
    } else {
      return res.status(400).send("Gói đăng ký không hợp lệ.");
    }

    let orderCode = Number(String(Date.now()))

    const data = {
      amount: amount,
      cancelUrl: `${YOUR_DOMAIN}/payment-cancel`,
      description: `Thanh toán gói ${description}`,
      orderCode: orderCode,
      returnUrl: `${YOUR_DOMAIN}/payment-success`,
    }

    // Sắp xếp theo đúng thứ tự alphabet (đúng format yêu cầu)
    const sortedDataStr = `amount=${data.amount}&cancelUrl=${data.cancelUrl}&description=${data.description}&orderCode=${data.orderCode}&returnUrl=${data.returnUrl}`;

    // Tạo signature từ chuỗi trên và checksumKey của bạn
    const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
    const signature = createHmac("sha256", checksumKey)
      .update(sortedDataStr)
      .digest("hex");

    // Tạo mã đơn hàng duy nhất sử dụng timestamp
    const order = {
      orderCode: orderCode,
      amount: 2000,
      //amount: amount,
      description: `Thanh toán gói ${description}`,
      items: [
        {
          name: itemName,
          quantity: 1,
          price: amount,
        },
      ],
      returnUrl: `${YOUR_DOMAIN}/payment-success`,
      cancelUrl: `${YOUR_DOMAIN}/payment-cancel`,
      expiredAt : Math.floor(Date.now() /1000) + 5 * 60, // 5 phút
      signature : signature
    };
    console.log("Tạo liên kết thanh toán với đơn hàng:", order);

    const paymentLink = await payos.createPaymentLink(order);
    res.redirect(paymentLink.checkoutUrl);
  } catch (error) {
    console.error("Lỗi khi tạo liên kết thanh toán:", error);
    res.send("Đã xảy ra lỗi khi tạo liên kết thanh toán.");
  }
});

// Route: webhook callback
app.post("/payment-callback", async (req, res) => {
  const { code, desc, success, data, signature } = req.body;

  // Kiểm tra dữ liệu webhook
  if (!data || !signature) {
    console.warn("❌ Missing data or signature in webhook payload");
    return res.status(400).send("Missing data or signature");
  }

  try {
    // ✅ Verify HMAC signature
    const isValid = isValidData(data, signature, PAYOS_CHECKSUM_KEY);
    if (!isValid) {
      console.warn("❌ Invalid signature");
      return res.status(400).send("Invalid signature");
    }

    // ✅ Kiểm tra các trường xác nhận giao dịch thành công
    if (code !== "00" || desc !== "success" || success !== true) {
      console.warn("❌ Webhook status indicates failure:", { code, desc, success });
      return res.status(400).send("Invalid payment status");
    }

    const now = Date.now();
    let month = 1;
    if (globalPackageId == "1") {
      month = 1;
    } else if (globalPackageId == "2") {
      month = 3;
    } else if (globalPackageId == "3") {
      month = 12;
    } else {
      month = 1;
    }
    const durationMonths = month;
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
    const addedDuration = durationMonths * oneMonthMs;

    const userRef = db.collection("users").doc(globalUserId);
    const paymentsRef = userRef.collection("payments");

    // Ghi giao dịch tổng quan
    await db.collection("transactions").doc(String(data.orderCode)).set({
      userId: globalUserId,
      packageId: globalPackageId,
      webhookCode: code,
      webhookDesc: desc,
      webhookSuccess: success,
      orderCode: data.orderCode,
      amount: data.amount,
      description: data.description,
      accountNumber: data.accountNumber,
      reference: data.reference,
      transactionDateTime: data.transactionDateTime,
      currency: data.currency || "VND",
      paymentLinkId: data.paymentLinkId,
      payosCode: data.code,
      payosDesc: data.desc,
      counterAccountBankId: data.counterAccountBankId,
      counterAccountBankName: data.counterAccountBankName,
      counterAccountName: data.counterAccountName,
      counterAccountNumber: data.counterAccountNumber,
      virtualAccountName: data.virtualAccountName,
      virtualAccountNumber: data.virtualAccountNumber,
      signature: signature,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Ghi giao dịch cá nhân
    await paymentsRef.doc(String(data.orderCode)).set({
      packageId: globalPackageId,
      orderCode: data.orderCode,
      amount: data.amount,
      description: data.description,
      counterAccountBankId: data.counterAccountBankId,
      transactionDateTime: data.transactionDateTime,
      counterAccountName: data.counterAccountName,
      counterAccountNumber: data.counterAccountNumber,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Xử lý trạng thái gói
    const statusRef = paymentsRef.doc("status");
    const statusSnap = await statusRef.get();

    if (!statusSnap.exists) {
      // ❇️ Chưa có gói → tạo mới
      await statusRef.set({
        packageId: globalPackageId,
        orderCode: data.orderCode,
        amount: data.amount,
        description: data.description,
        startTime: now,
        endTime: now + addedDuration,
        transactionDateTime: data.transactionDateTime,
        counterAccountName: data.counterAccountName,
        counterAccountNumber: data.counterAccountNumber,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      const current = statusSnap.data();
      const currentEnd = current.endTime || 0;

      if (currentEnd > now) {
        // ⏳ Gói còn hiệu lực → gia hạn thêm
        await statusRef.update({
          endTime: currentEnd + addedDuration,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // ⌛ Gói đã hết hạn → reset
        await statusRef.set({
          packageId: globalPackageId,
          orderCode: data.orderCode,
          amount: data.amount,
          description: data.description,
          startTime: now,
          endTime: now + addedDuration,
          transactionDateTime: data.transactionDateTime,
          counterAccountName: data.counterAccountName,
          counterAccountNumber: data.counterAccountNumber,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
    
    res.status(200).send("✅ Webhook verified & transaction stored");
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});


// Route: payment result pages
app.get("/payment-success", (req, res) => {
  console.log("Payment success:", req.query);
  res.json(req.query);
});

app.get("/payment-cancel", (req, res) => {
  console.log("Payment canceled:", req.query);
  res.json(req.query);
});

// Debug route for webhook testing
app.post("/receive-hook", async (req, res) => {
  console.log("[DEBUG] receive-hook payload:", req.body);
  res.json({ received: true });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});

