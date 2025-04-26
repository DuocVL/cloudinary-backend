const express = require('express');
const PayOS = require('@payos/node');

// Lấy các biến môi trường từ Railway
const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

// Khởi tạo đối tượng PayOS với các biến môi trường
const payos = new PayOS(
  PAYOS_CLIENT_ID,
  PAYOS_API_KEY,
  PAYOS_CHECKSUM_KEY,
);

const app = express();
app.use(express.static('public'));
app.use(express.json());

// Railway sẽ cung cấp URL động cho ứng dụng của bạn
// Không cần phải cứng nhắc 'http://localhost:3000' nữa
const YOUR_DOMAIN = process.env.RAILWAY_STATIC_URL;

app.post('/create-payment-link', async (req, res) => {
  const order = {
    amount: 2000, // Amount in cents
    description: 'Thanh toan mi tom',
    orderCode: 53,
    returnUrl: `${YOUR_DOMAIN}/success.html`,
    cancelUrl: `${YOUR_DOMAIN}/cancel.html`,
  };

  try {
    const paymentLink = await payos.createPaymentLink(order);
    res.redirect(303, paymentLink.checkoutUrl);
  } catch (error) {
    console.error("Lỗi khi tạo liên kết thanh toán:", error);
    res.status(500).send("Đã xảy ra lỗi khi tạo liên kết thanh toán.");
  }
});

// Railway sẽ tự động gán cổng, bạn nên sử dụng process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
