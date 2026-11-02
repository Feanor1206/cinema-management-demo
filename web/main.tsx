import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard,
  Clapperboard,
  CalendarDays,
  Ticket,
  ChartNoAxesCombined,
  LogOut,
  ArrowUpRight,
  Film,
  CircleDollarSign,
  Armchair,
  CalendarClock,
} from 'lucide-react';
import type { Bootstrap, User } from '../shared/contracts';
import { api, post, money, dateTime, ErrorMessage, Empty } from './common';
import { Movies, Schedule } from './catalog';
import { Sales } from './sales';
import { Reports } from './reports';
import './style.css';

type Page = 'Tổng quan' | 'Phim' | 'Lịch chiếu' | 'Bán vé' | 'Doanh thu';
const nav = [
  { name: 'Tổng quan', icon: LayoutDashboard },
  { name: 'Phim', icon: Clapperboard },
  { name: 'Lịch chiếu', icon: CalendarDays },
  { name: 'Bán vé', icon: Ticket },
  { name: 'Doanh thu', icon: ChartNoAxesCombined },
] as const;
function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post<User>('/auth/login', { username, password });
      await onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <div className="login-art">
        <div className="brand light">
          <span className="brand-mark">✳</span>
          <span>
            Cinema<small>QUẢN LÝ RẠP PHIM</small>
          </span>
        </div>
        <div className="art-copy">
          <span className="eyebrow">MỖI SUẤT CHIẾU, MỘT TRẢI NGHIỆM</span>
          <h1>
            Chào mừng trở lại
            <br />
            với Cinema.
          </h1>
          <p>Mọi hoạt động của rạp phim, gói gọn trong một nơi.</p>
        </div>
        <div className="art-decoration">
          C<span>✳</span>
        </div>
        <div className="art-footer">
          CINEMA MANAGEMENT <span>01 / 04</span>
        </div>
      </div>
      <div className="login-side">
        <form className="login-form" onSubmit={submit}>
          <div className="brand mobile-brand">
            <span className="brand-mark">✳</span>
            <span>Cinema</span>
          </div>
          <div className="eyebrow">CINEMA WORKSPACE</div>
          <h1>Đăng nhập</h1>
          <p>Nhập thông tin tài khoản để tiếp tục.</p>
          <label className="field">
            <span>Tên đăng nhập</span>
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập"
            />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
            />
          </label>
          <ErrorMessage message={error} />
          <button className="primary wide" disabled={busy}>
            {busy ? 'Đang đăng nhập...' : 'Đăng nhập'} <span>→</span>
          </button>
          <div className="demo-box">
            <strong>Tài khoản dùng thử</strong>
            <p>Chọn vai trò để điền nhanh thông tin đăng nhập.</p>
            <div>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setUsername('manager');
                  setPassword('Cinema123!');
                }}
              >
                Quản lý
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setUsername('cashier');
                  setPassword('Cinema123!');
                }}
              >
                Thu ngân
              </button>
            </div>
          </div>
          <small className="login-foot">© Cinema · Hệ thống quản lý rạp phim</small>
        </form>
      </div>
    </main>
  );
}
function Dashboard({ data, navigate }: { data: Bootstrap; navigate: (page: Page) => void }) {
  const d = data.dashboard;
  const max = Math.max(1, ...d.daily.map((v) => Math.abs(v.net)));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TỔNG QUAN HOẠT ĐỘNG</div>
          <h1>
            Xin chào, {data.user.name} <span className="wave">✳</span>
          </h1>
          <p>Doanh thu trong 7 ngày gần đây và tình hình lịch chiếu.</p>
        </div>
        <button className="secondary" onClick={() => navigate('Doanh thu')}>
          Xem báo cáo <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="stats dashboard-stats">
        <div className="stat">
          <span>
            <CircleDollarSign size={17} /> Doanh thu
          </span>
          <strong>{money(d.revenue)}</strong>
          <small>Doanh thu vé thuần · 7 ngày qua</small>
        </div>
        <div className="stat">
          <span>
            <Ticket size={17} /> Vé đã bán
          </span>
          <strong>{d.ticketsSold}</strong>
          <small>Vé bán trong 7 ngày qua</small>
        </div>
        <div className="stat">
          <span>
            <Armchair size={17} /> Tỷ lệ lấp đầy
          </span>
          <strong>{d.occupancy}%</strong>
          <small>Trên các suất đã lập</small>
        </div>
        <div className="stat">
          <span>
            <CalendarClock size={17} /> Suất chiếu
          </span>
          <strong>{d.showtimeCount}</strong>
          <small>Trong danh sách lịch</small>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="panel chart-panel">
          <div className="section-title">
            <div>
              <h2>Doanh thu vé</h2>
              <p>Thu ròng màu tím · hoàn ròng màu đỏ</p>
            </div>
            <span className="subtle-pill">Gần đây</span>
          </div>
          {d.daily.length ? (
            <div className="chart">
              {d.daily.map((item) => (
                <div
                  className="chart-col"
                  key={item.date}
                  aria-label={`${item.date}: ${money(item.net)}`}
                >
                  <div className="chart-bar">
                    <i
                      className={item.net < 0 ? 'negative' : ''}
                      style={{
                        height: `${(Math.abs(item.net) / max) * 45}%`,
                        bottom: item.net >= 0 ? '50%' : undefined,
                        top: item.net < 0 ? '50%' : undefined,
                      }}
                      title={money(item.net)}
                    />
                  </div>
                  <small>{item.date.slice(5).split('-').reverse().join('/')}</small>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Chưa có dữ liệu doanh thu.</Empty>
          )}
        </div>
        <div className="panel quick-panel">
          <div className="section-title">
            <div>
              <h2>Thao tác nhanh</h2>
              <p>Bắt đầu công việc của bạn</p>
            </div>
          </div>
          <button onClick={() => navigate('Bán vé')}>
            <span className="quick-icon">
              <Ticket size={19} />
            </span>
            <span>
              <strong>Bán vé</strong>
              <small>Tạo giao dịch mới</small>
            </span>
            <ArrowUpRight size={17} />
          </button>
          <button onClick={() => navigate('Lịch chiếu')}>
            <span className="quick-icon peach">
              <CalendarDays size={19} />
            </span>
            <span>
              <strong>Lịch chiếu</strong>
              <small>Xem các suất chiếu</small>
            </span>
            <ArrowUpRight size={17} />
          </button>
          <button onClick={() => navigate('Phim')}>
            <span className="quick-icon blue">
              <Film size={19} />
            </span>
            <span>
              <strong>Danh sách phim</strong>
              <small>Khám phá thư viện phim</small>
            </span>
            <ArrowUpRight size={17} />
          </button>
        </div>
      </div>
      <div className="panel recent">
        <div className="section-title">
          <div>
            <h2>Giao dịch gần đây</h2>
            <p>Các hóa đơn mới nhất tại rạp</p>
          </div>
          <button className="text-button" onClick={() => navigate('Bán vé')}>
            Đến quầy vé →
          </button>
        </div>
        {d.recentInvoices.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>MÃ HÓA ĐƠN</th>
                  <th>PHIM</th>
                  <th>GHẾ</th>
                  <th>THỜI GIAN</th>
                  <th>THÀNH TIỀN</th>
                </tr>
              </thead>
              <tbody>
                {d.recentInvoices.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.id}</strong>
                    </td>
                    <td>{i.movieTitle}</td>
                    <td>{i.seats}</td>
                    <td>{dateTime(i.createdAt)}</td>
                    <td>{money(i.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Chưa có giao dịch gần đây.</Empty>
        )}
      </div>
    </>
  );
}
function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState<Page>('Tổng quan');
  async function refresh() {
    setData(await api<Bootstrap>('/bootstrap'));
  }
  useEffect(() => {
    api<Bootstrap>('/bootstrap')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);
  async function logout() {
    try {
      await post('/auth/logout');
      setData(null);
      setPage('Tổng quan');
    } catch (err) {
      setError((err as Error).message);
    }
  }
  if (loading)
    return (
      <div className="loading" role="status">
        Đang tải Cinema...
      </div>
    );
  if (!data) return <Login onLogin={refresh} />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✳</span>
          <span>
            Cinema<small>QUẢN LÝ RẠP PHIM</small>
          </span>
        </div>
        <div className="nav-label">KHÔNG GIAN LÀM VIỆC</div>
        <nav aria-label="Điều hướng chính">
          {nav.map((item) => (
            <button
              key={item.name}
              className={page === item.name ? 'active' : ''}
              onClick={() => setPage(item.name)}
            >
              <item.icon size={19} />
              <span>{item.name}</span>
              {page === item.name && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-note">
            <span>✳</span>
            <strong>Cinema Workspace</strong>
            <small>Quản lý mọi khoảnh khắc trên màn ảnh.</small>
          </div>
          <button className="logout" onClick={logout}>
            <LogOut size={18} /> Đăng xuất
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span className="breadcrumb">
            Không gian làm việc <span>/</span> <strong>{page}</strong>
          </span>
          <div className="top-user">
            <button
              type="button"
              className="mobile-logout icon-button"
              aria-label="Đăng xuất"
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
            <span className="cinema-name">
              {data.cinemas.find((c) => c.id === data.user.cinemaId)?.name || 'Cinema'}
            </span>
            <span className="avatar">{data.user.name.slice(0, 1)}</span>
            <span className="user-name">
              <strong>{data.user.name}</strong>
              <small>{data.user.role === 'manager' ? 'Quản lý' : 'Thu ngân'}</small>
            </span>
          </div>
        </header>
        <main className="content">
          <ErrorMessage message={error} />
          {page === 'Tổng quan' && <Dashboard data={data} navigate={setPage} />}{' '}
          {page === 'Phim' && <Movies data={data} refresh={refresh} />}{' '}
          {page === 'Lịch chiếu' && <Schedule data={data} refresh={refresh} />}{' '}
          {page === 'Bán vé' && <Sales data={data} refresh={refresh} />}{' '}
          {page === 'Doanh thu' && <Reports data={data} />}
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
