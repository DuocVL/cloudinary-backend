const express = require('express');
const PayOS = require('@payos/node');

// Lấy các biến môi trường từ Railway
const PAY_OS_CLIENT_ID = process.env.PAY_OS_CLIENT_ID;
const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
const PAYOS_CHECKSUMKEY = process.env.PAYOS_CHECKSUMKEY;

// Khởi tạo đối tượng PayOS với các biến môi trường
const payos = new PayOS(
  PAY_OS_CLIENT_ID,
  PAYOS_API_KEY,
  PAYOS_CHECKSUMKEY,
);

const app = express();
app.use(express.static('public'));
// Không cần app.use(express.json()) nữa vì dữ liệu sẽ đến từ URL

// Railway sẽ cung cấp URL động cho ứng dụng của bạn
const YOUR_DOMAIN = process.env.RAILWAY_STATIC_URL;

app.get('/create-payment-link', async (req, res) => {
  const { amount, description, orderCode } = req.query;

  // Kiểm tra xem các tham số bắt buộc có được cung cấp không
  if (!amount || !description || !orderCode) {
    return res.status(400).send("Vui lòng cung cấp amount, description và orderCode qua query parameters.");
  }

  const order = {
    amount: parseInt(amount),
    description: description,
    orderCode: String(orderCode),
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));