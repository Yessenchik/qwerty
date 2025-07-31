const express = require("express");
const path = require("path");
const http = require("http");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const cors = require("cors");
app.use(cors());
const server = http.createServer(app);

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

// 🔌 WebSocket
require("./websocket")(server);

// 📦 Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use(express.static(path.join(__dirname, "../frontend")));

// 🌐 Главная страница
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/form-personal.html"));
});

// 🔗 Короткий путь /st → statistics.html
app.get("/st", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/statistics.html"));
});

// 🚀 Запуск сервера на всех интерфейсах (для доступа из сети)
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Сервер запущен: http://localhost:${PORT} (или http://<твой-IP>:${PORT})`);
});