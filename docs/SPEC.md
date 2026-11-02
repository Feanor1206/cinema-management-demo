# Chức năng và API

Ứng dụng có bốn chức năng chính: sửa thông tin phim, lên lịch chiếu, bán vé và thống kê doanh thu. Các chức năng đi kèm gồm đăng nhập, tra cứu và đăng ký thành viên, bán dịch vụ và trả vé.

## Kiến trúc

Giao diện React và TypeScript nằm trong `web/`, API Express nằm trong `server/`. Cơ sở dữ liệu SQLite được truy cập qua `node:sqlite`. Kiểu dữ liệu trao đổi được định nghĩa tại `shared/contracts.ts`. Giá tiền được lưu dưới dạng số nguyên, đơn vị VNĐ. Khi phát triển, một tiến trình Node chạy API và Vite; bản build phục vụ giao diện và API trên cùng địa chỉ.

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

Quản lý được thêm, sửa phim, lập lịch và xem dữ liệu toàn chuỗi. Nhân viên bán vé được bán vé và xem báo cáo trong rạp được phân quyền. API kiểm tra dữ liệu đầu vào, giới hạn số lượng và sử dụng truy vấn có tham số.

`createApp({ dbPath, now?, serveWeb? })` trong `server/app.ts` trả về `{ app, close }`. Tham số `now` cho phép cố định thời gian khi kiểm thử. `server/index.ts` khởi động máy chủ; dữ liệu mặc định nằm tại `data/cinema.sqlite`, địa chỉ `127.0.0.1`, cổng `3000`.

## Quy tắc nghiệp vụ

- Phim có P001 và P005 tìm được bằng từ Đào, phân biệt được qua mã và năm. Sửa P001 từ 100 sang 105 phút, giữ mã. Thời lượng nguyên dương, thông tin bắt buộc không trống. Không sửa thời lượng nếu gây chồng lịch ở tương lai.
- Suất trong cùng phòng không trùng khoảng [bắt đầu, kết thúc), kể cả qua ngày; cho phép nối tiếp đúng giờ kết thúc. Giá nguyên dương, suất tương lai, phim/phòng tương thích định dạng. Tính kết thúc từ thời lượng phim.
- Ghế được quản lý theo suất. Giá mẫu: Standard 80.000 đồng, VIP 100.000 đồng; F05 là ghế Standard, F06 là ghế VIP. Thành viên Nguyễn Văn B, số điện thoại 0987654321, có 650 điểm. Đổi 500 điểm cho một vé 2D Standard; vé đổi không được cộng điểm mới. Khi đổi F05 và thanh toán F06, khách trả 100.000 đồng, được cộng 10 điểm và còn 160 điểm. Điểm được cộng theo từng dòng tiền thực trả, mức 1 điểm/10.000 đồng. Giao dịch lỗi được hoàn tác toàn bộ. Một ghế chỉ được bán một lần trong cùng suất; không bán suất đã bắt đầu. Hóa đơn đã lưu có thể tra cứu và in lại.
- Trả vé trước giờ chiếu từ 48 giờ được hoàn 100%; từ 24 giờ hoàn 80%; từ 12 giờ hoàn 60%; từ 6 giờ hoàn 40%; dưới 6 giờ bị từ chối. Mỗi vé chỉ được trả một lần. Giao dịch trả được lưu riêng và thu hồi điểm đã cộng cho vé. Vé đổi điểm không được hoàn tiền hoặc hoàn điểm. Nếu số dư không đủ để thu hồi điểm, giao dịch trả bị từ chối và dữ liệu được giữ nguyên.
- Thống kê doanh thu vé = tiền bán sau ưu đãi phát sinh trong kỳ trừ tiền hoàn trong kỳ; không cộng đồ ăn, không lấy tổng hóa đơn để cộng lặp. Group theo phim/rạp, drill down suất và hóa đơn giữ bộ lọc, nhóm sắp net giảm dần. Ngày tính theo Asia/Ho_Chi_Minh. Tổng drill down khớp báo cáo tổng. Vé đổi điểm tính số vé, tiền bằng 0. Ngày sai trả lỗi; không dữ liệu hiển thị trạng thái rỗng. Dữ liệu seed có giao dịch bán và hoàn trong tuần gần thời điểm chạy, suất mẫu tương lai.
- Giao diện sử dụng tiếng Việt, có thông báo đang tải, lỗi và không có dữ liệu. Biểu mẫu kiểm tra dữ liệu trước khi gửi; hộp thoại hỗ trợ phím Escape và trả focus về nút mở. Giao diện hỗ trợ màn hình rộng và điện thoại.
- Dữ liệu SQLite được giữ lại khi khởi động lại; dữ liệu mẫu chỉ được tạo trên CSDL mới. Kiểm thử API dùng CSDL tạm và thời gian cố định. Kiểm thử giao diện sử dụng Playwright.

## Quan hệ giữa các chức năng

Thứ tự phụ thuộc: tài khoản và danh mục → lịch chiếu và bán vé → báo cáo. Giao diện và API dùng chung hợp đồng tại `shared/contracts.ts`; khi đổi cấu trúc dữ liệu phải cập nhật cả bên gửi, bên nhận và kiểm thử.
