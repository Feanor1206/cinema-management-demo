export type Role = 'manager' | 'cashier';
export type SeatType = 'Standard' | 'VIP';
export type User = { id: string; username: string; name: string; role: Role; cinemaId: string };
export type Cinema = { id: string; name: string; address: string };
export type Room = {
  id: string;
  cinemaId: string;
  name: string;
  format: '2D' | '3D';
  capacity: number;
};
export type Movie = {
  id: string;
  title: string;
  genre: string;
  duration: number;
  year: number;
  director: string;
  cast: string;
  description: string;
  format: '2D' | '3D';
  status: 'showing' | 'upcoming';
  color: string;
};
export type MovieInput = Omit<Movie, 'id' | 'color'>;
export type Showtime = {
  id: string;
  movieId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  standardPrice: number;
  vipPrice: number;
  soldSeats: number;
};
export type ShowtimeInput = Omit<Showtime, 'id' | 'endsAt' | 'soldSeats'>;
export type Customer = { id: string; name: string; phone: string; points: number };
export type Service = { id: string; name: string; price: number; category: string };
export type Seat = {
  id: string;
  row: string;
  number: number;
  type: SeatType;
  sold: boolean;
  price: number;
};
export type SaleInput = {
  showtimeId: string;
  seatIds: string[];
  customerId?: string;
  redeemSeatId?: string;
  services: { serviceId: string; quantity: number }[];
  paymentMethod: 'cash' | 'transfer';
};
export type Ticket = {
  id: string;
  seatId: string;
  seatLabel: string;
  type: SeatType;
  price: number;
  discount: number;
  pointsEarned: number;
  pointsUsed: number;
  status: 'active' | 'returned';
};
export type Invoice = {
  id: string;
  createdAt: string;
  movieTitle: string;
  cinemaName: string;
  roomName: string;
  startsAt: string;
  customerName: string | null;
  staffName: string;
  paymentMethod: 'cash' | 'transfer';
  subtotal: number;
  discount: number;
  total: number;
  pointsEarned: number;
  pointsUsed: number;
  pointsBalance: number | null;
  tickets: Ticket[];
  services: { name: string; quantity: number; unitPrice: number; total: number }[];
};
export type ReportFilter = { from: string; to: string; groupBy: 'movie' | 'cinema' };
export type ReportRow = {
  id: string;
  name: string;
  ticketsSold: number;
  ticketsReturned: number;
  gross: number;
  refunds: number;
  net: number;
};
export type Report = {
  rows: ReportRow[];
  totals: Omit<ReportRow, 'id' | 'name'>;
  daily: { date: string; net: number }[];
};
export type ReportShowtime = ReportRow & { movieTitle: string; roomName: string; startsAt: string };
export type ReportInvoice = {
  id: string;
  createdAt: string;
  customerName: string | null;
  seats: string;
  ticketRevenue: number;
  refunds: number;
  net: number;
};
export type Dashboard = {
  revenue: number;
  ticketsSold: number;
  occupancy: number;
  showtimeCount: number;
  daily: { date: string; net: number }[];
  recentInvoices: {
    id: string;
    movieTitle: string;
    seats: string;
    total: number;
    createdAt: string;
  }[];
};
export type Bootstrap = {
  user: User;
  cinemas: Cinema[];
  rooms: Room[];
  movies: Movie[];
  showtimes: Showtime[];
  customers: Customer[];
  services: Service[];
  dashboard: Dashboard;
  today: string;
};
export type ApiError = { error: string; code: string };
