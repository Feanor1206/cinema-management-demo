# Cinema management demo

Ứng dụng web demo tiếng Việt cho báo cáo CNPM_HOAN_CHINH. Bốn chức năng chính: sửa thông tin phim, lên lịch chiếu, bán vé và thống kê doanh thu. Bổ sung đăng nhập, tra cứu thành viên, đăng ký thành viên, dịch vụ trong hóa đơn và trả vé để chạy trọn quy trình đã mô tả.

## Kiến trúc

React và TypeScript ở web/, Express ở server/, SQLite qua node:sqlite. UI tương ứng Frm, route/service tương ứng Ctrl, truy vấn SQLite tương ứng DAO; shared/contracts.ts là hợp đồng dữ liệu. Tiền dùng số nguyên VNĐ. Một tiến trình Node phục vụ API và Vite khi phát triển; bản build phục vụ web tĩnh và API cùng origin. Dùng Node 24 trở lên. Không viết comment trong code. Không đưa báo cáo hoặc thông tin thật của sinh viên vào repo.

## Hợp đồng HTTP

Response thành công là JSON trực tiếp theo shared/contracts.ts. Lỗi { error, code }, HTTP 400/401/403/404/409/500. Cookie session HttpOnly, SameSite=Lax, hết hạn; mật khẩu hash bằng scrypt; kiểm tra Origin cho request thay đổi dữ liệu. Tài khoản demo manager / Cinema123! và cashier / Cinema123!, chỉ dữ liệu giả.

| Method | Route                    | Body / query                             | Response                                   |
| ------ | ------------------------ | ---------------------------------------- | ------------------------------------------ |
| GET    | /api/health              |                                          | { ok: true }                               |
| POST   | /api/auth/login          | { username, password }                   | User                                       |
| POST   | /api/auth/logout         |                                          | { ok: true }                               |
| GET    | /api/auth/me             |                                          | User                                       |
| GET    | /api/bootstrap           |                                          | Bootstrap                                  |
| GET    | /api/movies              | q optional                               | Movie[]                                    |
| POST   | /api/movies              | MovieInput                               | Movie                                      |
| PUT    | /api/movies/:id          | MovieInput                               | Movie                                      |
| POST   | /api/showtimes           | ShowtimeInput                            | Showtime                                   |
| GET    | /api/showtimes/:id/seats |                                          | Seat[]                                     |
| GET    | /api/customers           | phone exact optional                     | Customer[]                                 |
| POST   | /api/customers           | { name, phone }                          | Customer                                   |
| POST   | /api/sales               | SaleInput                                | Invoice                                    |
| GET    | /api/invoices/:id        |                                          | Invoice                                    |
| POST   | /api/tickets/:id/return  |                                          | { refund: number, pointsDeducted: number } |
| GET    | /api/reports             | from,to YYYY-MM-DD; groupBy movie/cinema | Report                                     |
| GET    | /api/reports/showtimes   | from,to,groupBy,groupId                  | ReportShowtime[]                           |
| GET    | /api/reports/invoices    | from,to,showtimeId                       | ReportInvoice[]                            |

Manager sửa/thêm phim và lập lịch; cashier bị từ chối ở API. Hai vai trò được bán vé và xem báo cáo trong rạp được phân quyền. Manager xem toàn chuỗi. Tất cả dữ liệu viết phải được kiểm tra server, số lượng giới hạn, truy vấn tham số hóa. Chỉ API app factory createApp({ dbPath, now?, serveWeb? }) xuất từ server/app.ts, trả { app, close }; now là () => Date để kiểm thử; server/index.ts chỉ khởi động, không chạy khi import app. SQLITE file mặc định data/cinema.sqlite, PORT mặc định 3000, HOST mặc định 127.0.0.1. API test dùng SQLite tạm và now cố định.

## Quy tắc nghiệm thu

