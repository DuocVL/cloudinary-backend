# 🎬 MovieApp Backend API (Cloudinary-Backend)

[![GitHub license](https://img.shields.io/github/license/DuocVL/cloudinary-backend?style=flat-square)](https://github.com/DuocVL/cloudinary-backend/blob/main/LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-14%2B-green?style=flat-square)](https://nodejs.org/)
[![Framework](https://img.shields.io/badge/Framework-Express.js-blue?style=flat-square)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/Database-Firebase%20Firestore-orange?style=flat-square)](https://firebase.google.com/docs/firestore)
[![Deployed On](https://img.shields.io/badge/Deployed%20On-Railway-lightgrey?style=flat-square)](https://railway.app/)

API Backend cho ứng dụng xem phim MovieApp trên Android, được xây dựng bằng Node.js và Express.js. Backend này xử lý các logic nghiệp vụ quan trọng như tích hợp cổng thanh toán PayOS, quản lý dữ liệu người dùng và giao dịch qua Firebase Firestore, gửi thông báo đẩy bằng Firebase Cloud Messaging (FCM).

## Mục lục

- [Tổng quan](#tổng-quan)
- [Tính năng chính](#tính-năng-chính)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cấu trúc Project](#cấu-trúc-project)
- [Cài đặt và Chạy](#cài-đặt-và-chạy)
  - [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
  - [Cấu hình biến môi trường](#cấu-hình-biến-môi-trường)
  - [Chạy Server](#chạy-server)
- [API Endpoints](#api-endpoints)
- [Triển khai (Deployment)](#triển-khai-deployment)


## Tổng quan

Đây là phần backend hỗ trợ cho ứng dụng MovieApp Android. Nó cung cấp một loạt các API endpoints để xử lý các yêu cầu từ phía client, bao gồm:
* Xử lý thanh toán an toàn thông qua tích hợp với PayOS.
* Lưu trữ và truy xuất dữ liệu  giao dịch từ Firebase Firestore.
* Gửi thông báo đẩy đến người dùng thông qua Firebase Cloud Messaging.

## Tính năng chính

* **Xử lý thanh toán PayOS:**
    * Tạo yêu cầu thanh toán và trả về mã QR/thông tin thanh toán.
    * Xử lý callback (webhook) từ PayOS để cập nhật trạng thái giao dịch.
* **Quản lý dữ liệu Firebase Firestore:**
    * Lưu trữ và truy xuất dữ liệu  mua phim/gói.
* **Gửi thông báo đẩy (FCM):**
    * API để kích hoạt việc gửi thông báo tới các thiết bị người dùng.


## Công nghệ sử dụng

* **Ngôn ngữ:** Node.js
* **Framework:** Express.js
* **Cơ sở dữ liệu:** Firebase Cloud Firestore
* **API tích hợp:**
    * PayOS API (xử lý cổng thanh toán)
    * Firebase Admin SDK (tương tác với Firebase Auth, Firestore, FCM)
    * Cloudinary SDK (nếu có chức năng upload ảnh/video)
* **Quản lý gói:** npm
* **Triển khai:** Railway

## Cấu trúc Project

Dự án backend được tổ chức một cách đơn giản và hiệu quả như sau:
```text
cloudinary-backend/     # Thư mục gốc của dự án Node.js Server Backend, chứa toàn bộ mã nguồn backend.
├── node_modules/       # Thư viện và dependencies Node.js
├── public/             # Các tệp tĩnh (HTML, CSS, JS,...)
├── index.js            # File chính khởi tạo Express App
├── .env                # Cấu hình biến môi trường
├── package.json        # File manifest của Node.js
├── package-lock.json   # Khóa phiên bản dependencies
└── Procfile            # File khai báo tiến trình khi deploy (Railway)
```


## Cài đặt và Chạy

Làm theo các bước dưới đây để thiết lập và chạy server backend cục bộ trên máy của bạn.

### Yêu cầu hệ thống

* **Node.js:** Phiên bản 14.x hoặc cao hơn.
* **npm:** (Thường đi kèm với Node.js) hoặc Yarn.
* **Git:** Để clone repository.

### Cấu hình biến môi trường

1.  **Clone repository:**
    ```bash
    git clone [https://github.com/DuocVL/cloudinary-backend.git](https://github.com/DuocVL/cloudinary-backend.git)
    cd cloudinary-backend
    ```
2.  **Cài đặt các Dependencies:**
    ```bash
    npm install
    ```
3.  **Tạo file `.env`:**
    Tạo một file có tên `.env` trong thư mục gốc của dự án (`cloudinary-backend/`) và điền các thông tin cần thiết:
    ```dotenv
    PORT=3000
    PAYOS_CLIENT_ID=YOUR_PAYOS_CLIENT_ID
    PAYOS_API_KEY=YOUR_PAYOS_API_KEY
    PAYOS_CHECKSUM_KEY=YOUR_PAYOS_CHECKSUM_KEY
    FIREBASE_SERVICE_ACCOUNT_PATH=./path/to/your/firebase-service-account.json # Đảm bảo đường dẫn này trỏ đúng đến file JSON của bạn
    ```
    * **`PORT`**: Cổng mà server sẽ lắng nghe (mặc định là 3000).
    * **`PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`**: Lấy từ tài khoản PayOS Developer của bạn.
    * **`FIREBASE_SERVICE_ACCOUNT_PATH`**: Đường dẫn tương đối đến file JSON Service Account Key của Firebase. File này được tải xuống từ Firebase Console (Project settings -> Service accounts -> Generate new private key).

### Chạy Server

Sau khi đã cài đặt dependencies và cấu hình biến môi trường:
```bash
npm start # Hoặc npm run dev (nếu có script dev trong package.json)
```
Server sẽ khởi động và lắng nghe trên cổng được cấu hình (ví dụ: http://localhost:3000).

## API Endpoints
Dưới đây là một số API endpoints chính mà server này cung cấp (được định nghĩa trong index.js hoặc các file route được import):

POST /payos/create-payment: Khởi tạo một giao dịch thanh toán PayOS và trả về thông tin (ví dụ: mã QR).

POST /payos/callback: Endpoint webhook nhận thông báo trạng thái giao dịch từ PayOS.

POST /notifications/send: Gửi thông báo đẩy đến người dùng thông qua Firebase Cloud Messaging.

## Triển khai (Deployment)
1. Đảm bảo mã nguồn được đẩy lên GitHub .
2. Kết nối repository GitHub của bạn với Railway.
3. Cấu hình các biến môi trường trên Railway tương tự như file .env.
4. Railway sẽ tự động xây dựng và triển khai ứng dụng của bạn.
