const { Pool } = require("pg");
const logger = require("./logger");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "dormitory",
  password: "2112",
  port: 5432,
});

pool.on("error", (err) => {
  logger.error("💥 PostgreSQL error: " + err.message);
});

module.exports = {
  query: async (text, params) => {
    try {
      logger.info("🧾 SQL Query: " + text);
      return await pool.query(text, params);
    } catch (err) {
      logger.error("❌ SQL Error: " + err.message + "\nЗапрос: " + text);
      throw err;
    }
  },
};