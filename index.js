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
    //notifyUrl: `${YOUR_DOMAIN}/payment-callback`, // 👈 webhook URL gửi về đây
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
app.post("/payment-callback", async (req, res) => {
  console.log('Webhook received:', req.body);

  const { data, signature } = req.body;

  try {
    // ✅ Xác thực chữ ký an toàn
    const isValid = payos.verifyPaymentWebhook(req.body, signature);
    if (!isValid) {
      console.warn('Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    // ✅ Xử lý data đơn hàng ở đây (ví dụ: cập nhật trạng thái đơn hàng)
    console.log('Payment Data:', data);

    // Phản hồi về cho PayOS biết đã nhận được (bắt buộc gửi 200 OK)
    res.status(200).send('Webhook received successfully');
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).send('Error handling webhook');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
