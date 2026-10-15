import 'dotenv/config';
import app from './index.js';

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`Marvaelle Express API listening on http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`[server] ${signal} received; closing HTTP server`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
