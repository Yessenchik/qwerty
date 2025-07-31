const WebSocket = require("ws");
const logger = require("./logger");
const db = require("./db");

let wss;

module.exports = function (server) {
  wss = new WebSocket.Server({ server });
  logger.info("🟢 WebSocket сервер запущен");

  wss.on("connection", (ws, req) => {
    const ip = req.socket.remoteAddress;
    logger.info(`🔌 Новое WebSocket-подключение от ${ip}`);
    logger.info(`👥 Всего подключено клиентов: ${wss.clients.size}`);

    ws.on("message", async (message) => {
      const msg = message.toString();
      logger.info("📨 Получено сообщение от клиента: " + msg);

      let parsed;
      try {
        parsed = JSON.parse(msg);
      } catch (e) {
        logger.error("❌ Невалидный JSON от клиента:", e);
        return;
      }

      // === Обновление комнаты ===
      if (parsed.type === "roomUpdate" && parsed.roomId) {
        logger.info(`🔁 Запрос обновления комнаты: ${parsed.roomId}`);
        await broadcastRoomUpdate(parsed.roomId, ws);
      }

      // === Отметить как выбывшего ===
      else if (parsed.type === "markAsLeft" && parsed.iin && parsed.room) {
        logger.info(`🟡 WebSocket запрос markAsLeft: ИИН = ${parsed.iin}, room = ${parsed.room}`);
        try {
          const updateRes = await db.query(`
            UPDATE accommodation
            SET has_left = true,
                left_date = CURRENT_DATE,
                payment = $2
            WHERE student_id = (SELECT id FROM students WHERE iin = $1)
            RETURNING student_id
          `, [parsed.iin, parsed.payment]);

          if (updateRes.rowCount === 0) {
            logger.warn(`❗ Студент с ИИН ${parsed.iin} не найден`);
            ws.send(JSON.stringify({ type: "markAsLeftError" }));
            return;
          }

          const studentId = updateRes.rows[0].student_id;

          const result = await db.query(`
            SELECT s.fio, s.iin, a.left_date, sel.room_id
            FROM students s
            JOIN accommodation a ON a.student_id = s.id
            JOIN selections sel ON sel.student_id = s.id
            WHERE s.id = $1
          `, [studentId]);

          if (result.rows.length === 0) {
            logger.warn(`❗ Не удалось найти информацию о студенте после обновления`);
            return;
          }

          const studentInfo = result.rows[0];
          const normalizedRoomId = studentInfo.room_id;

          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "studentLeft",
                student: {
                  fio: studentInfo.fio,
                  iin: studentInfo.iin,
                  leftDate: studentInfo.left_date
                },
                room: normalizedRoomId
              }));
            }
          });

          logger.info(`✅ Студент ${studentInfo.fio} (${studentInfo.iin}) отмечен как выбывший и отправлен всем клиентам`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "markAsLeftSuccess", iin: parsed.iin }));
          }
        } catch (e) {
          logger.error("❌ Ошибка при обработке markAsLeft по WebSocket: " + e.message);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "markAsLeftError" }));
          }
        }
      }

      // === Обновление данных студента ===
      else if (parsed.type === "updateStudent" && parsed.student && parsed.room) {
        logger.info(`📝 Запрос на обновление студента через WebSocket: ${parsed.student.iin}`);
        broadcastStudentUpdated(parsed.student, parsed.room);
      }

      // === Удаление студента ===
      else if (parsed.type === "deleteStudent" && parsed.iin && parsed.room) {
        logger.info(`🗑 Запрос на удаление студента через WebSocket: ${parsed.iin}`);
        broadcastStudentDeleted(parsed.iin, parsed.room);
      }

    });

    ws.on("close", () => {
      logger.info(`❌ Клиент отключился: ${ip}`);
      logger.info(`👥 Осталось подключено: ${wss.clients.size}`);
    });

    ws.on("error", (err) => {
      logger.error(`💥 WebSocket ошибка у клиента ${ip}: ${err.message}`);
    });
  });
};

// 📦 Получить статус комнаты из базы
async function fetchRoomStatusById(roomId) {
  try {
    const result = await db.query(
      "SELECT id, occupied, places FROM rooms WHERE id = $1",
      [roomId]
    );
    if (result.rows.length === 0) {
      logger.warn(`⚠️ Комната ${roomId} не найдена в статусах`);
      return null;
    }
    return result.rows[0];
  } catch (err) {
    logger.error("❌ Не удалось получить статус комнаты:", err.message);
    return null;
  }
}

// 📤 Рассылка обновления по комнате
async function broadcastRoomUpdate(roomId, sender = null) {
  if (!wss) return;

  const roomData = await fetchRoomStatusById(roomId);
  if (!roomData) return;

  logger.info(`📤 Рассылаем обновление комнаты ${roomId}: ${roomData.occupied}/${roomData.places}`);

  wss.clients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "roomUpdate",
        roomId: roomData.id,
        roomData: {
          occupied: roomData.occupied,
          places: roomData.places
        }
      }));
    }
  });
}

// 📤 Рассылка нового студента
function broadcastNewStudent(student, roomId) {
  if (!wss) return;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "newStudent",
        roomId,
        student
      }));
    }
  });

  logger.info(`📤 Отправлено событие newStudent для комнаты ${roomId}`);
}

// 📤 Рассылка глобального обновления
function broadcastGlobalUpdate() {
  if (!wss) return;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "globalUpdate"
      }));
    }
  });

  logger.info(`📤 Отправлено событие globalUpdate`);
}

// 📤 Рассылка обновления студента
function broadcastStudentUpdated(student, room) {
  if (!wss) return;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "studentUpdated",
        student,
        room
      }));
    }
  });

  logger.info(`📤 Отправлено событие studentUpdated для ${student.iin} в комнате ${room}`);
}

// 📤 Рассылка удаления студента
function broadcastStudentDeleted(iin, room) {
  if (!wss) return;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "studentDeleted",
        iin,
        room
      }));
    }
  });

  logger.info(`📤 Отправлено событие studentDeleted: ${iin} из комнаты ${room}`);
}

module.exports.broadcastRoomUpdate = broadcastRoomUpdate;
module.exports.broadcastNewStudent = broadcastNewStudent;
module.exports.broadcastGlobalUpdate = broadcastGlobalUpdate;
module.exports.broadcastStudentUpdated = broadcastStudentUpdated;
module.exports.broadcastStudentDeleted = broadcastStudentDeleted;
module.exports.wss = () => wss;