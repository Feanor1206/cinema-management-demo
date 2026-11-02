import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type {
  Bootstrap,
  Movie,
  MovieInput,
  Seat,
  Invoice,
  Report,
  ReportShowtime,
  ReportInvoice,
} from '../shared/contracts.js';
import { createApp } from '../server/app.js';

const fixed = new Date('2026-11-02T03:00:00.000Z');

function movieInput(movie: Movie): MovieInput {
  return {
    title: movie.title,
    genre: movie.genre,
    duration: movie.duration,
    year: movie.year,
    director: movie.director,
    cast: movie.cast,
    description: movie.description,
    format: movie.format,
    status: movie.status,
  };
}

type Reply<T> = { status: number; body: T; cookie: string };

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'cinema-test-'));
  let current = fixed;
  let instance = await createApp({
    dbPath: join(dir, 'test.sqlite'),
    now: () => current,
    serveWeb: false,
  });
  let server: Server = await new Promise((resolve) => {
    const listener = instance.app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  let base = `http://127.0.0.1:${address.port}`;
  async function request<T>(
    path: string,
    options: { method?: string; body?: unknown; cookie?: string; origin?: string } = {},
  ): Promise<Reply<T>> {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.cookie) headers.cookie = options.cookie;
    if (options.origin) headers.origin = options.origin;
    const response = await fetch(base + path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return {
      status: response.status,
      body: (await response.json()) as T,
      cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '',
    };
  }
  async function login(username = 'manager') {
    const result = await request('/api/auth/login', {
      method: 'POST',
      body: { username, password: 'Cinema123!' },
    });
    assert.equal(result.status, 200);
    assert.ok(result.cookie);
    return result.cookie;
  }
  async function bootstrap(cookie: string) {
    const result = await request<Bootstrap>('/api/bootstrap', { cookie });
    assert.equal(result.status, 200);
    return result.body;
  }
  async function restart() {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await instance.close();
    instance = await createApp({
      dbPath: join(dir, 'test.sqlite'),
      now: () => current,
      serveWeb: false,
    });
    server = await new Promise((resolve) => {
      const listener = instance.app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const reopenedAddress = server.address();
    assert.ok(reopenedAddress && typeof reopenedAddress !== 'string');
    base = `http://127.0.0.1:${reopenedAddress.port}`;
  }
  async function close() {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await instance.close();
    await rm(dir, { recursive: true, force: true });
  }
  return {
    request,
    login,
    bootstrap,
    close,
    restart,
    setNow: (date: Date) => {
      current = date;
    },
  };
}

test('session authentication, logout, roles and origin protection', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/api/auth/me')).status, 401);
    assert.equal(
      (
        await f.request('/api/auth/login', {
          method: 'POST',
          body: { username: 'manager', password: 'wrong' },
        })
      ).status,
      401,
    );
    const manager = await f.login();
    assert.equal((await f.request('/api/auth/me', { cookie: manager })).status, 200);
    const cashier = await f.login('cashier');
    const data = await f.bootstrap(manager);
    const movie = data.movies[0];
    const input = movieInput(movie);
    assert.equal(
      (await f.request('/api/movies', { method: 'POST', cookie: cashier, body: input })).status,
      403,
    );
    assert.equal(
      (
        await f.request('/api/movies', {
          method: 'POST',
          cookie: manager,
          origin: 'https://evil.example',
          body: input,
        })
      ).status,
      403,
    );
    assert.equal(
      (await f.request('/api/auth/logout', { method: 'POST', cookie: manager })).status,
      200,
    );
    assert.equal((await f.request('/api/auth/me', { cookie: manager })).status, 401);
    const otherRoom = data.rooms.find((room) => room.cinemaId !== data.user.cinemaId);
    if (otherRoom) {
      const otherShowtime = data.showtimes.find((showtime) => showtime.roomId === otherRoom.id);
      if (otherShowtime)
        assert.equal(
          (await f.request(`/api/showtimes/${otherShowtime.id}/seats`, { cookie: cashier })).status,
          403,
        );
    }
  } finally {
    await f.close();
  }
});

test('movie search distinguishes IDs and validates edits', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login();
    const found = await f.request<Movie[]>(`/api/movies?q=${encodeURIComponent('Đào')}`, {
      cookie,
    });
    assert.equal(found.status, 200);
    assert.ok(found.body.some((movie) => movie.id === 'P001'));
    assert.ok(found.body.some((movie) => movie.id === 'P005'));
    const movie = found.body.find((item) => item.id === 'P001')!;
    assert.notEqual(found.body.find((item) => item.id === 'P005')!.year, movie.year);
    const input = movieInput(movie);
    assert.equal(
      (
        await f.request(`/api/movies/${movie.id}`, {
          method: 'PUT',
          cookie,
          body: { ...input, duration: 0 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request(`/api/movies/${movie.id}`, {
          method: 'PUT',
          cookie,
          body: { ...input, title: ' ' },
        })
      ).status,
      400,
    );
    const edited = await f.request<Movie>(`/api/movies/${movie.id}`, {
      method: 'PUT',
      cookie,
      body: { ...input, duration: 105 },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.id, 'P001');
    assert.equal(edited.body.duration, 105);
  } finally {
    await f.close();
  }
});

test('schedule permits adjacent intervals and rejects overlap across midnight', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login();
    const data = await f.bootstrap(cookie);
    const movie = data.movies.find((item) => item.format === '2D')!;
    const room = data.rooms.find((item) => item.format === movie.format)!;
    const input = {
      movieId: movie.id,
      roomId: room.id,
      startsAt: '2026-12-12T16:30:00.000Z',
      standardPrice: 80000,
      vipPrice: 100000,
    };
    const first = await f.request<{ endsAt: string }>('/api/showtimes', {
      method: 'POST',
      cookie,
      body: input,
    });
    assert.ok([200, 201].includes(first.status));
    const overlap = await f.request('/api/showtimes', {
      method: 'POST',
      cookie,
      body: { ...input, startsAt: new Date(Date.parse(first.body.endsAt) - 60000).toISOString() },
    });
    assert.equal(overlap.status, 409);
    const adjacent = await f.request('/api/showtimes', {
      method: 'POST',
      cookie,
      body: { ...input, startsAt: first.body.endsAt },
    });
    assert.ok([200, 201].includes(adjacent.status));
  } finally {
    await f.close();
  }
});

test('sale redeems one standard seat, awards paid ticket points and rejects duplicate atomically', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login('cashier');
    const data = await f.bootstrap(cookie);
    const customer = data.customers.find((item) => item.phone === '0987654321')!;
    assert.equal(customer.points, 650);
    let showtimeId = '';
    let seats: Seat[] = [];
    for (const showtime of data.showtimes.filter(
      (item) => Date.parse(item.startsAt) > fixed.getTime(),
    )) {
      const result = await f.request<Seat[]>(`/api/showtimes/${showtime.id}/seats`, { cookie });
      if (
        result.status === 200 &&
        result.body.some((seat) => seat.id === 'F05' && !seat.sold) &&
        result.body.some((seat) => seat.id === 'F06' && !seat.sold)
      ) {
        showtimeId = showtime.id;
        seats = result.body;
        break;
      }
    }
    assert.ok(showtimeId, 'a future showtime has F05 and F06 available');
    assert.equal(seats.find((seat) => seat.id === 'F05')!.type, 'Standard');
    assert.equal(seats.find((seat) => seat.id === 'F06')!.type, 'VIP');
    const sale = {
      showtimeId,
      seatIds: ['F05', 'F06'],
      customerId: customer.id,
      redeemSeatId: 'F05',
      services: [],
      paymentMethod: 'cash',
    };
    const result = await f.request<Invoice>('/api/sales', { method: 'POST', cookie, body: sale });
    assert.ok([200, 201].includes(result.status));
    assert.equal(result.body.total, 100000);
    assert.equal(result.body.pointsUsed, 500);
    assert.equal(result.body.pointsEarned, 10);
    assert.equal(result.body.pointsBalance, 160);
    assert.equal((await f.request(`/api/invoices/${result.body.id}`, { cookie })).status, 200);
    assert.equal(
      (await f.request('/api/sales', { method: 'POST', cookie, body: sale })).status,
      409,
    );
    const after = await f.request<Bootstrap>('/api/bootstrap', { cookie });
    assert.equal(after.body.customers.find((item) => item.id === customer.id)!.points, 160);
  } finally {
    await f.close();
  }
});

