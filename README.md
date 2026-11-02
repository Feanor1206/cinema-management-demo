# Cinema Management Demo

Ứng dụng web demo tiếng Việt cho quản lý phim, lịch chiếu, bán vé, thành viên và thống kê doanh thu. Dữ liệu và tài khoản đều là dữ liệu giả; hoàn tiền chỉ được ghi nhận tại quầy, không kết nối cổng thanh toán.

React · TypeScript · Express · SQLite. Mã nguồn không chứa comment; tên hàm, kiểu dữ liệu và các tệp tài liệu mô tả cách hoạt động.

![Màn hình tổng quan Cinema](docs/images/dashboard.png)

## Yêu cầu và chạy

Cần Node.js 24 trở lên và npm. Tại thư mục dự án:

```powershell
npm ci
npm run dev
```

Mở http://127.0.0.1:3000. Tài khoản mẫu: `manager` hoặc `cashier`, mật khẩu `Cinema123!`. Manager quản lý phim và lịch chiếu; cashier bán vé và xem báo cáo trong rạp được phân quyền.

```powershell
npm run check
npm run test:e2e
```

Lệnh `check` chạy typecheck, lint, kiểm thử API và build. Lần đầu chạy E2E có thể cần `npx playwright install chromium`. Dữ liệu SQLite mặc định tại `data/cinema.sqlite`, được giữ lại khi khởi động lại; seed chỉ tạo khi cơ sở dữ liệu mới. Có thể đặt `DATABASE_PATH`, `HOST` và `PORT` qua biến môi trường.

Hiện có 16 kiểm thử API và 5 luồng Playwright, gồm xung đột lịch, bán trùng ghế, điểm thành viên, trả vé, phân quyền, ranh giới ngày Việt Nam, lưu dữ liệu qua lần khởi động lại và giao diện 375px. `check` còn kiểm tra định dạng và quy tắc không có comment trong mã nguồn. GitHub Actions chạy lại các kiểm tra trên Node 24.

Để chạy bản build cục bộ:

```powershell
npm run build
npm start
```

## Kịch bản và giới hạn

Xem [kịch bản trình bày](docs/DEMO.md) và [cấu trúc chương trình](docs/ARCHITECTURE.md). Đổi điểm trong giao diện demo chỉ hỗ trợ đổi 500 điểm lấy một vé 2D Standard; quy đổi dịch vụ không được triển khai. Trả vé đổi điểm không hoàn tiền và không tự hoàn điểm. Nếu số dư hiện tại không đủ thu hồi điểm đã cộng cho vé, hệ thống từ chối trả và giữ nguyên dữ liệu. Doanh thu báo cáo tính tiền vé sau ưu đãi trừ tiền hoàn theo kỳ, không gồm dịch vụ.

React tại `web/` tương ứng phần Frm trong mô hình báo cáo; các route và xử lý nghiệp vụ tại `server/` tương ứng Ctrl; truy vấn SQLite tương ứng DAO. Kiểu dữ liệu dùng chung nằm tại `shared/contracts.ts`. Đây là demo học tập, không phải hệ thống triển khai thực tế.
