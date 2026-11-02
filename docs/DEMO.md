# Kịch bản trình bày demo

1. Chạy ứng dụng và đăng nhập `manager` / `Cinema123!`. Tìm “Đào”, phân biệt P001 và P005 qua mã, năm; mở P001 và sửa thời lượng từ 100 thành 105 phút.
2. Tạo một suất tương lai trong phòng phù hợp. Thử chọn giờ trùng để thấy thông báo; suất tiếp theo có thể bắt đầu đúng lúc suất trước kết thúc.
3. Đăng xuất, đăng nhập `cashier` / `Cinema123!`. Tại quầy vé chọn suất mẫu và tra số `0987654321`. Chọn F05 Standard và F06 VIP, đổi 500 điểm cho F05, thanh toán F06 100.000 đồng. Khách từ 650 điểm còn 160 điểm: trừ 500 và cộng 10. Mở lại hóa đơn để kiểm tra.
4. Mở báo cáo, chọn khoảng ngày và nhóm phim hoặc rạp. Đi từ nhóm đến suất và hóa đơn; doanh thu vé không tính dịch vụ. Thử khoảng ngày không có dữ liệu.
5. Trả một vé còn đủ thời gian và xem tiền hoàn trên báo cáo của kỳ hoàn. Hoàn tiền là ghi nhận tại quầy, không chuyển tiền thật. Vé đã trả không thể trả lần hai.

Seed chỉ chạy trên cơ sở dữ liệu mới. Để lặp lại ví dụ với dữ liệu ban đầu, dùng `DATABASE_PATH` trỏ đến một tệp SQLite mới, rồi khởi động lại ứng dụng. Không xóa dữ liệu đang cần giữ.