test('reports reject invalid dates, handle empty periods and reconcile drilldowns', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login();
    assert.equal(
      (await f.request('/api/reports?from=2026-02-30&to=2026-03-01&groupBy=movie', { cookie }))
        .status,
      400,
    );
    const empty = await f.request<Report>(
      '/api/reports?from=2035-01-01&to=2035-01-02&groupBy=movie',
      { cookie },
    );
    assert.equal(empty.status, 200);
    assert.equal(empty.body.rows.length, 0);
    const query = 'from=2026-10-26&to=2026-11-02&groupBy=movie';
    const report = await f.request<Report>(`/api/reports?${query}`, { cookie });
    assert.equal(report.status, 200);
    assert.equal(
      report.body.totals.net,
      report.body.rows.reduce((sum, row) => sum + row.net, 0),
    );
    for (const row of report.body.rows) {
      const shows = await f.request<ReportShowtime[]>(
        `/api/reports/showtimes?${query}&groupId=${encodeURIComponent(row.id)}`,
        { cookie },
      );
      assert.equal(shows.status, 200);
      assert.equal(
        row.net,
        shows.body.reduce((sum, item) => sum + item.net, 0),
      );
      for (const show of shows.body) {
        const invoices = await f.request<ReportInvoice[]>(
          `/api/reports/invoices?from=2026-10-26&to=2026-11-02&showtimeId=${encodeURIComponent(show.id)}`,
          { cookie },
        );
        assert.equal(invoices.status, 200);
        assert.equal(
          show.net,
          invoices.body.reduce((sum, item) => sum + item.net, 0),
        );
      }
    }
  } finally {
    await f.close();
  }
});

