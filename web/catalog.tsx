import { useState } from 'react';
import { Plus, Search, Pencil } from 'lucide-react';
import type { Bootstrap, Movie, MovieInput, Showtime, ShowtimeInput } from '../shared/contracts';
import { api, post, money, dateTime, Dialog, ErrorMessage, Empty, Field } from './common';

type Props = { data: Bootstrap; refresh: () => Promise<void> };
const blank: MovieInput = {
  title: '',
  genre: '',
  duration: 100,
  year: new Date().getFullYear(),
  director: '',
  cast: '',
  description: '',
  format: '2D',
  status: 'showing',
};
export function Movies({ data, refresh }: Props) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Movie | 'new' | null>(null);
  const [form, setForm] = useState<MovieInput>(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const movies = data.movies.filter((m) =>
    `${m.title} ${m.id} ${m.year}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')),
  );
  function open(movie?: Movie) {
    setForm(
      movie
        ? {
            title: movie.title,
            genre: movie.genre,
            duration: movie.duration,
            year: movie.year,
            director: movie.director,
            cast: movie.cast,
            description: movie.description,
            format: movie.format,
            status: movie.status,
          }
        : blank,
    );
    setEditing(movie || 'new');
    setError('');
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing === 'new') await post<Movie>('/movies', form);
      else if (editing)
        await api<Movie>(`/movies/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) });
      await refresh();
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THƯ VIỆN PHIM</div>
          <h1>Phim</h1>
          <p>Quản lý danh sách và thông tin phim tại rạp.</p>
        </div>
        {data.user.role === 'manager' && (
          <button className="primary" onClick={() => open()}>
            <Plus size={17} /> Thêm phim
          </button>
        )}
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            aria-label="Tìm phim"
            placeholder="Tìm theo tên, mã phim hoặc năm..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="muted">{movies.length} phim</span>
      </div>
      {movies.length ? (
        <div className="movie-grid">
          {movies.map((m) => (
            <article className="movie-card" key={m.id}>
              <div className="poster" style={{ background: m.color }}>
                <span className="poster-id">
                  {m.id} · {m.format}
                </span>
                <span className="poster-art">✳</span>
                <strong>{m.title}</strong>
                <small>{m.year} / CINEMA</small>
              </div>
              <div className="movie-info">
                <div className="movie-title">
                  <div>
                    <h2>{m.title}</h2>
                    <p>
                      {m.genre} · {m.duration} phút
                    </p>
                  </div>
                  {data.user.role === 'manager' && (
                    <button
                      className="icon-button"
                      aria-label={`Sửa ${m.title}`}
                      onClick={() => open(m)}
                    >
                      <Pencil size={17} />
                    </button>
                  )}
                </div>
                <div className="movie-meta">
                  <span>
                    {m.id} · {m.year}
                  </span>
                  <span className={`badge ${m.status === 'showing' ? 'green' : ''}`}>
                    {m.status === 'showing' ? 'Đang chiếu' : 'Sắp chiếu'}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty>Không tìm thấy phim phù hợp.</Empty>
      )}
      {editing && (
        <Dialog
          title={editing === 'new' ? 'Thêm phim' : `Chỉnh sửa phim · ${editing.id}`}
          close={() => setEditing(null)}
        >
          <form onSubmit={save} className="form-grid">
            <Field label="Tên phim">
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field label="Thể loại">
              <input
                required
                value={form.genre}
                onChange={(e) => setForm({ ...form, genre: e.target.value })}
              />
            </Field>
            <Field label="Thời lượng (phút)">
              <input
                type="number"
                min="1"
                required
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
              />
            </Field>
            <Field label="Năm phát hành">
              <input
                type="number"
                min="1888"
                required
                value={form.year}
                onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
              />
            </Field>
            <Field label="Đạo diễn">
              <input
                required
                value={form.director}
                onChange={(e) => setForm({ ...form, director: e.target.value })}
              />
            </Field>
            <Field label="Diễn viên">
              <input
                required
                value={form.cast}
                onChange={(e) => setForm({ ...form, cast: e.target.value })}
              />
            </Field>
            <Field label="Định dạng">
              <select
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value as '2D' | '3D' })}
              >
                <option>2D</option>
                <option>3D</option>
              </select>
            </Field>
            <Field label="Trạng thái">
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as MovieInput['status'] })
                }
              >
                <option value="showing">Đang chiếu</option>
                <option value="upcoming">Sắp chiếu</option>
              </select>
            </Field>
            <div className="full">
              <Field label="Mô tả">
                <textarea
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
            <div className="full">
              <ErrorMessage message={error} />
              <div className="actions">
                <button type="button" className="secondary" onClick={() => setEditing(null)}>
                  Hủy
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? 'Đang lưu...' : 'Lưu thông tin'}
                </button>
              </div>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function Schedule({ data, refresh }: Props) {
  const [day, setDay] = useState('');
  const [room, setRoom] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ShowtimeInput>({
    movieId: data.movies[0]?.id || '',
    roomId: data.rooms[0]?.id || '',
    startsAt: '',
    standardPrice: 80000,
    vipPrice: 100000,
  });
  const list = data.showtimes
    .filter(
      (s) =>
        (!day ||
          new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date(s.startsAt)) === day) &&
        (!room || s.roomId === room),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post<Showtime>('/showtimes', {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
      });
      await refresh();
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">VẬN HÀNH RẠP</div>
          <h1>Lịch chiếu</h1>
          <p>Theo dõi và sắp xếp các suất chiếu.</p>
        </div>
        {data.user.role === 'manager' && (
          <button
            className="primary"
            onClick={() => {
              setError('');
              setOpen(true);
            }}
          >
            <Plus size={17} /> Tạo suất chiếu
          </button>
        )}
      </div>
      <div className="toolbar">
        <div className="filters">
          <Field label="Ngày chiếu">
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="Phòng chiếu">
            <select value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">Tất cả phòng</option>
              {data.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <span className="muted">{list.length} suất chiếu</span>
      </div>
      <div className="panel">
        <div className="section-title">
          <div>
            <h2>Danh sách suất chiếu</h2>
            <p>Thông tin lịch chiếu theo thời gian</p>
          </div>
        </div>
        {list.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PHIM</th>
                  <th>PHÒNG</th>
                  <th>BẮT ĐẦU</th>
                  <th>KẾT THÚC</th>
                  <th>GIÁ STANDARD / VIP</th>
                  <th>ĐÃ BÁN</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>
                        {data.movies.find((m) => m.id === s.movieId)?.title || s.movieId}
                      </strong>
                      <small>{s.id}</small>
                    </td>
                    <td>{data.rooms.find((r) => r.id === s.roomId)?.name || s.roomId}</td>
                    <td>{dateTime(s.startsAt)}</td>
                    <td>{dateTime(s.endsAt)}</td>
                    <td>
                      {money(s.standardPrice)} / {money(s.vipPrice)}
                    </td>
                    <td>{s.soldSeats} ghế</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Không có suất chiếu phù hợp.</Empty>
        )}
      </div>
      {open && (
        <Dialog title="Tạo suất chiếu" close={() => setOpen(false)}>
          <form onSubmit={save} className="form-grid">
            <Field label="Phim">
              <select
                required
                value={form.movieId}
                onChange={(e) => setForm({ ...form, movieId: e.target.value })}
              >
                {data.movies.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} · {m.format}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Phòng chiếu">
              <select
                required
                value={form.roomId}
                onChange={(e) => setForm({ ...form, roomId: e.target.value })}
              >
                {data.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.format}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Thời gian bắt đầu">
              <input
                required
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </Field>
            <Field label="Giá Standard">
              <input
                required
                type="number"
                min="1"
                value={form.standardPrice}
                onChange={(e) => setForm({ ...form, standardPrice: Number(e.target.value) })}
              />
            </Field>
            <Field label="Giá VIP">
              <input
                required
                type="number"
                min="1"
                value={form.vipPrice}
                onChange={(e) => setForm({ ...form, vipPrice: Number(e.target.value) })}
              />
            </Field>
            <div className="full">
              <ErrorMessage message={error} />
              <div className="actions">
                <button type="button" className="secondary" onClick={() => setOpen(false)}>
                  Hủy
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? 'Đang lưu...' : 'Tạo suất chiếu'}
                </button>
              </div>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
