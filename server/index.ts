import { createApp } from './app.js';
import { fileURLToPath } from 'node:url';

if (
  fileURLToPath(import.meta.url)
    .replaceAll('\\', '/')
    .includes('/dist/server/')
)
  process.env.NODE_ENV = 'production';

const { app } = await createApp({
  dbPath: process.env.DATABASE_PATH ?? 'data/cinema.sqlite',
  serveWeb: true,
});
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
app.listen(port, host, () => console.log(`Cinema đang chạy tại http://${host}:${port}`));