test('returns use time thresholds and cannot be repeated', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login('cashier');
    const data = await f.bootstrap(cookie);
    const showtime = data.showtimes.find(
      (item) => Date.parse(item.startsAt) - fixed.getTime() > 48 * 3600000,
    )!;
    assert.ok(showtime);
    const available = await f.request<Seat[]>(`/api/showtimes/${showtime.id}/seats`, { cookie });
    const selected = available.body
      .filter((seat) => !seat.sold && seat.type === 'Standard')
      .slice(0, 5);
    assert.equal(selected.length, 5);
    const sale = await f.request<Invoice>('/api/sales', {
      method: 'POST',
      cookie,
      body: {
        showtimeId: showtime.id,
        seatIds: selected.map((seat) => seat.id),
        services: [],
        paymentMethod: 'cash',
      },
    });
    assert.ok([200, 201].includes(sale.status));
    const starts = Date.parse(showtime.startsAt);
    for (const [index, hours, fraction] of [
      [0, 48, 1],
      [1, 24, 0.8],
      [2, 12, 0.6],
      [3, 6, 0.4],
    ] as const) {
      f.setNow(new Date(starts - hours * 3600000));
      const currentCookie = await f.login('cashier');
      const ticket = sale.body.tickets[index];
      const returned = await f.request<{ refund: number }>(`/api/tickets/${ticket.id}/return`, {
        method: 'POST',
        cookie: currentCookie,
      });
      assert.equal(returned.status, 200);
      assert.equal(returned.body.refund, ticket.price * fraction);
      assert.equal(
        (
          await f.request(`/api/tickets/${ticket.id}/return`, {
            method: 'POST',
            cookie: currentCookie,
          })
        ).status,
        409,
      );
    }
    f.setNow(new Date(starts - 6 * 3600000 + 1));
    const currentCookie = await f.login('cashier');
    assert.equal(
      (
        await f.request(`/api/tickets/${sale.body.tickets[4].id}/return`, {
          method: 'POST',
          cookie: currentCookie,
        })
      ).status,
      409,
    );
  } finally {
    await f.close();
  }
});

test('insufficient points roll back the whole sale and leave the seat available', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login('cashier');
    const data = await f.bootstrap(cookie);
    const showtime = data.showtimes.find((item) => Date.parse(item.startsAt) > fixed.getTime())!;
    const created = await f.request<{ id: string }>('/api/customers', {
      method: 'POST',
      cookie,
      body: { name: 'Khách thử', phone: '0912345678' },
    });
    assert.ok([200, 201].includes(created.status));
    const result = await f.request('/api/sales', {
      method: 'POST',
      cookie,
      body: {
        showtimeId: showtime.id,
        seatIds: ['F05', 'F06'],
        customerId: created.body.id,
        redeemSeatId: 'F05',
        services: [],
        paymentMethod: 'cash',
      },
    });
    assert.equal(result.status, 400);
    const seats = await f.request<Seat[]>(`/api/showtimes/${showtime.id}/seats`, { cookie });
    assert.equal(seats.body.find((seat) => seat.id === 'F05')!.sold, false);
    assert.equal(seats.body.find((seat) => seat.id === 'F06')!.sold, false);
    const customers = await f.request<{ id: string; points: number }[]>(
      '/api/customers?phone=0912345678',
      { cookie },
    );
    assert.equal(customers.body[0].points, 0);
  } finally {
    await f.close();
  }
});

