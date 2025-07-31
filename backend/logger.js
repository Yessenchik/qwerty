const { createLogger, format, transports } = require("winston");
const path = require("path");

const logger = createLogger({
  level: "info", // минимальный уровень логов
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.printf(
      (info) => `[${info.timestamp}] ${info.level.toUpperCase()}: ${info.message}`
    )
  ),
  transports: [
    // Логи ошибок
    new transports.File({
      filename: path.join(__dirname, "logs", "error.log"),
      level: "error",
    }),

    // Общие логи
    new transports.File({
      filename: path.join(__dirname, "logs", "combined.log"),
    }),

    // Вывод в консоль (удобно при разработке)
    new transports.Console(),
  ],
});

module.exports = logger;