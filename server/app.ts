import express, { type NextFunction, type Request, type Response } from 'express';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import type { SQLInputValue, SQLOutputValue } from 'node:sqlite';
import type {
  User,
  Movie,
  Room,
  Showtime,
  Customer,
  Service,
  Ticket,
  Invoice,
} from '../shared/contracts.js';
import { z, ZodError } from 'zod';
import { openDatabase } from './db.js';

type AuthUser = User & { salt: string; password: string };
type ShowRow = Omit<Showtime, 'soldSeats'> & {
  cinemaId: string;
  capacity: number;
  format: Movie['format'];
};
type ReportEvent = {
  invoiceId: string;
  invoiceCreatedAt: string;
  customerName: string | null;
  seatId: string;
  showtimeId: string;
  movieId: string;
  startsAt: string;
  roomName: string;
  cinemaId: string;
  movieTitle: string;
  cinemaName: string;
  createdAt: string;
  amount: number;
  kind: 'sale' | 'refund';
};
type InvoiceRow = Omit<Invoice, 'tickets' | 'services'> & { cinemaId: string };
type ReturnTicket = Omit<Ticket, 'seatLabel'> & {
  customerId: string | null;
  startsAt: string;
  cinemaId: string;
};
type DatabaseRow = Record<string, SQLOutputValue>;
type ReportEntry = {
  id: string;
  name: string;
  ticketsSold: number;
  ticketsReturned: number;
  gross: number;
  refunds: number;
  net: number;
};
type InvoiceEntry = {
  id: string;
  createdAt: string;
  customerName: string | null;
  seats: string;
  ticketRevenue: number;
  refunds: number;
  net: number;
};
type Options = { dbPath: string; now?: () => Date; serveWeb?: boolean };
class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}
const text = z.string().trim().min(1).max(500);
const id = z.string().trim().min(1).max(100);
const movieSchema = z
  .object({
    title: text,
    genre: text,
    duration: z.number().int().min(1).max(600),
    year: z.number().int().min(1888).max(2100),
    director: text,
    cast: text,
    description: text,
    format: z.enum(['2D', '3D']),
    status: z.enum(['showing', 'upcoming']),
  })
  .strict();
const showtimeSchema = z
  .object({
    movieId: id,
    roomId: id,
    startsAt: z.string().datetime({ offset: true }),
    standardPrice: z.number().int().positive().max(100000000),
    vipPrice: z.number().int().positive().max(100000000),
  })
  .strict();
const saleSchema = z
  .object({
    showtimeId: id,
    seatIds: z.array(id).min(1).max(20),
    customerId: id.optional(),
    redeemSeatId: id.optional(),
    services: z
      .array(z.object({ serviceId: id, quantity: z.number().int().min(1).max(20) }).strict())
      .max(20),
    paymentMethod: z.enum(['cash', 'transfer']),
  })
  .strict();