test('ticket revenue excludes services from an invoice', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login('cashier');
    const data = await f.bootstrap(cookie);
    const showtime = data.showtimes.find((item) => Date.parse(item.startsAt) > fixed.getTime())!;
    const query = `from=${data.today}&to=${data.today}&groupBy=movie`;
    const before = await f.request<Report>(`/api/reports?${query}`, { cookie });
    const sale = await f.request<Invoice>('/api/sales', {
      method: 'POST',
      cookie,
      body: {
        showtimeId: showtime.id,
        seatIds: ['F06'],
        services: [{ serviceId: data.services[0].id, quantity: 2 }],
        paymentMethod: 'cash',
      },
    });
    assert.ok([200, 201].includes(sale.status));
    assert.ok(sale.body.total > sale.body.tickets[0].price);
    const after = await f.request<Report>(`/api/reports?${query}`, { cookie });
    assert.equal(after.body.totals.net - before.body.totals.net, sale.body.tickets[0].price);
  } finally {
    await f.close();
  }
});

test('simultaneous sales of one seat yield exactly one invoice', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login('cashier');
    const data = await f.bootstrap(cookie);
    const showtime = data.showtimes.find((item) => Date.parse(item.startsAt) > fixed.getTime())!;
    const body = { showtimeId: showtime.id, seatIds: ['F06'], services: [], paymentMethod: 'cash' };
    const results = await Promise.all([
      f.request('/api/sales', { method: 'POST', cookie, body }),
      f.request('/api/sales', { method: 'POST', cookie, body }),
    ]);
    assert.equal(results.filter((result) => [200, 201].includes(result.status)).length, 1);
    assert.equal(results.filter((result) => result.status === 409).length, 1);
    const seats = await f.request<Seat[]>(`/api/showtimes/${showtime.id}/seats`, { cookie });
    assert.equal(seats.body.find((seat) => seat.id === 'F06')!.sold, true);
  } finally {
    await f.close();
  }
});

test('cashier cannot read a showtime in another cinema and sessions expire', async () => {
  const f = await fixture();
  try {
    const manager = await f.login();
    const cashier = await f.login('cashier');
    const data = await f.bootstrap(manager);
    const cashierUser = (await f.request<{ cinemaId: string }>('/api/auth/me', { cookie: cashier }))
      .body;
    const room = data.rooms.find((item) => item.cinemaId !== cashierUser.cinemaId)!;
    const movie = data.movies.find((item) => item.format === room.format)!;
    const created = await f.request<{ id: string }>('/api/showtimes', {
      method: 'POST',
      cookie: manager,
      body: {
        movieId: movie.id,
        roomId: room.id,
        startsAt: '2026-12-12T16:30:00.000Z',
        standardPrice: 80000,
        vipPrice: 100000,
      },
    });
    assert.ok([200, 201].includes(created.status));
    assert.equal(
      (await f.request(`/api/showtimes/${created.body.id}/seats`, { cookie: cashier })).status,
      403,
    );
    f.setNow(new Date(fixed.getTime() + 13 * 3600000));
    assert.equal((await f.request('/api/auth/me', { cookie: cashier })).status, 401);
  } finally {
    await f.close();
  }
});

test('extending a film cannot create a future room overlap', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login();
    const data = await f.bootstrap(cookie);
    const movie = data.movies.find((item) => item.id === 'P001')!;
    const room = data.rooms.find((item) => item.format === movie.format)!;
    const body = {
      movieId: movie.id,
      roomId: room.id,
      startsAt: '2026-12-12T16:30:00.000Z',
      standardPrice: 80000,
      vipPrice: 100000,
    };
    const first = await f.request<{ endsAt: string }>('/api/showtimes', {
      method: 'POST',
      cookie,
      body,
    });
    assert.ok([200, 201].includes(first.status));
    const second = await f.request('/api/showtimes', {
      method: 'POST',
      cookie,
      body: { ...body, startsAt: first.body.endsAt },
    });
    assert.ok([200, 201].includes(second.status));
    const input = movieInput(movie);
    const result = await f.request('/api/movies/P001', {
      method: 'PUT',
      cookie,
      body: { ...input, duration: movie.duration + 1 },
    });
    assert.equal(result.status, 409);
    const movies = await f.request<Movie[]>('/api/movies?q=P001', { cookie });
    assert.equal(movies.body[0].duration, movie.duration);
  } finally {
    await f.close();
  }
});

