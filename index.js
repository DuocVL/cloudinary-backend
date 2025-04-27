const express = require('express');
const PayOS = require('@payos/node');
const bodyParser = require('body-parser');

const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

const payos = new PayOS(
  PAYOS_CLIENT_ID,
  PAYOS_API_KEY,
  PAYOS_CHECKSUM_KEY,
);

const app = express();
app.use(express.static('public'));
app.use(express.json()); // ⚡ Quan trọng để đọc body webhook

const YOUR_DOMAIN = process.env.RAILWAY_STATIC_URL;

// Route tạo link thanh toán
app.get('/create-payment-link', async (req, res) => {
  const { amount, description, orderCode } = req.query;
  if (!amount || !description || !orderCode) {
    return res.status(400).send("Vui lòng cung cấp amount, description và orderCode.");
  }

  const order = {
    amount: Number(amount),
    description,
    orderCode: Number(orderCode),
    returnUrl: `${YOUR_DOMAIN}/success.html`,
    cancelUrl: `${YOUR_DOMAIN}/cancel.html`,
    notifyUrl: `${YOUR_DOMAIN}/payment-callback`, // 👈 webhook URL gửi về đây
  };

  try {
    const paymentLink = await payos.createPaymentLink(order);
    res.redirect(303, paymentLink.checkoutUrl);
  } catch (error) {
    console.error("Error creating payment link:", error);
    res.status(500).send("Error creating payment link.");
  }
});




// Route webhook nhận callback từ PayOS
const crypto = require('crypto');


function sortObjDataByKey(object) {
      const orderedObject = Object.keys(object)
        .sort()
        .reduce((obj, key) => {
          obj[key] = object[key];
          return obj;
        }, {});
      return orderedObject;
    }

function convertObjToQueryStr(object) {
      return Object.keys(object)
        .filter((key) => object[key] !== undefined)
        .map((key) => {
          let value = object[key];
          // Sort nested object
          if (value && Array.isArray(value)) {
            value = JSON.stringify(value.map((val) => sortObjDataByKey(val)));
          }
          // Set empty string if null
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
    const isValid = isValidData(data,signature,PAYOS_CHECKSUM_KEY);
    if (!isValid) {
      console.warn('Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    // Xử lý data đơn hàng
    console.log('Payment Data:', data);

    res.status(200).send('Webhook received successfully');
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).send('Error handling webhook');
  }
});


// function verifySignature(data, signature, checksumKey) {
//   const jsonString = JSON.stringify(data);
//   const hash = crypto.createHmac('sha256', checksumKey)
//                      .update(jsonString)
//                      .digest('hex');
//   return hash === signature;
// }

// app.post('/payment-callback', async (req, res) => {
//   console.log('Webhook received:', req.body);

//   const { data, signature } = req.body;

//   try {
//     const isValid = verifySignature(data, signature, PAYOS_CHECKSUM_KEY);
//     if (!isValid) {
//       console.warn('Invalid signature');
//       return res.status(400).send('Invalid signature');
//     }

//     // Xử lý data đơn hàng
//     console.log('Payment Data:', data);

//     res.status(200).send('Webhook received successfully');
//   } catch (error) {
//     console.error('Error handling webhook:', error);
//     res.status(500).send('Error handling webhook');
//   }
// });


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