const localDate = (date: Date) => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const makeId = (prefix: string) =>
  `${prefix}${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;

export async function createApp({ dbPath, now = () => new Date(), serveWeb = false }: Options) {
  const db = openDatabase(dbPath, now());
  const app = express();
  const get = <T = DatabaseRow>(sql: string, ...params: SQLInputValue[]) =>
    db.prepare(sql).get(...params) as T | undefined;
  const all = <T = DatabaseRow>(sql: string, ...params: SQLInputValue[]) =>
    db.prepare(sql).all(...params) as T[];
  const run = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params);
  const transaction = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const userFor = (req: Request): User | undefined => {
    const token = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('cinema_session='))
      ?.slice(15);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    return get<User>(
      'SELECT u.id,u.username,u.name,u.role,u.cinemaId FROM sessions s JOIN users u ON u.id=s.userId WHERE s.token=? AND s.expiresAt>?',
      token,
      now().toISOString(),
    );
  };
  const requireUser = (req: Request) =>
    userFor(req) ?? fail(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập.');
  const manager = (req: Request) => {
    const user = requireUser(req);
    if (user.role !== 'manager') fail(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện.');
    return user;
  };
  const scoped = (user: User, cinemaId: string) => {
    if (user.role !== 'manager' && user.cinemaId !== cinemaId)
      fail(403, 'FORBIDDEN', 'Bạn không có quyền truy cập rạp này.');
  };
  const scopeSql = (user: User) =>
    user.role === 'manager'
      ? { sql: '', params: [] }
      : { sql: ' AND r.cinemaId=?', params: [user.cinemaId] };
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.use((req, _res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
      const expected = `${req.protocol}://${req.get('host')}`;
      if (req.headers.origin !== expected)
        return next(new ApiError(403, 'ORIGIN_DENIED', 'Nguồn yêu cầu không hợp lệ.'));
    }
    next();
  });
  const attempts = new Map<string, number[]>();
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.post('/api/auth/login', (req, res) => {
    const body = z
      .object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) })
      .strict()
      .parse(req.body);
    const key = req.ip ?? 'unknown';
    const timestamp = now().getTime();
    const recent = (attempts.get(key) ?? []).filter((t) => t > timestamp - 15 * 60000);
    if (recent.length >= 10)
      fail(429, 'RATE_LIMITED', 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau.');
    recent.push(timestamp);
    attempts.set(key, recent);
    const user = get<AuthUser>('SELECT * FROM users WHERE username=?', body.username);
    const salt = user?.salt ?? '00000000000000000000000000000000';
    const actual = scryptSync(body.password, salt, 64);
    const expected = Buffer.from(user?.password ?? '00'.repeat(64), 'hex');
    if (!timingSafeEqual(actual, expected) || !user)
      fail(401, 'INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không đúng.');
    attempts.delete(key);
    const token = randomBytes(32).toString('hex');
    const expiry = new Date(timestamp + 12 * 3600000);
    run('DELETE FROM sessions WHERE expiresAt<=?', now().toISOString());
    run('INSERT INTO sessions VALUES (?, ?, ?)', token, user.id, expiry.toISOString());
    res.cookie('cinema_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      expires: expiry,
      path: '/',
    });
    res.json({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      cinemaId: user.cinemaId,
    });
  });
  app.post('/api/auth/logout', (req, res) => {
    requireUser(req);
    const token = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('cinema_session='))
      ?.slice(15);
    if (token) run('DELETE FROM sessions WHERE token=?', token);
    res.clearCookie('cinema_session', { path: '/' });
    res.json({ ok: true });
  });
  app.get('/api/auth/me', (req, res) => res.json(requireUser(req)));
  const showtimes = (user: User) => {
    const scope = scopeSql(user);
    return all<Showtime>(
      `SELECT s.*, (SELECT count(*) FROM tickets t WHERE t.showtimeId=s.id AND t.status='active') AS soldSeats FROM showtimes s JOIN rooms r ON r.id=s.roomId WHERE 1=1 ${scope.sql} ORDER BY s.startsAt`,
      ...scope.params,
    );
  };
  const baseRows = (user: User) => ({
    cinemas:
      user.role === 'manager'
        ? all('SELECT * FROM cinemas')
        : all('SELECT * FROM cinemas WHERE id=?', user.cinemaId),
    rooms:
      user.role === 'manager'
        ? all<Room>('SELECT * FROM rooms')
        : all<Room>('SELECT * FROM rooms WHERE cinemaId=?', user.cinemaId),
    movies: all('SELECT * FROM movies ORDER BY id'),
    showtimes: showtimes(user),
    customers: all('SELECT * FROM customers ORDER BY name'),
    services: all('SELECT * FROM services ORDER BY id'),
  });
  const reportEvents = (user: User, from: string, to: string): ReportEvent[] => {
    const scope = scopeSql(user);
    const start = new Date(`${from}T00:00:00+07:00`).toISOString();
    const end = new Date(Date.parse(`${to}T00:00:00+07:00`) + 86400000).toISOString();
    const sales = all<Omit<ReportEvent, 'kind'>>(
      `SELECT t.id ticketId,t.invoiceId,t.showtimeId,t.seatId,t.price-t.discount amount,i.createdAt,i.createdAt invoiceCreatedAt,cu.name customerName,s.movieId,s.startsAt,r.id roomId,r.name roomName,r.cinemaId,m.title movieTitle,c.name cinemaName FROM tickets t JOIN invoices i ON i.id=t.invoiceId LEFT JOIN customers cu ON cu.id=i.customerId JOIN showtimes s ON s.id=t.showtimeId JOIN rooms r ON r.id=s.roomId JOIN movies m ON m.id=s.movieId JOIN cinemas c ON c.id=r.cinemaId WHERE i.createdAt>=? AND i.createdAt<? ${scope.sql}`,
      start,
      end,
      ...scope.params,
    ).map((e) => ({ ...e, kind: 'sale' as const }));
    const refunds = all<Omit<ReportEvent, 'kind'>>(
      `SELECT t.id ticketId,t.invoiceId,t.showtimeId,t.seatId,f.amount,f.createdAt,i.createdAt invoiceCreatedAt,cu.name customerName,s.movieId,s.startsAt,r.id roomId,r.name roomName,r.cinemaId,m.title movieTitle,c.name cinemaName FROM refunds f JOIN tickets t ON t.id=f.ticketId JOIN invoices i ON i.id=t.invoiceId LEFT JOIN customers cu ON cu.id=i.customerId JOIN showtimes s ON s.id=t.showtimeId JOIN rooms r ON r.id=s.roomId JOIN movies m ON m.id=s.movieId JOIN cinemas c ON c.id=r.cinemaId WHERE f.createdAt>=? AND f.createdAt<? ${scope.sql}`,
      start,
      end,
      ...scope.params,
    ).map((e) => ({ ...e, kind: 'refund' as const }));
    return [...sales, ...refunds];
  };
  const filter = (req: Request) => {
    const parsed = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        groupBy: z.enum(['movie', 'cinema']).default('movie'),
      })
      .passthrough()
      .parse(req.query);
    for (const d of [parsed.from, parsed.to])
      if (
        Number.isNaN(Date.parse(`${d}T00:00:00Z`)) ||
        new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d
      )
        fail(400, 'INVALID_DATE', 'Ngày không hợp lệ.');
    if (parsed.from > parsed.to)
      fail(400, 'INVALID_DATE', 'Ngày bắt đầu phải trước ngày kết thúc.');
    return parsed;
  };
  const empty = () => ({ ticketsSold: 0, ticketsReturned: 0, gross: 0, refunds: 0, net: 0 });
  const add = (row: ReturnType<typeof empty>, event: ReportEvent) => {
    if (event.kind === 'sale') {
      row.ticketsSold++;
      row.gross += event.amount;
    } else {
      row.ticketsReturned++;
      row.refunds += event.amount;
    }
    row.net = row.gross - row.refunds;
  };
  const aggregate = (
    events: ReportEvent[],
    key: (e: ReportEvent) => string,
    name: (e: ReportEvent) => string,
  ) => {
    const rows = new Map<string, ReportEntry>();
    for (const e of events) {
      const k = key(e);
      if (!rows.has(k)) rows.set(k, { id: k, name: name(e), ...empty() });
      add(rows.get(k) as ReturnType<typeof empty>, e);
    }
    return [...rows.values()].sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
  };
  const report = (user: User, from: string, to: string, groupBy: string) => {
    const events = reportEvents(user, from, to);
    const rows = aggregate(
      events,
      (e) => (groupBy === 'movie' ? e.movieId : e.cinemaId),
      (e) => (groupBy === 'movie' ? e.movieTitle : e.cinemaName),
    );
    const totals = empty();
    const daily = new Map<string, number>();
    for (const e of events) {
      add(totals, e);
      const d = localDate(new Date(e.createdAt));
      daily.set(d, (daily.get(d) ?? 0) + (e.kind === 'sale' ? e.amount : -e.amount));
    }
    return {
      rows,
      totals,
      daily: [...daily]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, net]) => ({ date, net })),
    };
  };
  app.get('/api/bootstrap', (req, res) => {
    const user = requireUser(req);
    const today = localDate(now());
    const from = localDate(new Date(now().getTime() - 6 * 86400000));
    const summary = report(user, from, today, 'movie');
    const scope = scopeSql(user);
    const base = baseRows(user);
    const shows = base.showtimes;
    const recentInvoices = all(
      `SELECT i.id,m.title movieTitle,i.total,i.createdAt,(SELECT group_concat(seatId, ', ') FROM tickets t WHERE t.invoiceId=i.id) seats FROM invoices i JOIN showtimes s ON s.id=i.showtimeId JOIN rooms r ON r.id=s.roomId JOIN movies m ON m.id=s.movieId WHERE 1=1 ${scope.sql} ORDER BY i.createdAt DESC LIMIT 5`,
      ...scope.params,
    );
    const roomCapacities = new Map(base.rooms.map((room) => [room.id, room.capacity]));
    const capacity = shows.reduce((sum, s) => sum + (roomCapacities.get(s.roomId) ?? 0), 0);
    res.json({
      user,
      ...base,
      dashboard: {
        revenue: summary.totals.net,
        ticketsSold: summary.totals.ticketsSold,
        occupancy: capacity
          ? Math.round((shows.reduce((sum, s) => sum + s.soldSeats, 0) * 100) / capacity)
          : 0,
        showtimeCount: shows.length,
        daily: summary.daily,
        recentInvoices,
      },
      today,
    });
  });
  app.get('/api/movies', (req, res) => {
    requireUser(req);
    const q = z.string().max(200).optional().parse(req.query.q);
    const movies = all<Movie>('SELECT * FROM movies ORDER BY id');
    res.json(
      q
        ? movies.filter((m) =>
            `${m.title} ${m.id}`.toLocaleLowerCase('vi').includes(q.toLocaleLowerCase('vi')),
          )
        : movies,
    );
  });
  app.post('/api/movies', (req, res) => {
    manager(req);
    const m = movieSchema.parse(req.body);
    const movieId = makeId('P');
    run(
      'INSERT INTO movies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      movieId,
      m.title,
      m.genre,
      m.duration,
      m.year,
      m.director,
      m.cast,
      m.description,
      m.format,
      m.status,
      '#8e91b5',
    );
    res.status(201).json(get('SELECT * FROM movies WHERE id=?', movieId));
  });
  app.put('/api/movies/:id', (req, res) => {
    manager(req);
    const m = movieSchema.parse(req.body);
    const old = get('SELECT * FROM movies WHERE id=?', req.params.id);
    if (!old) fail(404, 'NOT_FOUND', 'Không tìm thấy phim.');
    transaction(() => {
      const future = all<Showtime>(
        'SELECT * FROM showtimes WHERE movieId=? AND startsAt>?',
        req.params.id,
        now().toISOString(),
      );
      for (const s of future) {
        const room = get<Room>('SELECT * FROM rooms WHERE id=?', s.roomId);
        if (room?.format !== m.format)
          fail(409, 'FORMAT_CONFLICT', 'Định dạng không phù hợp với lịch chiếu.');
        const end = new Date(Date.parse(s.startsAt) + m.duration * 60000).toISOString();
        if (
          get(
            'SELECT id FROM showtimes WHERE roomId=? AND id<>? AND startsAt<? AND endsAt>?',
            s.roomId,
            s.id,
            end,
            s.startsAt,
          )
        )
          fail(409, 'SCHEDULE_CONFLICT', 'Thời lượng gây chồng lịch chiếu.');
        run('UPDATE showtimes SET endsAt=? WHERE id=?', end, s.id);
      }
      run(
        'UPDATE movies SET title=?,genre=?,duration=?,year=?,director=?,cast=?,description=?,format=?,status=? WHERE id=?',
        m.title,
        m.genre,
        m.duration,
        m.year,
        m.director,
        m.cast,
        m.description,
        m.format,
        m.status,
        req.params.id,
      );
    });
    res.json(get('SELECT * FROM movies WHERE id=?', req.params.id));
  });
  app.post('/api/showtimes', (req, res) => {
    manager(req);
    const input = showtimeSchema.parse(req.body);
    const movie = get<Movie>('SELECT * FROM movies WHERE id=?', input.movieId);
    const room = get<Room>('SELECT * FROM rooms WHERE id=?', input.roomId);
    if (!movie || !room) fail(404, 'NOT_FOUND', 'Không tìm thấy phim hoặc phòng.');
    if (movie.format !== room.format)
      fail(400, 'FORMAT_MISMATCH', 'Định dạng phim và phòng không phù hợp.');
    const startsAt = new Date(input.startsAt).toISOString();
    if (startsAt <= now().toISOString()) fail(400, 'INVALID_TIME', 'Suất chiếu phải ở tương lai.');
    const endsAt = new Date(Date.parse(startsAt) + movie.duration * 60000).toISOString();
    const showtimeId = makeId('SC');
    transaction(() => {
      if (
        get(
          'SELECT id FROM showtimes WHERE roomId=? AND startsAt<? AND endsAt>?',
          input.roomId,
          endsAt,
          startsAt,
        )
      )
        fail(409, 'SCHEDULE_CONFLICT', 'Phòng đã có suất chiếu trong khoảng này.');
      run(
        'INSERT INTO showtimes VALUES (?, ?, ?, ?, ?, ?, ?)',
        showtimeId,
        input.movieId,
        input.roomId,
        startsAt,
        endsAt,
        input.standardPrice,
        input.vipPrice,
      );
    });
    res.status(201).json({ id: showtimeId, ...input, startsAt, endsAt, soldSeats: 0 });
  });
  const show = (showtimeId: string, user: User) => {
    const s = get<ShowRow>(
      'SELECT s.*,r.cinemaId,r.capacity,m.format FROM showtimes s JOIN rooms r ON r.id=s.roomId JOIN movies m ON m.id=s.movieId WHERE s.id=?',
      showtimeId,
    );
    if (!s) fail(404, 'NOT_FOUND', 'Không tìm thấy suất chiếu.');
    scoped(user, s.cinemaId);
    return s;
  };
  const seats = (s: ShowRow) => {
    const sold = new Set(
      all<Pick<Ticket, 'seatId'>>(
        "SELECT seatId FROM tickets WHERE showtimeId=? AND status='active'",
        s.id,
      ).map((t) => t.seatId),
    );
    return Array.from({ length: s.capacity }, (_, i) => {
      const row = String.fromCharCode(65 + Math.floor(i / 10));
      const number = (i % 10) + 1;
      const seatId = `${row}${String(number).padStart(2, '0')}`;
      const type = (row === 'F' && number <= 5) || row < 'F' ? 'Standard' : 'VIP';
      return {
        id: seatId,
        row,
        number,
        type,
        sold: sold.has(seatId),
        price: type === 'Standard' ? s.standardPrice : s.vipPrice,
      };
    });
  };
  app.get('/api/showtimes/:id/seats', (req, res) =>
    res.json(seats(show(req.params.id, requireUser(req)))),
  );
  app.get('/api/customers', (req, res) => {
    requireUser(req);
    const phone = z
      .string()
      .regex(/^\d{10,11}$/)
      .optional()
      .parse(req.query.phone);
    res.json(
      phone
        ? all('SELECT * FROM customers WHERE phone=?', phone)
        : all('SELECT * FROM customers ORDER BY name'),
    );
  });
  app.post('/api/customers', (req, res) => {
    requireUser(req);
    const input = z
      .object({ name: text, phone: z.string().regex(/^\d{10,11}$/) })
      .strict()
      .parse(req.body);
    if (get('SELECT id FROM customers WHERE phone=?', input.phone))
      fail(409, 'PHONE_EXISTS', 'Số điện thoại đã được đăng ký.');
    const customer = { id: makeId('KH'), ...input, points: 0 };
    run('INSERT INTO customers VALUES (?, ?, ?, ?)', customer.id, customer.name, customer.phone, 0);
    res.status(201).json(customer);
  });
  const invoice = (invoiceId: string, user: User) => {
    const row = get<InvoiceRow>(
      `SELECT i.*,m.title movieTitle,c.name cinemaName,r.name roomName,r.cinemaId,s.startsAt,cu.name customerName,u.name staffName FROM invoices i JOIN showtimes s ON s.id=i.showtimeId JOIN rooms r ON r.id=s.roomId JOIN cinemas c ON c.id=r.cinemaId JOIN movies m ON m.id=s.movieId LEFT JOIN customers cu ON cu.id=i.customerId JOIN users u ON u.id=i.staffId WHERE i.id=?`,
      invoiceId,
    );
    if (!row) fail(404, 'NOT_FOUND', 'Không tìm thấy hóa đơn.');
    scoped(user, row.cinemaId);
    const tickets = all(
      'SELECT id,seatId,seatId seatLabel,type,price,discount,pointsEarned,pointsUsed,status FROM tickets WHERE invoiceId=? ORDER BY seatId',
      invoiceId,
    );
    const services = all(
      'SELECT name,quantity,unitPrice,total FROM invoice_services WHERE invoiceId=?',
      invoiceId,
    );
    return {
      id: row.id,
      createdAt: row.createdAt,
      movieTitle: row.movieTitle,
      cinemaName: row.cinemaName,
      roomName: row.roomName,
      startsAt: row.startsAt,
      customerName: row.customerName,
      staffName: row.staffName,
      paymentMethod: row.paymentMethod,
      subtotal: row.subtotal,
      discount: row.discount,
      total: row.total,
      pointsEarned: row.pointsEarned,
      pointsUsed: row.pointsUsed,
      pointsBalance: row.pointsBalance,
      tickets,
      services,
    };
  };
  app.post('/api/sales', (req, res) => {
    const user = requireUser(req);
    const input = saleSchema.parse(req.body);
    if (
      new Set(input.seatIds).size !== input.seatIds.length ||
      new Set(input.services.map((s) => s.serviceId)).size !== input.services.length
    )
      fail(400, 'DUPLICATE_ITEM', 'Mục trùng lặp.');
    const invoiceId = transaction(() => {
      const s = show(input.showtimeId, user);
      if (s.startsAt <= now().toISOString())
        fail(409, 'SHOWTIME_STARTED', 'Suất chiếu đã bắt đầu.');
      const available = seats(s);
      const chosen = input.seatIds.map(
        (seatId) =>
          available.find((seat) => seat.id === seatId) ??
          fail(400, 'INVALID_SEAT', 'Ghế không hợp lệ.'),
      );
      if (chosen.some((seat) => seat.sold)) fail(409, 'SEAT_SOLD', 'Ghế đã được bán.');
      const customer = input.customerId
        ? get<Customer>('SELECT * FROM customers WHERE id=?', input.customerId)
        : undefined;
      if (input.customerId && !customer) fail(404, 'NOT_FOUND', 'Không tìm thấy thành viên.');
      if (input.redeemSeatId) {
        const redeem = chosen.find((seat) => seat.id === input.redeemSeatId);
        if (
          !customer ||
          !redeem ||
          redeem.type !== 'Standard' ||
          s.format !== '2D' ||
          customer.points < 500
        )
          fail(400, 'INVALID_REDEMPTION', 'Cần 500 điểm để đổi một vé 2D Standard.');
      }
      const serviceLines = input.services.map((line) => {
        const service = get<Service>('SELECT * FROM services WHERE id=?', line.serviceId);
        if (!service) fail(404, 'NOT_FOUND', 'Không tìm thấy dịch vụ.');
        return {
          name: service.name,
          quantity: line.quantity,
          unitPrice: service.price,
          total: service.price * line.quantity,
        };
      });
      const subtotal =
        chosen.reduce((sum, seat) => sum + seat.price, 0) +
        serviceLines.reduce((sum, line) => sum + line.total, 0);
      const discount = chosen.find((seat) => seat.id === input.redeemSeatId)?.price ?? 0;
      const pointsUsed = input.redeemSeatId ? 500 : 0;
      const earnedTickets = chosen.map((seat) =>
        customer && seat.id !== input.redeemSeatId ? Math.floor(seat.price / 10000) : 0,
      );
      const earnedServices = customer
        ? serviceLines.reduce((sum, line) => sum + Math.floor(line.total / 10000), 0)
        : 0;
      const pointsEarned = earnedTickets.reduce((a, b) => a + b, 0) + earnedServices;
      const balance = customer ? customer.points - pointsUsed + pointsEarned : null;
      const newId = makeId('HD');
      run(
        'INSERT INTO invoices VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        newId,
        s.id,
        customer?.id ?? null,
        user.id,
        now().toISOString(),
        input.paymentMethod,
        subtotal,
        discount,
        subtotal - discount,
        pointsEarned,
        pointsUsed,
        balance,
      );
      chosen.forEach((seat, index) =>
        run(
          'INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          makeId('VT'),
          newId,
          s.id,
          seat.id,
          seat.type,
          seat.price,
          seat.id === input.redeemSeatId ? seat.price : 0,
          earnedTickets[index],
          seat.id === input.redeemSeatId ? 500 : 0,
          'active',
        ),
      );
      for (const line of serviceLines)
        run(
          'INSERT INTO invoice_services VALUES (?, ?, ?, ?, ?)',
          newId,
          line.name,
          line.quantity,
          line.unitPrice,
          line.total,
        );
      if (customer) run('UPDATE customers SET points=? WHERE id=?', balance, customer.id);
      return newId;
    });
    res.status(201).json(invoice(invoiceId, user));
  });
  app.get('/api/invoices/:id', (req, res) => res.json(invoice(req.params.id, requireUser(req))));
  app.post('/api/tickets/:id/return', (req, res) => {
    const user = requireUser(req);
    const result = transaction(() => {
      const ticket = get<ReturnTicket>(
        `SELECT t.*,i.customerId,s.startsAt,r.cinemaId FROM tickets t JOIN invoices i ON i.id=t.invoiceId JOIN showtimes s ON s.id=t.showtimeId JOIN rooms r ON r.id=s.roomId WHERE t.id=?`,
        req.params.id,
      );
      if (!ticket) fail(404, 'NOT_FOUND', 'Không tìm thấy vé.');
      scoped(user, ticket.cinemaId);
      if (ticket.status !== 'active') fail(409, 'ALREADY_RETURNED', 'Vé đã được trả.');
      const hours = (Date.parse(ticket.startsAt) - now().getTime()) / 3600000;
      const rate = hours >= 48 ? 1 : hours >= 24 ? 0.8 : hours >= 12 ? 0.6 : hours >= 6 ? 0.4 : 0;
      if (!rate) fail(409, 'RETURN_TOO_LATE', 'Chỉ được trả vé trước giờ chiếu ít nhất 6 giờ.');
      const customer = ticket.customerId
        ? get<Customer>('SELECT * FROM customers WHERE id=?', ticket.customerId)
        : undefined;
      if (customer && customer.points < ticket.pointsEarned)
        fail(409, 'INSUFFICIENT_POINTS', 'Số điểm còn lại không đủ để thu hồi điểm đã cộng.');
      const refund = Math.floor((ticket.price - ticket.discount) * rate);
      run('UPDATE tickets SET status=? WHERE id=?', 'returned', ticket.id);
      run(
        'INSERT INTO refunds VALUES (?, ?, ?, ?, ?)',
        makeId('HT'),
        ticket.id,
        now().toISOString(),
        refund,
        ticket.pointsEarned,
      );
      if (customer)
        run('UPDATE customers SET points=points-? WHERE id=?', ticket.pointsEarned, customer.id);
      return { refund, pointsDeducted: ticket.pointsEarned };
    });
    res.json(result);
  });
  app.get('/api/reports', (req, res) => {
    const user = requireUser(req);
    const f = filter(req);
    res.json(report(user, f.from, f.to, f.groupBy));
  });
  app.get('/api/reports/showtimes', (req, res) => {
    const user = requireUser(req);
    const f = filter(req);
    const groupId = id.parse(req.query.groupId);
    const events = reportEvents(user, f.from, f.to).filter(
      (e) => (f.groupBy === 'movie' ? e.movieId : e.cinemaId) === groupId,
    );
    const rows = new Map<
      string,
      ReportEntry & { movieTitle: string; roomName: string; startsAt: string }
    >();
    for (const event of events) {
      if (!rows.has(event.showtimeId)) {
        rows.set(event.showtimeId, {
          id: event.showtimeId,
          name: event.roomName,
          movieTitle: event.movieTitle,
          roomName: event.roomName,
          startsAt: event.startsAt,
          ...empty(),
        });
      }
      add(rows.get(event.showtimeId)!, event);
    }
    res.json(
      [...rows.values()].sort(
        (a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id),
      ),
    );
  });
  app.get('/api/reports/invoices', (req, res) => {
    const user = requireUser(req);
    const f = filter(req);
    const showtimeId = id.parse(req.query.showtimeId);
    show(showtimeId, user);
    const events = reportEvents(user, f.from, f.to).filter((e) => e.showtimeId === showtimeId);
    const rows = new Map<string, InvoiceEntry>();
    for (const event of events) {
      if (!rows.has(event.invoiceId)) {
        rows.set(event.invoiceId, {
          id: event.invoiceId,
          createdAt: event.invoiceCreatedAt,
          customerName: event.customerName,
          seats: '',
          ticketRevenue: 0,
          refunds: 0,
          net: 0,
        });
      }
      const row = rows.get(event.invoiceId)!;
      if (event.kind === 'sale') row.ticketRevenue += event.amount;
      else row.refunds += event.amount;
      row.net = row.ticketRevenue - row.refunds;
    }
    if (rows.size) {
      const seats = all<{ invoiceId: string; seatId: string }>(
        'SELECT t.invoiceId,t.seatId FROM invoices i JOIN tickets t ON t.invoiceId=i.id WHERE i.showtimeId=? ORDER BY t.seatId',
        showtimeId,
      );
      const seatsByInvoice = new Map<string, string[]>();
      for (const seat of seats) {
        if (!rows.has(seat.invoiceId)) continue;
        const labels = seatsByInvoice.get(seat.invoiceId) ?? [];
        labels.push(seat.seatId);
        seatsByInvoice.set(seat.invoiceId, labels);
      }
      for (const [invoiceId, labels] of seatsByInvoice)
        rows.get(invoiceId)!.seats = labels.join(', ');
    }
    res.json([...rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });
  app.use('/api', (_req, _res, next) =>
    next(new ApiError(404, 'NOT_FOUND', 'Không tìm thấy đường dẫn.')),
  );
  let closeWeb: (() => Promise<void>) | undefined;
  if (serveWeb) {
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(resolve('dist/web')));
      app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/web/index.html')));
    } else {
      const { createServer } = await import('vite');
      const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
      closeWeb = () => vite.close();
    }
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    if (error instanceof ZodError)
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ.', code: 'VALIDATION_ERROR' });
    if (error instanceof ApiError)
      return res.status(error.status).json({ error: error.message, code: error.code });
    if (error instanceof SyntaxError)
      return res.status(400).json({ error: 'JSON không hợp lệ.', code: 'VALIDATION_ERROR' });
    console.error(error);
    return res.status(500).json({ error: 'Lỗi máy chủ.', code: 'INTERNAL_ERROR' });
  });
  return {
    app,
    close: async () => {
      await closeWeb?.();
      db.close();
    },
  };
}
