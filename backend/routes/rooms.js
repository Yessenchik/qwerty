const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../logger');

// 🔁 Преобразование блоков и id из латиницы в кириллицу (для отображения)
function convertToCyrillicBlock(block) {
  if (block === 'A') return 'А';
  if (block === 'B') return 'Б';
  if (block === 'V') return 'В';
  return block;
}

function convertToCyrillicId(id) {
  return id
    .replace(/^A/, 'А')
    .replace(/^B/, 'Б')
    .replace(/^V/, 'В');
}

// ✅ Получить все комнаты
router.get('/all', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM rooms');

    const transformed = result.rows.map(room => ({
      ...room,
      displayBlock: convertToCyrillicBlock(room.block),
      displayId: convertToCyrillicId(room.id)
    }));

    // Сортировка по блокам: A → B → V
    const blockOrder = ['A', 'B', 'V'];
    transformed.sort((a, b) => {
      const blockA = a.block;
      const blockB = b.block;

      const indexA = blockOrder.indexOf(blockA);
      const indexB = blockOrder.indexOf(blockB);

      if (indexA !== indexB) return indexA - indexB;
      if (a.floor !== b.floor) return a.floor - b.floor;
      return a.id.localeCompare(b.id);
    });

    logger.info("📦 Комнаты успешно получены (/api/rooms/all)");
    res.json(transformed);
  } catch (error) {
    logger.error("❌ Ошибка при получении всех комнат: " + error.message);
    res.status(500).json({ error: "Ошибка сервера при получении всех комнат" });
  }
});

// ✅ Обновлённый: Получить только статус занятости (учитывая только активных студентов)
router.get('/status', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        r.id,
        r.places,
        COUNT(a.*) FILTER (WHERE a.has_left = false) AS occupied
      FROM rooms r
      LEFT JOIN selections s ON s.room_id = r.id
      LEFT JOIN accommodation a ON a.student_id = s.student_id
      GROUP BY r.id, r.places
    `);
    
    logger.info("📊 Получен актуальный статус занятости комнат (/api/rooms/status)");

    const status = {};
    result.rows.forEach(r => {
      status[r.id] = {
        occupied: parseInt(r.occupied, 10),
        places: r.places
      };
    });

    res.json(status);
  } catch (error) {
    logger.error("❌ Ошибка при получении статуса комнат: " + error.message);
    res.status(500).json({ error: "Ошибка сервера при получении статуса" });
  }
});

// ✅ Получить информацию по конкретной комнате
router.get('/:roomId', async (req, res) => {
  const roomId = req.params.roomId;
  try {
    const result = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);

    if (result.rows.length === 0) {
      logger.warn(`⚠️ Комната ${roomId} не найдена`);
      return res.status(404).json({ error: "Комната не найдена" });
    }

    const room = result.rows[0];
    const response = {
      ...room,
      displayBlock: convertToCyrillicBlock(room.block),
      displayId: convertToCyrillicId(room.id)
    };

    logger.info(`📥 Получена информация по комнате ${roomId}`);
    res.json(response);
  } catch (error) {
    logger.error("❌ Ошибка при получении комнаты: " + error.message);
    res.status(500).json({ error: "Ошибка сервера при получении комнаты" });
  }
});

module.exports = router;