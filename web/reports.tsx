import { useEffect, useState } from 'react';
import type {
  Bootstrap,
  Invoice,
  Report,
  ReportFilter,
  ReportInvoice,
  ReportShowtime,
} from '../shared/contracts';
import { api, money, dateTime, ErrorMessage, Empty, Field } from './common';
import { Receipt } from './sales';

export function Reports({ data }: { data: Bootstrap }) {
  const start = new Date(`${data.today}T12:00:00`);
  start.setDate(start.getDate() - 6);
  const [filter, setFilter] = useState<ReportFilter>({
    from: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
    to: data.today,
    groupBy: 'movie',
  });
  const [applied, setApplied] = useState(filter);
  const [report, setReport] = useState<Report | null>(null);
  const [group, setGroup] = useState<{ id: string; name: string } | null>(null);
  const [shows, setShows] = useState<ReportShowtime[]>([]);
  const [show, setShow] = useState<ReportShowtime | null>(null);
  const [invoices, setInvoices] = useState<ReportInvoice[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const params = (f: ReportFilter) => new URLSearchParams(f).toString();
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    setReport(null);
    setGroup(null);
    setShow(null);
    api<Report>(`/reports?${params(applied)}`)
      .then((r) => {
        if (active) setReport(r);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [applied]);
  async function selectGroup(id: string, name: string) {
    setBusy(true);
    setError('');
    setGroup({ id, name });
    setShows([]);
    setShow(null);
    setInvoices([]);
    try {
      setShows(
        await api<ReportShowtime[]>(
          `/reports/showtimes?${params(applied)}&groupId=${encodeURIComponent(id)}`,
        ),
      );
    } catch (err) {
      setError((err as Error).message);
      setShows([]);
    } finally {
      setBusy(false);
    }
  }
  async function selectShow(s: ReportShowtime) {
    setBusy(true);
    setError('');
    setShow(s);
    setInvoices([]);
    try {
      setInvoices(
        await api<ReportInvoice[]>(
          `/reports/invoices?from=${applied.from}&to=${applied.to}&showtimeId=${encodeURIComponent(s.id)}`,
        ),
      );
    } catch (err) {
      setError((err as Error).message);
      setInvoices([]);
    } finally {
      setBusy(false);
    }
  }
  async function loadInvoice(id: string) {
    try {
      setInvoice(await api<Invoice>(`/invoices/${encodeURIComponent(id)}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }
  const max = Math.max(1, ...(report?.rows.map((r) => Math.abs(r.net)) || []));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PHÂN TÍCH KINH DOANH</div>
          <h1>Doanh thu</h1>
          <p>Theo dõi doanh thu vé và chi tiết giao dịch.</p>
        </div>
      </div>
      <form
        className="report-filters panel"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ ...filter });
        }}
      >
        <Field label="Từ ngày">
          <input
            required
            type="date"
            value={filter.from}
            onChange={(e) => setFilter({ ...filter, from: e.target.value })}
          />
        </Field>
        <Field label="Đến ngày">
          <input
            required
            type="date"
            value={filter.to}
            onChange={(e) => setFilter({ ...filter, to: e.target.value })}
          />
        </Field>
        <Field label="Nhóm theo">
          <select
            value={filter.groupBy}
            onChange={(e) =>
              setFilter({ ...filter, groupBy: e.target.value as ReportFilter['groupBy'] })
            }
          >
            <option value="movie">Phim</option>
            <option value="cinema">Rạp</option>
          </select>
        </Field>
        <button className="primary" disabled={busy}>
          Xem báo cáo
        </button>
      </form>
      <ErrorMessage message={error} />
      {busy && (
        <p className="muted" role="status">
          Đang tải dữ liệu...
        </p>
      )}
      {report && (
        <>
          <div className="stats">
            <div className="stat">
              <span>Doanh thu thuần</span>
              <strong>{money(report.totals.net)}</strong>
              <small>Doanh thu vé sau hoàn</small>
            </div>
            <div className="stat">
              <span>Vé đã bán</span>
              <strong>{report.totals.ticketsSold}</strong>
              <small>Trong khoảng thời gian chọn</small>
            </div>
            <div className="stat">
              <span>Vé đã trả</span>
              <strong>{report.totals.ticketsReturned}</strong>
              <small>{money(report.totals.refunds)} đã hoàn</small>
            </div>
            <div className="stat">
              <span>Doanh thu trước hoàn</span>
              <strong>{money(report.totals.gross)}</strong>
              <small>Không bao gồm dịch vụ</small>
            </div>
          </div>
          <div className="panel report-panel">
            <div className="section-title">
              <div>
                <h2>Doanh thu theo {applied.groupBy === 'movie' ? 'phim' : 'rạp'}</h2>
                <p>Chọn một dòng để xem chi tiết suất chiếu</p>
              </div>
            </div>
            {report.rows.length ? (
              <div className="report-rows">
                {report.rows.map((r) => (
                  <button
                    type="button"
                    className={`report-row ${group?.id === r.id ? 'active' : ''}`}
                    disabled={busy}
                    key={r.id}
                    onClick={() => selectGroup(r.id, r.name)}
                  >
                    <span>
                      <strong>{r.name}</strong>
                      <small>
                        {r.ticketsSold} vé bán · {r.ticketsReturned} vé trả
                      </small>
                    </span>
                    <span className="bar">
                      <i style={{ width: `${(Math.abs(r.net) / max) * 100}%` }} />
                    </span>
                    <strong>{money(r.net)}</strong>
                    <span>→</span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty>Không có dữ liệu trong khoảng thời gian này.</Empty>
            )}
          </div>
          {group && (
            <div className="panel detail-panel">
              <div className="section-title">
                <div>
                  <h2>Suất chiếu · {group.name}</h2>
                  <p>Chọn suất chiếu để xem hóa đơn</p>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setGroup(null);
                    setShow(null);
                  }}
                >
                  Đóng chi tiết
                </button>
              </div>
              {shows.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>SUẤT CHIẾU</th>
                        <th>PHÒNG</th>
                        <th>VÉ BÁN / TRẢ</th>
                        <th>DOANH THU THUẦN</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shows.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <strong>{s.movieTitle}</strong>
                            <small>{dateTime(s.startsAt)}</small>
                          </td>
                          <td>{s.roomName}</td>
                          <td>
                            {s.ticketsSold} / {s.ticketsReturned}
                          </td>
                          <td>{money(s.net)}</td>
                          <td>
                            <button
                              className="text-button"
                              type="button"
                              disabled={busy}
                              onClick={() => selectShow(s)}
                            >
                              Xem hóa đơn →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>Không có suất chiếu trong kỳ.</Empty>
              )}
            </div>
          )}
          {show && (
            <div className="panel detail-panel">
              <div className="section-title">
                <div>
                  <h2>Hóa đơn · {show.movieTitle}</h2>
                  <p>
                    {dateTime(show.startsAt)} · {show.roomName}
                  </p>
                </div>
                <button className="text-button" type="button" onClick={() => setShow(null)}>
                  Đóng chi tiết
                </button>
              </div>
              {invoices.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>MÃ HÓA ĐƠN</th>
                        <th>THỜI GIAN</th>
                        <th>KHÁCH HÀNG</th>
                        <th>GHẾ</th>
                        <th>THUẦN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => loadInvoice(i.id)}
                            >
                              {i.id}
                            </button>
                          </td>
                          <td>{dateTime(i.createdAt)}</td>
                          <td>{i.customerName || 'Khách lẻ'}</td>
                          <td>{i.seats}</td>
                          <td>{money(i.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>Không có hóa đơn trong kỳ.</Empty>
              )}
            </div>
          )}
        </>
      )}
      {invoice && <Receipt invoice={invoice} close={() => setInvoice(null)} reload={loadInvoice} />}
    </>
  );
}
