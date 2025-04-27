const express = require('express');
const PayOS = require('@payos/node');
const bodyParser = require('body-parser'); // để đọc JSON webhook gửi về

// Lấy các biến môi trường từ Railway
const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID;
const PAYOS_API_KEY = process.env.PAYOS_API_KEY;
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

// Khởi tạo đối tượng PayOS
const payos = new PayOS(
  PAYOS_CLIENT_ID,
  PAYOS_API_KEY,
  PAYOS_CHECKSUM_KEY
);

const app = express();
app.use(express.static('public'));
app.use(bodyParser.json()); // Bắt buộc phải dùng để đọc dữ liệu JSON webhook gửi

const YOUR_DOMAIN = process.env.RAILWAY_STATIC_URL;

// API tạo link thanh toán
app.get('/create-payment-link', async (req, res) => {
  const { amount, description, orderCode } = req.query;
  console.log("Received query parameters:", req.query);

  if (!amount || !description || !orderCode) {
    return res.status(400).send("Vui lòng cung cấp amount, description và orderCode qua query parameters.");
  }

  const order = {
    amount: Number(amount),
    description: description,
    orderCode: Number(orderCode),
    returnUrl: `${YOUR_DOMAIN}/success.html`,
    cancelUrl: `${YOUR_DOMAIN}/cancel.html`,
    notifyUrl: `${YOUR_DOMAIN}/payment-callback`, // webhook báo trạng thái đơn hàng
  };

  try {
    const paymentLink = await payos.createPaymentLink(order);
    res.redirect(303, paymentLink.checkoutUrl);
  } catch (error) {
    console.error("Lỗi khi tạo liên kết thanh toán:", error);
    res.status(500).send("Đã xảy ra lỗi khi tạo liên kết thanh toán.");
  }
});

// API nhận webhook từ PayOS
app.post('/payment-callback', async (req, res) => {
  try {
    const data = req.body;
    console.log("Webhook nhận được:", data);

    // Xác thực dữ liệu từ PayOS bằng checksum
    const isValid = payos.verifyPaymentWebhook(data);

    if (!isValid) {
      console.warn("Webhook không hợp lệ (sai checksum)!");
      return res.status(400).send("Invalid checksum");
    }

    const { orderCode, status } = data;

    // Tùy theo status, bạn xử lý: cập nhật database, gửi thông báo, v.v...
    if (status === 'PAID') {
      console.log(`Đơn hàng ${orderCode} đã thanh toán thành công ✅`);
      // TODO: Cập nhật trạng thái đơn hàng trong DB
    } else if (status === 'CANCELED') {
      console.log(`Đơn hàng ${orderCode} đã bị hủy ❌`);
      // TODO: Cập nhật trạng thái đơn hàng trong DB
    } else {
      console.log(`Đơn hàng ${orderCode} có trạng thái: ${status}`);
    }

    res.status(200).send("Received"); // luôn phản hồi 200 để PayOS biết bạn nhận rồi
  } catch (error) {
    console.error("Lỗi xử lý webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
