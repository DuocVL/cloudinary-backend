// // server.js
// const express = require('express');
// const PayOS = require('@payos/node');
// const cors = require("cors");
// require('dotenv').config();
// const admin = require('firebase-admin');
// const { createHmac } = require('crypto');

// // Environment variables
// const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
// const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
// const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;
// const YOUR_DOMAIN = process.env.RAILWAY_STATIC_URL || 'http://127.0.0.1:3000';
// const PORT = process.env.PORT || 3000;

// // PayOS instance
// const payos = new PayOS(PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY);

// // Express app setup
// const app = express();
// app.use(cors());
// app.use(express.static("public"));
// app.use(express.json());

// // Firebase admin init
// const serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
// if (!admin.apps.length) {
//   admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
//   });
// }
// const db = admin.firestore();

// // Helpers
// function sortObjDataByKey(object) {
//   return Object.keys(object)
//     .sort()
//     .reduce((obj, key) => {
//       obj[key] = object[key];
//       return obj;
//     }, {});
// }

// function convertObjToQueryStr(object) {
//   return Object.keys(object)
//     .filter((key) => object[key] !== undefined)
//     .map((key) => {
//       let value = object[key];
//       if (Array.isArray(value)) {
//         value = JSON.stringify(value.map((val) => sortObjDataByKey(val)));
//       }
//       if ([null, undefined, "undefined", "null"].includes(value)) {
//         value = "";
//       }
//       return `${key}=${value}`;
//     })
//     .join("&");
// }

// function isValidData(data, currentSignature, checksumKey) {
//   const sortedDataByKey = sortObjDataByKey(data);
//   const dataQueryStr = convertObjToQueryStr(sortedDataByKey);
//   const dataToSignature = createHmac("sha256", checksumKey)
//     .update(dataQueryStr)
//     .digest("hex");
//   return dataToSignature === currentSignature;
// }

// // Route: create payment link
// app.post("/create-payment-link", async (req, res) => {
//   try {
//     const order = {
//       orderCode: Number(String(Date.now()).slice(-6)),
//       amount: 2000,
//       description: "Thanh toan don hang",
//       items: [
//         {
//           name: "Mì tôm Hảo Hảo ly",
//           quantity: 1,
//           price: 2000,
//         },
//       ],
//       returnUrl: `${YOUR_DOMAIN}/payment-success`,
//       cancelUrl: `${YOUR_DOMAIN}/payment-cancel`,
//     };
//     console.log("Creating payment link with order:", order);

//     const paymentLink = await payos.createPaymentLink(order);
//     res.status(200).json({ url: paymentLink.checkoutUrl });
//   } catch (error) {
//     console.error("Error creating payment link:", error);
//     res.status(500).json({ error: "Error creating payment link." });
//   }
// });

// // Route: webhook callback
// app.post("/payment-callback", async (req, res) => {
//   const { data, signature } = req.body;

//   try {
//     const isValid = isValidData(data, signature, PAYOS_CHECKSUM_KEY);
//     if (!isValid) {
//       console.warn("Invalid signature");
//       return res.status(400).send("Invalid signature");
//     }

//     await db.collection("transactions").doc(String(data.orderCode)).set({
//       amount: data.amount,
//       description: data.description,
//       reference: data.reference,
//       paymentLinkId: data.paymentLinkId,
//       createdAt: admin.firestore.FieldValue.serverTimestamp(),
//     });

//     res.status(200).send("Webhook received successfully");
//   } catch (error) {
//     console.error("Error handling webhook:", error);
//     res.status(500).send("Error handling webhook");
//   }
// });

// // Route: payment result pages
// app.get("/payment-success", (req, res) => {
//   console.log("Payment success:", req.query);
//   res.json({ status: "success", message: "Payment successful" });
// });

// app.get("/payment-cancel", (req, res) => {
//   console.log("Payment canceled:", req.query);
//   res.json({ status: "cancel", message: "Payment canceled" });
// });

// // Debug route for webhook testing
// app.post("/receive-hook", async (req, res) => {
//   console.log("[DEBUG] receive-hook payload:", req.body);
//   res.json({ received: true });
// });

// // Start server
// app.listen(PORT, '0.0.0.0', () => {
//   console.log(`✅ Server is running at http://localhost:${PORT}`);
// });
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios'); // Thêm thư viện axios để thực hiện HTTP requests

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

let items = [
  { id: 1, name: 'Item 1' },
  { id: 2, name: 'Item 2' },
];
let nextId = 3;

app.get('/items', (req, res) => {
  res.json(items);
});

app.get('/items/:id', (req, res) => {
  const itemId = parseInt(req.params.id);
  const item = items.find(item => item.id === itemId);

  if (item) {
    res.json(item);
  } else {
    res.status(404).json({ message: 'Item not found' });
  }
});

app.post('/items', (req, res) => {
  const newItem = {
    id: nextId++,
    name: req.body.name,
  };
  items.push(newItem);
  res.status(201).json(newItem);
});

app.put('/items/:id', (req, res) => {
  const itemId = parseInt(req.params.id);
  const itemIndex = items.findIndex(item => item.id === itemId);

  if (itemIndex !== -1) {
    items[itemIndex].name = req.body.name;
    res.json(items[itemIndex]);
  } else {
    res.status(404).json({ message: 'Item not found' });
  }
});

app.delete('/items/:id', (req, res) => {
  const itemId = parseInt(req.params.id);
  const initialLength = items.length;
  items = items.filter(item => item.id !== itemId);

  if (items.length < initialLength) {
    res.status(204).send();
  } else {
    res.status(404).json({ message: 'Item not found' });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);

  // **Thêm đoạn code test cục bộ ở đây**
  const baseURL = `http://localhost:${port}`;

  async function runTests() {
    console.log('\n--- Running Local Tests ---');

    // Test GET all items
    try {
      const getResponse = await axios.get(`${baseURL}/items`);
      console.log('GET /items:', getResponse.status, getResponse.data);
    } catch (error) {
      console.error('GET /items Error:', error.message);
    }

    // Test POST new item
    try {
      const postResponse = await axios.post(`${baseURL}/items`, { name: 'Test Item' });
      console.log('POST /items:', postResponse.status, postResponse.data);
      const newItemId = postResponse.data.id;

      // Test GET single item
      try {
        const getSingleResponse = await axios.get(`${baseURL}/items/${newItemId}`);
        console.log(`GET /items/${newItemId}:`, getSingleResponse.status, getSingleResponse.data);
      } catch (error) {
        console.error(`GET /items/${newItemId} Error:`, error.message);
      }

      // Test PUT update item
      try {
        const putResponse = await axios.put(`${baseURL}/items/${newItemId}`, { name: 'Updated Test Item' });
        console.log(`PUT /items/${newItemId}:`, putResponse.status, putResponse.data);
      } catch (error) {
        console.error(`PUT /items/${newItemId} Error:`, error.message);
      }

      // Test DELETE item
      try {
        const deleteResponse = await axios.delete(`${baseURL}/items/${newItemId}`);
        console.log(`DELETE /items/${newItemId}:`, deleteResponse.status, deleteResponse.statusText);
      } catch (error) {
        console.error(`DELETE /items/${newItemId} Error:`, error.message);
      }
    } catch (error) {
      console.error('POST /items Error:', error.message);
    }

    console.log('--- Tests Finished ---');
  }

  runTests();
});