test('reports place sales on the correct side of midnight in Vietnam', async () => {
  const f = await fixture();
  try {
    f.setNow(new Date('2026-11-02T16:59:59.999Z'));
    const cookie = await f.login('cashier');
    const data = await f.bootstrap(cookie);
    const showtime = data.showtimes.find((item) => Date.parse(item.startsAt) > fixed.getTime())!;
    const sell = (seat: string) =>
      f.request<Invoice>('/api/sales', {
        method: 'POST',
        cookie,
        body: { showtimeId: showtime.id, seatIds: [seat], services: [], paymentMethod: 'cash' },
      });
    const beforeMidnight = await sell('F05');
    assert.ok([200, 201].includes(beforeMidnight.status));
    f.setNow(new Date('2026-11-02T17:00:00.000Z'));
    const afterMidnight = await sell('F06');
    assert.ok([200, 201].includes(afterMidnight.status));
    const day1 = await f.request<Report>(
      '/api/reports?from=2026-11-02&to=2026-11-02&groupBy=movie',
      { cookie },
    );
    const day2 = await f.request<Report>(
      '/api/reports?from=2026-11-03&to=2026-11-03&groupBy=movie',
      { cookie },
    );
    assert.equal(day1.body.totals.net, beforeMidnight.body.tickets[0].price);
    assert.equal(day2.body.totals.net, afterMidnight.body.tickets[0].price);
  } finally {
    await f.close();
  }
});

test('refund is rejected without changing ticket or balance when earned points were spent', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login('cashier');
    const data = await f.bootstrap(cookie);
    const showtime = data.showtimes.find(
      (item) => Date.parse(item.startsAt) - fixed.getTime() > 48 * 3600000,
    )!;
    const customer = data.customers.find((item) => item.phone === '0987654321')!;
    const sell = (seatIds: string[], redeemSeatId?: string) =>
      f.request<Invoice>('/api/sales', {
        method: 'POST',
        cookie,
        body: {
          showtimeId: showtime.id,
          seatIds,
          customerId: customer.id,
          redeemSeatId,
          services: [],
          paymentMethod: 'cash',
        },
      });
    const initial = await sell(['F05', 'F06'], 'F05');
    assert.ok([200, 201].includes(initial.status));
    const seats = await f.request<Seat[]>(`/api/showtimes/${showtime.id}/seats`, { cookie });
    const standard = seats.body
      .filter((seat) => seat.type === 'Standard' && !seat.sold)
      .map((seat) => seat.id);
    assert.ok(standard.length >= 44);
    for (const batch of [standard.slice(0, 20), standard.slice(20, 40), standard.slice(40, 43)]) {
      assert.ok([200, 201].includes((await sell(batch)).status));
    }
    const redemption = await sell([standard[43]], standard[43]);
    assert.ok([200, 201].includes(redemption.status));
    assert.equal(redemption.body.pointsBalance, 4);
    const ticket = initial.body.tickets.find((item) => item.seatId === 'F06')!;
    assert.equal(
      (await f.request(`/api/tickets/${ticket.id}/return`, { method: 'POST', cookie })).status,
      409,
    );
    const invoice = await f.request<Invoice>(`/api/invoices/${initial.body.id}`, { cookie });
    assert.equal(invoice.body.tickets.find((item) => item.id === ticket.id)!.status, 'active');
    const customers = await f.request<{ points: number }[]>('/api/customers?phone=0987654321', {
      cookie,
    });
    assert.equal(customers.body[0].points, 4);
  } finally {
    await f.close();
  }
});

