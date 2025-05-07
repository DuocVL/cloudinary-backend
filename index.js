// server.js
const express = require('express');
const PayOS = require('@payos/node');
const cors = require("cors");
require('dotenv').config();
const admin = require('firebase-admin');
const { createHmac } = require('crypto');
const { ulid } = require('ulid');

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

app.get("/create-payment-link", async (req, res) => {
  try {
    const { packageId } = req.query;
    console.log("Received package ID:", packageId);

    if (!packageId) {
      return res.status(400).send("Thiếu thông tin gói đăng ký.");
    }

    let amount;
    let description;
    let itemName;

    if (packageId == "1") {
      amount = 30000;
      description = "Tháng";
      itemName = "Gói theo tháng";
    } else if (packageId == "2") {
      amount = 99000;
      description = "Quý";
      itemName = "Gói theo quý";
    } else if (packageId == "3") {
      amount = 299000;
      description = "Năm";
      itemName = "Gói theo năm";
    } else {
      return res.status(400).send("Gói đăng ký không hợp lệ.");
    }

    // Tạo mã đơn hàng duy nhất sử dụng timestamp
    const order = {
      orderCode: Number(String(Date.now())),
      amount: amount,
      description: `Thanh toán gói ${description}`, // Giới hạn 25 ký tự
      items: [
        {
          name: itemName,
          quantity: 1,
          price: amount,
        },
      ],
      returnUrl: `${YOUR_DOMAIN}/payment-success`,
      cancelUrl: `${YOUR_DOMAIN}/payment-cancel`,
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
  const { data, signature } = req.body;

  try {
    const isValid = isValidData(data, signature, PAYOS_CHECKSUM_KEY);
    if (!isValid) {
      console.warn("Invalid signature");
      return res.status(400).send("Invalid signature");
    }

    await db.collection("transactions").doc(String(data.orderCode)).set({
      amount: data.amount,
      description: data.description,
      reference: data.reference,
      paymentLinkId: data.paymentLinkId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send("Webhook received successfully");
  } catch (error) {
    console.error("Error handling webhook:", error);
    res.status(500).send("Error handling webhook");
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

