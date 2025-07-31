// routes/checkIin.js
const express = require("express");
const router = express.Router();
const pool = require("../db"); // Убедись, что путь к pool настроен правильно

// GET /api/check-iin?iin=123456789012
router.get("/", async (req, res) => {
  const { iin } = req.query;

  if (!iin || iin.length !== 12) {
    return res.status(400).json({ error: "Неверный ИИН" });
  }

  try {
    const result = await pool.query("SELECT 1 FROM students WHERE iin = $1", [iin]);
    const exists = result.rows.length > 0;
    res.status(200).json({ exists });
  } catch (error) {
    console.error("Ошибка при проверке ИИН:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

module.exports = router;