test('report showtimes are chronological even when the later showtime earns more', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login();
    const data = await f.bootstrap(cookie);
    const movie = data.movies.find((item) => item.id === 'P001')!;
    const room = data.rooms.find((item) => item.format === movie.format)!;
    const base = { movieId: movie.id, roomId: room.id, standardPrice: 80000, vipPrice: 100000 };
    const earlier = await f.request<{ id: string }>('/api/showtimes', {
      method: 'POST',
      cookie,
      body: { ...base, startsAt: '2026-12-12T10:00:00.000Z' },
    });
    const later = await f.request<{ id: string }>('/api/showtimes', {
      method: 'POST',
      cookie,
      body: { ...base, startsAt: '2026-12-12T14:00:00.000Z' },
    });
    assert.ok([200, 201].includes(earlier.status));
    assert.ok([200, 201].includes(later.status));
    const sell = (showtimeId: string, seatIds: string[]) =>
      f.request('/api/sales', {
        method: 'POST',
        cookie,
        body: { showtimeId, seatIds, services: [], paymentMethod: 'cash' },
      });
    assert.ok([200, 201].includes((await sell(earlier.body.id, ['F05'])).status));
    assert.ok([200, 201].includes((await sell(later.body.id, ['F05', 'F06'])).status));
    const shows = await f.request<ReportShowtime[]>(
      `/api/reports/showtimes?from=${data.today}&to=${data.today}&groupBy=movie&groupId=${movie.id}`,
      { cookie },
    );
    assert.equal(shows.status, 200);
    assert.deepEqual(
      shows.body.map((show) => show.id),
      [earlier.body.id, later.body.id],
    );
    assert.ok(shows.body[0].net < shows.body[1].net);
  } finally {
    await f.close();
  }
});

test('refund-only report retains the original invoice and seat', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login('cashier');
    const data = await f.bootstrap(cookie);
    const showtime = data.showtimes.find(
      (item) => Date.parse(item.startsAt) - fixed.getTime() > 48 * 3600000,
    )!;
    const sale = await f.request<Invoice>('/api/sales', {
      method: 'POST',
      cookie,
      body: { showtimeId: showtime.id, seatIds: ['F06'], services: [], paymentMethod: 'cash' },
    });
    assert.ok([200, 201].includes(sale.status));
    f.setNow(new Date(fixed.getTime() + 86400000));
    const nextCookie = await f.login('cashier');
    const returned = await f.request<{ refund: number }>(
      `/api/tickets/${sale.body.tickets[0].id}/return`,
      { method: 'POST', cookie: nextCookie },
    );
    assert.equal(returned.status, 200);
    const report = await f.request<ReportInvoice[]>(
      `/api/reports/invoices?from=2026-11-03&to=2026-11-03&showtimeId=${showtime.id}`,
      { cookie: nextCookie },
    );
    assert.equal(report.status, 200);
    const invoice = report.body.find((item) => item.id === sale.body.id)!;
    assert.ok(invoice);
    assert.equal(invoice.seats, 'F06');
    assert.equal(invoice.ticketRevenue, 0);
    assert.equal(invoice.refunds, returned.body.refund);
    assert.equal(invoice.net, -returned.body.refund);
  } finally {
    await f.close();
  }
});

test('SQLite persists a sale and member points across application restart without reseeding', async () => {
  const f = await fixture();
  try {
    const cookie = await f.login('cashier');
    const before = await f.bootstrap(cookie);
    const customer = before.customers.find((item) => item.phone === '0987654321')!;
    const showtime = before.showtimes.find((item) => Date.parse(item.startsAt) > fixed.getTime())!;
    const sale = await f.request<Invoice>('/api/sales', {
      method: 'POST',
      cookie,
      body: {
        showtimeId: showtime.id,
        seatIds: ['F05', 'F06'],
        customerId: customer.id,
        redeemSeatId: 'F05',
        services: [],
        paymentMethod: 'cash',
      },
    });
    assert.ok([200, 201].includes(sale.status));
    assert.equal(sale.body.pointsBalance, 160);
    await f.restart();
    const afterCookie = await f.login('cashier');
    const after = await f.bootstrap(afterCookie);
    assert.equal(after.movies.length, before.movies.length);
    assert.equal(after.customers.length, before.customers.length);
    assert.equal(after.showtimes.length, before.showtimes.length);
    assert.equal(after.customers.find((item) => item.id === customer.id)!.points, 160);
    const seats = await f.request<Seat[]>(`/api/showtimes/${showtime.id}/seats`, {
      cookie: afterCookie,
    });
    assert.equal(seats.body.find((item) => item.id === 'F05')!.sold, true);
    assert.equal(seats.body.find((item) => item.id === 'F06')!.sold, true);
    const invoice = await f.request<Invoice>(`/api/invoices/${sale.body.id}`, {
      cookie: afterCookie,
    });
    assert.equal(invoice.status, 200);
    assert.deepEqual(invoice.body, sale.body);
  } finally {
    await f.close();
  }
});
