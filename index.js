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

// Route: create payment link
app.get("/create-payment-link", async (req, res) => {
  try {
    const { package} = req.query;
    console.log("Received package:", package);
    if (!package) {
      return res.status(400).send("Package is required");
    }
    // Create a unique order code using ulid
    const order = {
      orderCode: Number(String(Date.now())),
      amount: 2000,
      description: "Thanh toan don hang",
      items: [
        {
          name: "Mì tôm Hảo Hảo ly",
          quantity: 1,
          price: 2000,
        },
      ],
      returnUrl: `${YOUR_DOMAIN}/payment-success`,
      cancelUrl: `${YOUR_DOMAIN}/payment-cancel`,
    };
    console.log("Creating payment link with order:", order);

    const paymentLink = await payos.createPaymentLink(order);
    //res.status(200).json({ url: paymentLink.checkoutUrl });
    res.redirect(paymentLink.checkoutUrl);
  } catch (error) {
    console.error("Error creating payment link:", error);
    //res.status(500).json({ error: "Error creating payment link." });
    res.send("Something went error");
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

