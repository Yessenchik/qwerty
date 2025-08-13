const express = require("express");
const path = require("path");
const http = require("http");
const dotenv = require("dotenv");
dotenv.config();
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const crypto = require("node:crypto");
const isProd = process.env.NODE_ENV === 'production';

const app = express();
// если будет работать за прокси/балансировщиком
app.set("trust proxy", 1);
const cors = require("cors");
app.use(cors({
  origin: (origin, cb) => {
    if (!isProd) return cb(null, true);
    const allowed = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!origin || allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ["GET","HEAD","POST","PUT","PATCH","DELETE","OPTIONS"],
}));
const server = http.createServer(app);
// Настройки таймаутов для защиты от slowloris и зависаний
server.requestTimeout = 30_000;      // 30s на весь запрос
server.headersTimeout = 65_000;      // должен быть > keepAliveTimeout
server.keepAliveTimeout = 60_000;    // idle timeout соединения
// server.maxRequestsPerSocket = 0;  // при необходимости ограничить запросы на сокет
app.disable('x-powered-by');

// 📑 Request ID + логи
morgan.token('id', (req) => req.id);
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});
app.use(morgan(':date[iso] :id :method :url :status :response-time ms - :res[content-length]'));

// 📦 Подключение к базе
const db = require("./db");
app.locals.db = db;

// 🔁 Функция обновления has_left
async function autoUpdateHasLeft() {
  try {
    await db.query(`
      UPDATE accommodation
      SET has_left = true
      WHERE left_date < CURRENT_DATE AND has_left = false
    `);
    console.log("✅ Обновление: has_left обновлён для истёкших сроков аренды");
  } catch (err) {
    console.error("❌ Ошибка при обновлении has_left:", err.message);
  }
}

// ⏱️ Периодическое обновление has_left (каждый час) и запуск при старте
(async () => {
  try {
    await autoUpdateHasLeft();
  } catch (e) {
    console.error("❌ Ошибка автозапуска autoUpdateHasLeft:", e.message);
  }
})();
setInterval(() => {
  autoUpdateHasLeft().catch((e) => console.error("❌ Ошибка в автозадаче autoUpdateHasLeft:", e.message));
}, 60 * 60 * 1000);

// 🔌 WebSocket
require("./websocket")(server);

// 🔒 Безопасность + компрессия (только в проде)
if (isProd) {
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
  app.use(compression());
} else {
  console.log('DEV mode: helmet/compression выключены для удобства отладки');
}

// 📦 Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb", parameterLimit: 10000 }));
// Ошибки парсинга JSON -> 400 вместо 500
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ success: false, error: 'Invalid JSON' });
  }
  next(err);
});

// 🔁 API для ручного обновления has_left
app.post("/api/update-has-left", async (req, res) => {
  try {
    await autoUpdateHasLeft();
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Ошибка при обновлении has_left:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ❤️ Healthcheck
app.get("/health", async (req, res) => {
  const started = Date.now();
  let dbOk = false;
  try {
    await db.query("SELECT 1");
    dbOk = true;
  } catch (e) {
    console.error("❌ Health DB check failed:", e.message);
  }
  res.json({ ok: true, uptime: process.uptime(), db: dbOk, responseTimeMs: Date.now() - started, timestamp: new Date().toISOString() });
});
// 🔖 Версия сборки
app.get('/version', (req, res) => {
  res.json({
    version: process.env.APP_VERSION || 'dev',
    commit: process.env.GIT_SHA || null,
    node: process.version,
    time: new Date().toISOString(),
  });
});

// 🚦 Rate limiting (в проде). В DEV отключаем, чтобы не ломать загрузку страницы
if (isProd) {
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'GET', // не лимитируем GET-запросы страницы
  });
  app.use('/api', apiLimiter);

  const uploadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/upload', uploadLimiter);
} else {
  console.log('DEV mode: rate limiting отключен');
}

// 📂 Роуты
const studentsRouter = require("./routes/students");
const roomsRouter = require("./routes/rooms");
const checkIinRoute = require("./routes/checkIin");
const uploadRouter = require("./routes/upload");
const { contractRouter } = require("./routes/generateContract");
const exportExcelRouter = require('./routes/exportExcel');

app.use('/api/export-excel', exportExcelRouter);
app.use(contractRouter);
app.use("/api/check-iin", checkIinRoute);
app.use("/api/students", studentsRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/upload", uploadRouter);

// 🧾 Обслуживание frontend файлов
if (isProd) {
  app.use(express.static(path.join(__dirname, "../frontend"), {
    maxAge: '7d',
    immutable: true,
    etag: true,
    lastModified: true,
  }));
} else {
  app.use(express.static(path.join(__dirname, "../frontend"), {
    etag: false,
    lastModified: false,
    maxAge: 0,
  }));
}

// Отключаем кэширование для HTML-страниц (актуально для любых режимов)
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/' || req.path === '/st') {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// 🌐 Главная страница
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/form-personal.html"));
});

// 🔗 Короткий путь /st → statistics.html
app.get("/st", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/statistics.html"));
});

// 404 Not Found
app.use((req, res, next) => {
  res.status(404).json({ success: false, error: "Not Found" });
});

// Centralized error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err && err.stack ? err.stack : err);
  res.status(500).json({ success: false, error: "Internal Server Error" });
});

// 🛑 Graceful shutdown
async function shutdown(signal) {
  try {
    console.log(`\n${signal} получен. Останавливаем сервер...`);
    await new Promise((resolve) => server.close(resolve));
    console.log("HTTP сервер остановлен.");
    if (db && typeof db.end === "function") {
      try {
        await db.end();
        console.log("Пул подключений к БД закрыт.");
      } catch (e) {
        console.error("Ошибка закрытия БД:", e.message);
      }
    }
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

// 🚀 Запуск сервера на всех интерфейсах (для доступа из сети)
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Сервер запущен: http://localhost:${PORT} (или http://<твой-IP>:${PORT})`);
});