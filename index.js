
const express = require('express');
const PayOS = require('@payos/node');
const cors = require("cors");
const admin = require('firebase-admin');
const { createHmac } = require('crypto');
const { console } = require('inspector');

const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;
const YOUR_DOMAIN = process.env.RAILWAY_STATIC_URL;

const payos = new PayOS(
  PAYOS_CLIENT_ID,
  PAYOS_API_KEY,
  PAYOS_CHECKSUM_KEY,
);

// Serve static if needed
const app = express();
app.use(cors());
app.use("/", express.static("public"));
app.use(express.json());


// Firebase
const serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// 👉 Route tạo link thanh toán
// Server: /create-payment-link route
app.post('/create-payment-link', async (req, res) => {
  const { amount, description, orderCode } = req.query;
  // if (!amount || !description || !orderCode) {
  //   return res.status(400).send("Vui lòng cung cấp amount, description và orderCode.");
  // }

  const order = {
    orderCode: Number(String(Date.now()).slice(-6)),
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
    // notifyUrl: `${YOUR_DOMAIN}/payment-callback`, // Keep webhook for server confirmation
  };

  try {
    const paymentLink = await payos.createPaymentLink(order);
    // Store order details or associate with user if needed before redirecting
    // e.g., await db.collection('pending_orders').doc(String(orderCode)).set({ ... });
    res.redirect(303, paymentLink.checkoutUrl);
  } catch (error) {
    console.error("Error creating payment link:", error);
    // Redirect to a generic error page or pass error info back?
    res.status(500).send("Error creating payment link.");
    // Maybe redirect to cancelUrl with an error flag?
    // res.redirect(303, `<span class="math-inline">\{YOUR\_DOMAIN\}/payment\-cancel?status\=false&orderCode\=</span>{orderCode}&error=creation_failed`);
  }
});

// 👉 Route payment callback (webhook)
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
      if (value && Array.isArray(value)) {
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
  return dataToSignature == currentSignature;
}

app.post('/payment-callback', async (req, res) => {
  console.log('Webhook received:', req.body);

  const { data, signature } = req.body;

  try {
    const isValid = isValidData(data, signature, PAYOS_CHECKSUM_KEY);
    if (!isValid) {
      console.warn('Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    console.log('Payment Data:', data);
    res.status(200).send('Webhook received successfully');

    const transactionRef = db.collection('transactions').doc(String(data.orderCode));
    await transactionRef.set({
      amount: data.amount,
      description: data.description,
      reference: data.reference,
      paymentLinkId: data.paymentLinkId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).send('Error handling webhook');
  }
});

// 👉 Route trả về trạng thái thanh toán cho Android app
// 👉 Route trả về trạng thái thanh toán cho Android app
app.get('/payment-success', (req, res) => {
  console.log('Payment success:', req.query);
  res.json({
    status: "success",
    message: "Payment successful"
  });
});

app.get('/payment-cancel', (req, res) => {
  console.log('Payment canceled:', req.query);
  res.json({
    status: "cancel",
    message: "Payment canceled"
  });
});


// Start server
const PORT = process.env.PORT || 3000;

// Start server
app.post("/receive-hook",async (req,res) => {
  console.log(req.body);
  res.json();
});
app.listen(3000,'0.0.0.0', () => console.log('Server is running on port 3000'));

app.listen(PORT, function (){ console.log(`Server is running on port ${PORT}`)
});
