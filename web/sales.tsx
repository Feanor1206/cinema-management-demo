import { useEffect, useRef, useState } from 'react';
import type { Bootstrap, Customer, Invoice, Seat, SaleInput } from '../shared/contracts';
import { api, post, money, dateTime, Dialog, ErrorMessage, Empty, Field } from './common';

type Props = { data: Bootstrap; refresh: () => Promise<void> };
export function Receipt({
  invoice,
  close,
  reload,
}: {
  invoice: Invoice;
  close: () => void;
  reload: (id: string) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function returnTicket(id: string) {
    setBusy(true);
    setError('');
    try {
      const result = await post<{ refund: number; pointsDeducted: number }>(
        `/tickets/${id}/return`,
      );
      await reload(invoice.id);
      setError(
        `Đã ghi nhận hoàn ${money(result.refund)} và thu hồi ${result.pointsDeducted} điểm.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Hóa đơn ${invoice.id}`} close={close}>
      <div className="receipt">
        <div className="receipt-brand">
          CINEMA <span>· HÓA ĐƠN BÁN HÀNG</span>
        </div>
        <div className="receipt-details">
          <span>Phim</span>
          <strong>{invoice.movieTitle}</strong>
          <span>Suất chiếu</span>
          <strong>{dateTime(invoice.startsAt)}</strong>
          <span>Rạp / phòng</span>
          <strong>
            {invoice.cinemaName} · {invoice.roomName}
          </strong>
          <span>Khách hàng</span>
          <strong>{invoice.customerName || 'Khách lẻ'}</strong>
          <span>Nhân viên</span>
          <strong>{invoice.staffName}</strong>
          <span>Thanh toán</span>
          <strong>{invoice.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}</strong>
          <span>Thời gian lập</span>
          <strong>{dateTime(invoice.createdAt)}</strong>
        </div>
        <h3>Chi tiết vé</h3>
        {invoice.tickets.map((t) => (
          <div className="receipt-line" key={t.id}>
            <span>
              {t.seatLabel} · {t.type}{' '}
              {t.status === 'returned' && <span className="muted">(Đã trả)</span>}
              <small>{t.pointsUsed ? `Đổi ${t.pointsUsed} điểm` : ''}</small>
            </span>
            <strong>{money(t.price - t.discount)}</strong>
            {t.status === 'active' && (
              <button
                type="button"
                className="text-button no-print"
                disabled={busy}
                onClick={() => returnTicket(t.id)}
              >
                Trả vé
              </button>
            )}
          </div>
        ))}
        {invoice.services.map((s, i) => (
          <div className="receipt-line" key={`${s.name}-${i}`}>
            <span>
              {s.name} × {s.quantity}
            </span>
            <strong>{money(s.total)}</strong>
          </div>
        ))}
        <div className="receipt-total">
          <span>Tổng thanh toán</span>
          <strong>{money(invoice.total)}</strong>
        </div>
        <p className="muted">
          Điểm sử dụng: {invoice.pointsUsed} · Điểm tích lũy: {invoice.pointsEarned}
          {invoice.pointsBalance !== null && ` · Số dư: ${invoice.pointsBalance} (sau khi mua)`}
        </p>
        <p className="muted">
          Trả vé theo thời gian trước suất chiếu; điểm đã tích sẽ được thu hồi. Vé đổi điểm không
          hoàn tiền.
        </p>
        <ErrorMessage message={error} />
        <div className="actions no-print">
          <button type="button" className="secondary" onClick={close}>
            Đóng
          </button>
          <button type="button" className="primary" onClick={() => window.print()}>
            In hóa đơn
          </button>
        </div>
      </div>
    </Dialog>
  );
}
export function Sales({ data, refresh }: Props) {
  const future = data.showtimes
    .filter((s) => new Date(s.startsAt).getTime() > Date.now())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const [showtimeId, setShowtimeId] = useState(future[0]?.id || '');
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [lookupDone, setLookupDone] = useState(false);
  const [redeem, setRedeem] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [payment, setPayment] = useState<'cash' | 'transfer'>('cash');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoiceId, setInvoiceId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const seatRequest = useRef(0);
  const showtime = data.showtimes.find((s) => s.id === showtimeId);
  const movie = data.movies.find((m) => m.id === showtime?.movieId);
  const chosen = seats.filter((s) => selected.includes(s.id));
  async function loadSeats(id: string) {
    const request = ++seatRequest.current;
    if (!id) {
      setSeats([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await api<Seat[]>(`/showtimes/${id}/seats`);
      if (request === seatRequest.current) {
        setSeats(result);
        setSelected((current) =>
          current.filter((seatId) => result.some((seat) => seat.id === seatId && !seat.sold)),
        );
        setRedeem((current) =>
          result.some((seat) => seat.id === current && !seat.sold) ? current : '',
        );
      }
    } catch (err) {
      if (request === seatRequest.current) {
        setSeats([]);
        setError((err as Error).message);
      }
    } finally {
      if (request === seatRequest.current) setLoading(false);
    }
  }
  useEffect(() => {
    setSelected([]);
    setSeats([]);
    setRedeem('');
    void loadSeats(showtimeId);
    return () => {
      seatRequest.current += 1;
    };
  }, [showtimeId]);
  async function lookup() {
    setError('');
    setBusy(true);
    try {
      const results = await api<Customer[]>(`/customers?phone=${encodeURIComponent(phone)}`);
      setCustomer(results[0] || null);
      setLookupDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createCustomer() {
    setError('');
    setBusy(true);
    try {
      setCustomer(await post<Customer>('/customers', { name, phone }));
      setLookupDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadInvoice(id: string) {
    setInvoice(await api<Invoice>(`/invoices/${encodeURIComponent(id)}`));
  }
  async function openInvoice() {
    setError('');
    try {
      await loadInvoice(invoiceId.trim());
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function sell() {
    setBusy(true);
    setError('');
    try {
      const body: SaleInput = {
        showtimeId,
        seatIds: selected,
        customerId: customer?.id,
        redeemSeatId: redeem || undefined,
        services: Object.entries(quantities)
          .filter(([, n]) => n > 0)
          .map(([serviceId, quantity]) => ({ serviceId, quantity })),
        paymentMethod: payment,
      };
      const result = await post<Invoice>('/sales', body);
      setInvoice(result);
      setSelected([]);
      setRedeem('');
      setQuantities({});
      setCustomer(null);
      setPhone('');
      setName('');
      setLookupDone(false);
      await loadSeats(showtimeId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
      await loadSeats(showtimeId);
    } finally {
      setBusy(false);
    }
  }
  const total =
    chosen.reduce((sum, s) => sum + (s.id === redeem ? 0 : s.price), 0) +
    data.services.reduce((sum, s) => sum + s.price * (quantities[s.id] || 0), 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">QUẦY GIAO DỊCH</div>
          <h1>Bán vé</h1>
          <p>Chọn suất chiếu, ghế ngồi và hoàn tất thanh toán.</p>
        </div>
      </div>
      <ErrorMessage message={error} />
      <div className="sale-layout">
        <section className="panel seat-panel">
          <div className="section-title">
            <div>
              <h2>Chọn ghế</h2>
              <p>Chọn một suất chiếu để xem sơ đồ ghế</p>
            </div>
          </div>
          <Field label="Suất chiếu">
            <select
              value={showtimeId}
              disabled={busy}
              onChange={(e) => setShowtimeId(e.target.value)}
            >
              <option value="">Chọn suất chiếu</option>
              {future.map((s) => (
                <option key={s.id} value={s.id}>
                  {data.movies.find((m) => m.id === s.movieId)?.title} · {dateTime(s.startsAt)} ·{' '}
                  {data.rooms.find((r) => r.id === s.roomId)?.name}
                </option>
              ))}
            </select>
          </Field>
          {loading ? (
            <Empty>Đang tải sơ đồ ghế...</Empty>
          ) : !seats.length ? (
            <Empty>Chưa có ghế cho suất chiếu này.</Empty>
          ) : (
            <>
              <div className="screen">MÀN HÌNH</div>
              <div className="seats-scroll">
                <div className="seat-map">
                  {[...new Set(seats.map((s) => s.row))].map((row) => (
                    <div className="seat-row" key={row}>
                      <span>{row}</span>
                      {seats
                        .filter((s) => s.row === row)
                        .map((s) => (
                          <button
                            type="button"
                            key={s.id}
                            disabled={s.sold}
                            className={`seat ${s.type === 'VIP' ? 'vip' : ''} ${selected.includes(s.id) ? 'selected' : ''}`}
                            aria-label={`Ghế ${s.id}, ${s.type}, ${s.sold ? 'đã bán' : money(s.price)}`}
                            aria-pressed={selected.includes(s.id)}
                            onClick={() => {
                              setSelected(
                                selected.includes(s.id)
                                  ? selected.filter((id) => id !== s.id)
                                  : [...selected, s.id],
                              );
                              if (redeem === s.id) setRedeem('');
                            }}
                          >
                            {s.number}
                          </button>
                        ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="legend">
                <span>
                  <i /> Standard
                </span>
                <span>
                  <i className="vip" /> VIP
                </span>
                <span>
                  <i className="selected" /> Đang chọn
                </span>
                <span>
                  <i className="sold" /> Đã bán
                </span>
              </div>
            </>
          )}
        </section>
        <aside className="panel checkout">
          <div className="section-title">
            <div>
              <h2>Thông tin thanh toán</h2>
              <p>{movie?.title || 'Chưa chọn suất chiếu'}</p>
            </div>
          </div>
          <div className="checkout-section">
            <h3>
              Ghế đã chọn <span>{selected.length}</span>
            </h3>
            {chosen.length ? (
              chosen.map((s) => (
                <div className="price-line" key={s.id}>
                  <span>
                    {s.id} · {s.type}
                  </span>
                  <strong>{money(s.price)}</strong>
                </div>
              ))
            ) : (
              <p className="muted">Chưa có ghế được chọn</p>
            )}
          </div>
          <div className="checkout-section">
            <h3>Thành viên</h3>
            <div className="inline-input">
              <input
                aria-label="Số điện thoại thành viên"
                placeholder="Số điện thoại"
                disabled={busy}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setCustomer(null);
                  setRedeem('');
                  setName('');
                  setLookupDone(false);
                }}
              />
              <button
                type="button"
                className="secondary"
                disabled={!phone || busy}
                onClick={lookup}
              >
                Tra cứu
              </button>
            </div>
            {customer ? (
              <div className="member">
                <strong>{customer.name}</strong>
                <span>{customer.points} điểm</span>
              </div>
            ) : (
              lookupDone && (
                <div className="new-member">
                  <p>Chưa tìm thấy thành viên. Đăng ký mới:</p>
                  <div className="inline-input">
                    <input
                      aria-label="Tên thành viên"
                      placeholder="Họ và tên"
                      disabled={busy}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="secondary"
                      disabled={!name || busy}
                      onClick={createCustomer}
                    >
                      Đăng ký
                    </button>
                  </div>
                </div>
              )
            )}
            {customer && (
              <Field label="Đổi 500 điểm lấy một vé 2D Standard">
                <select
                  value={redeem}
                  onChange={(e) => setRedeem(e.target.value)}
                  disabled={customer.points < 500 || movie?.format !== '2D'}
                >
                  <option value="">Không đổi điểm</option>
                  {chosen
                    .filter((s) => s.type === 'Standard')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} · {money(s.price)}
                      </option>
                    ))}
                </select>
              </Field>
            )}
          </div>
          <div className="checkout-section">
            <h3>Dịch vụ</h3>
            {data.services.map((s) => (
              <div className="service-line" key={s.id}>
                <span>
                  {s.name}
                  <small>{money(s.price)}</small>
                </span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  aria-label={`Số lượng ${s.name}`}
                  value={quantities[s.id] || 0}
                  onChange={(e) =>
                    setQuantities({ ...quantities, [s.id]: Math.max(0, Number(e.target.value)) })
                  }
                />
              </div>
            ))}
          </div>
          <Field label="Phương thức thanh toán">
            <select
              value={payment}
              onChange={(e) => setPayment(e.target.value as 'cash' | 'transfer')}
            >
              <option value="cash">Tiền mặt</option>
              <option value="transfer">Chuyển khoản</option>
            </select>
          </Field>
          <div className="total">
            <span>Tổng thanh toán</span>
            <strong>{money(total)}</strong>
          </div>
          <button
            type="button"
            className="primary wide"
            disabled={!selected.length || busy || loading}
            onClick={sell}
          >
            {busy ? 'Đang xử lý...' : 'Thanh toán'}
          </button>
          <div className="invoice-lookup">
            <label htmlFor="invoice-id">Tra cứu hóa đơn</label>
            <div className="inline-input">
              <input
                id="invoice-id"
                placeholder="Nhập mã hóa đơn"
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
              />
              <button
                type="button"
                className="secondary"
                disabled={!invoiceId.trim()}
                onClick={openInvoice}
              >
                Xem
              </button>
            </div>
          </div>
        </aside>
      </div>
      {invoice && (
        <Receipt
          invoice={invoice}
          close={() => {
            setInvoice(null);
            void refresh();
          }}
          reload={loadInvoice}
        />
      )}
    </>
  );
}