- Phim có P001 và P005 tìm được bằng từ Đào, phân biệt được qua mã và năm. Sửa P001 từ 100 sang 105 phút, giữ mã. Thời lượng nguyên dương, thông tin bắt buộc không trống. Không sửa thời lượng nếu gây chồng lịch ở tương lai.
- Suất trong cùng phòng không trùng khoảng [bắt đầu, kết thúc), kể cả qua ngày; cho phép nối tiếp đúng giờ kết thúc. Giá nguyên dương, suất tương lai, phim/phòng tương thích định dạng. Tính kết thúc từ thời lượng phim.
- Ghế theo suất, Standard 80.000, VIP 100.000 trong suất mẫu. Có các ghế F05 Standard và F06 VIP để chạy ví dụ. Khách Nguyễn Văn B có 650 điểm, số điện thoại 0987654321. Đổi 500 điểm cho đúng một vé 2D Standard, vé đổi không kiếm điểm. Vé F05 đổi điểm + F06 trả 100.000 sinh 10 điểm, số dư 160. Điểm cộng theo từng dòng tiền thực trả, 1 điểm/10.000 VNĐ; dịch vụ có thể đổi 50 điểm cho 1.000 VNĐ nhưng phiên demo chỉ cung cấp đổi vé 500 điểm, ghi rõ giới hạn trong README. Không cập nhật ghế, hóa đơn hoặc điểm một phần khi lỗi. Không bán một ghế hai lần trong cùng suất, kiểm tra ngay lúc ghi. Không bán suất đã bắt đầu. Hóa đơn đọc lại/in lại được.
- Trả vé trước 48h hoàn 100%, từ 24h hoàn 80%, từ 12h hoàn 60%, từ 6h hoàn 40%, dưới 6h từ chối. Chỉ một lần mỗi vé, ghi giao dịch riêng, thu hồi đúng điểm đã cộng; vé đổi điểm không hoàn tiền, không tự bịa chính sách hoàn điểm. Tránh số dư âm bằng từ chối nếu điểm còn lại không đủ để thu hồi, UI giải thích. Hoàn tiền tại quầy trong demo là ghi nhận, không có cổng thanh toán.
- Thống kê doanh thu vé = tiền bán sau ưu đãi phát sinh trong kỳ trừ tiền hoàn trong kỳ; không cộng đồ ăn, không lấy tổng hóa đơn để cộng lặp. Group theo phim/rạp, drill down suất và hóa đơn giữ bộ lọc, nhóm sắp net giảm dần. Ngày tính theo Asia/Ho_Chi_Minh. Tổng drill down khớp báo cáo tổng. Vé đổi điểm tính số vé, tiền bằng 0. Ngày sai trả lỗi; không dữ liệu hiển thị trạng thái rỗng. Dữ liệu seed có giao dịch bán và hoàn trong tuần gần thời điểm chạy, suất mẫu tương lai.
- Web dùng tiếng Việt, loading/error/empty state, form validation, thao tác keyboard, dialog đóng bằng Escape và quản lý focus, 375px không tràn trang; desktop đẹp, sidebar, trang phim, lịch chiếu, quầy vé và báo cáo. Có màn đăng nhập và nút điền tài khoản demo. Không gọi API ngoài để tải poster/font; dùng CSS minh họa poster và font hệ thống.
- Chạy npm ci, npm run check, npm run test:e2e. SQLite tồn tại qua restart, seed chỉ chạy trên DB mới. GitHub CI chạy lint/typecheck/test/build, không chứa secret/DB/node_modules/graphify-out. Có README tiếng Việt, hướng dẫn chạy và kịch bản trình bày.

## Các phần việc

Thứ tự phụ thuộc: tài khoản và danh mục → lịch chiếu và bán vé → báo cáo. Giao diện và API dùng chung hợp đồng tại `shared/contracts.ts`; khi đổi cấu trúc dữ liệu phải cập nhật cả bên gửi, bên nhận và kiểm thử.
