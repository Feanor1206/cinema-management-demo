import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path: string, now: Date) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, cinemaId TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), expiresAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cinemas (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, cinemaId TEXT NOT NULL REFERENCES cinemas(id), name TEXT NOT NULL, format TEXT NOT NULL, capacity INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS movies (id TEXT PRIMARY KEY, title TEXT NOT NULL, genre TEXT NOT NULL, duration INTEGER NOT NULL, year INTEGER NOT NULL, director TEXT NOT NULL, cast TEXT NOT NULL, description TEXT NOT NULL, format TEXT NOT NULL, status TEXT NOT NULL, color TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS showtimes (id TEXT PRIMARY KEY, movieId TEXT NOT NULL REFERENCES movies(id), roomId TEXT NOT NULL REFERENCES rooms(id), startsAt TEXT NOT NULL, endsAt TEXT NOT NULL, standardPrice INTEGER NOT NULL, vipPrice INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, points INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, category TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, showtimeId TEXT NOT NULL REFERENCES showtimes(id), customerId TEXT REFERENCES customers(id), staffId TEXT NOT NULL REFERENCES users(id), createdAt TEXT NOT NULL, paymentMethod TEXT NOT NULL, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL, total INTEGER NOT NULL, pointsEarned INTEGER NOT NULL, pointsUsed INTEGER NOT NULL, pointsBalance INTEGER);
    CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, invoiceId TEXT NOT NULL REFERENCES invoices(id), showtimeId TEXT NOT NULL REFERENCES showtimes(id), seatId TEXT NOT NULL, type TEXT NOT NULL, price INTEGER NOT NULL, discount INTEGER NOT NULL, pointsEarned INTEGER NOT NULL, pointsUsed INTEGER NOT NULL, status TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS invoices_created_at ON invoices(createdAt);
    CREATE INDEX IF NOT EXISTS invoices_showtime_id ON invoices(showtimeId);
    CREATE INDEX IF NOT EXISTS tickets_invoice_id ON tickets(invoiceId);
    CREATE UNIQUE INDEX IF NOT EXISTS active_seat ON tickets(showtimeId, seatId) WHERE status = 'active';
    CREATE TABLE IF NOT EXISTS invoice_services (invoiceId TEXT NOT NULL REFERENCES invoices(id), name TEXT NOT NULL, quantity INTEGER NOT NULL, unitPrice INTEGER NOT NULL, total INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS refunds (id TEXT PRIMARY KEY, ticketId TEXT UNIQUE NOT NULL REFERENCES tickets(id), createdAt TEXT NOT NULL, amount INTEGER NOT NULL, pointsDeducted INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS refunds_created_at ON refunds(createdAt);`);
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    db.exec('BEGIN');
    try {
      const salt = randomBytes(16).toString('hex');
      const hash = scryptSync('Cinema123!', salt, 64).toString('hex');
      const user = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)');
      user.run('U001', 'manager', 'Quản lý', 'manager', 'C001', salt, hash);
      user.run('U002', 'cashier', 'Thu ngân', 'cashier', 'C001', salt, hash);
      db.exec(`INSERT INTO cinemas VALUES ('C001','Cinema Sài Gòn','Quận 1, TP. Hồ Chí Minh'),('C002','Cinema Hà Nội','Quận Hoàn Kiếm, Hà Nội');
        INSERT INTO rooms VALUES ('R001','C001','Phòng 01','2D',80),('R002','C001','Phòng 02','3D',80),('R003','C002','Phòng 01','2D',80);
        INSERT INTO movies VALUES
        ('P001','Đào, Phở và Piano','Tình cảm',100,2024,'Phi Tiến Sơn','Doãn Quốc Đam','Một câu chuyện giữa lòng Hà Nội.','2D','showing','#d98b67'),
        ('P005','Đào và biển','Tâm lý',110,2025,'Minh An','Lan Anh','Hành trình trở về.','2D','showing','#729bb0'),
        ('P002','Hành tinh xanh','Phiêu lưu',120,2025,'Hoàng Nam','Thanh Hà','Khám phá thế giới mới.','3D','showing','#628b91');
        INSERT INTO customers VALUES ('KH001','Nguyễn Văn B','0987654321',650);
        INSERT INTO services VALUES ('DV001','Bắp rang bơ',45000,'Bắp'),('DV002','Nước ngọt',25000,'Nước');`);
      const start = new Date(now.getTime() + 3 * 86400000);
      start.setUTCMinutes(0, 0, 0);
      const end = new Date(start.getTime() + 100 * 60000);
      db.prepare('INSERT INTO showtimes VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        'SC001',
        'P001',
        'R001',
        start.toISOString(),
        end.toISOString(),
        80000,
        100000,
      );
      const past = new Date(now.getTime() + 2 * 86400000);
      const pastEnd = new Date(past.getTime() + 100 * 60000);
      db.prepare('INSERT INTO showtimes VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        'SC002',
        'P001',
        'R001',
        past.toISOString(),
        pastEnd.toISOString(),
        80000,
        100000,
      );
      const saleTime = new Date(now.getTime() - 2 * 86400000).toISOString();
      db.prepare('INSERT INTO invoices VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        'HDSEED',
        'SC002',
        null,
        'U002',
        saleTime,
        'cash',
        160000,
        0,
        160000,
        0,
        0,
        null,
      );
      db.prepare('INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        'VTSEED1',
        'HDSEED',
        'SC002',
        'A01',
        'Standard',
        80000,
        0,
        0,
        0,
        'returned',
      );
      db.prepare('INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        'VTSEED2',
        'HDSEED',
        'SC002',
        'A02',
        'Standard',
        80000,
        0,
        0,
        0,
        'active',
      );
      db.prepare('INSERT INTO refunds VALUES (?, ?, ?, ?, ?)').run(
        'HTSEED',
        'VTSEED1',
        new Date(now.getTime() - 86400000).toISOString(),
        80000,
        0,
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}
