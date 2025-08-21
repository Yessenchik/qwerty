const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../logger');
const {
  broadcastRoomUpdate,
  broadcastNewStudent,
  broadcastGlobalUpdate,
  broadcastStudentUpdated,
  broadcastStudentDeleted
} = require('../websocket');

function convertBlockToCyrillic(block) {
  if (!block) return '';
  return block
    .replace(/^A$/, 'А')
    .replace(/^B$/, 'Б')
    .replace(/^V$/, 'В');
}

function normalizeRoomId(roomId) {
  return roomId
    .replace(/А/g, 'A')
    .replace(/В/g, 'B')
    .replace(/С/g, 'C')
    .replace(/Е/g, 'E')
    .replace(/К/g, 'K')
    .replace(/М/g, 'M')
    .replace(/Н/g, 'H')
    .replace(/О/g, 'O')
    .replace(/Р/g, 'P')
    .replace(/Т/g, 'T')
    .replace(/Х/g, 'X');
}

router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        s.*, s.card_number,
        d.document_number, d.document_issue_date, d.document_issuer, d.is_graduate, d.has_disability, d.contract_number,
        a.move_in_date, a.rental_period, a.payment, a.paid, a.has_left, a.left_date,
        sel.room_id
      FROM students s
      LEFT JOIN documents d ON s.id = d.student_id
      LEFT JOIN accommodation a ON s.id = a.student_id
      LEFT JOIN selections sel ON s.id = sel.student_id
    `);
    const studentsWithCyrillicBlock = result.rows.map(student => ({
      ...student,
      block: convertBlockToCyrillic(student.block),
      contractNumber: student.contract_number,
      cardNumber: student.card_number
    }));
    res.json(studentsWithCyrillicBlock);
  } catch (err) {
    logger.error("Ошибка при получении студентов: " + err.message);
    res.status(500).json({ error: "Ошибка при получении данных" });
  }
});

router.post('/', async (req, res) => {
  const {
    fio, iin, gender, phone, university, relative_type, relative_phone,
    document_number, document_issue_date, document_issuer,
    is_graduate, has_disability, room_id, rental_period, payment,
    moveInDate,
    email, registration_city, registration_address,
    card_number,
    contract_number,
  } = req.body;

  logger.info("📥 Получен запрос на добавление студента:");
  logger.info("registration_city:", registration_city);
  logger.info("registration_address:", registration_address);
  logger.info("email:", email);

  try {
    const result = await db.query(
      `INSERT INTO students (fio, iin, gender, phone, university, relative_type, relative_phone, card_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [fio, iin, gender, phone, university, relative_type, relative_phone, card_number]
    );
    const studentId = result.rows[0].id;

    await db.query(
      `INSERT INTO documents (
        student_id, document_number, document_issue_date, document_issuer, is_graduate, has_disability,
        email, registration_city, registration_address, contract_number
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [studentId, document_number, document_issue_date, document_issuer, is_graduate, has_disability,
       email, registration_city, registration_address, contract_number]
    );

    await db.query(
      `INSERT INTO accommodation (student_id, move_in_date, rental_period, payment, paid, added_by, has_left, left_date)
       VALUES ($1, $2, $3, $4, false, 'system', false, ($2::date + make_interval(months => ($3::int - 1))))`,
      [studentId, moveInDate, rental_period, payment]
    );

    await db.query(
      `INSERT INTO selections (student_id, room_id, selected_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)`,
      [studentId, room_id]
    );

    const fullData = await db.query(`
      SELECT 
        s.fio, s.iin, s.gender, s.phone, s.university, s.relative_type, s.relative_phone,
        s.card_number,
        d.document_number, d.document_issue_date, d.document_issuer, d.is_graduate, d.has_disability,
        d.email, d.registration_city, d.registration_address, d.contract_number,
        a.move_in_date, a.rental_period, a.payment, a.paid, a.has_left, a.left_date,
        sel.room_id
      FROM students s
      LEFT JOIN documents d ON s.id = d.student_id
      LEFT JOIN accommodation a ON s.id = a.student_id
      LEFT JOIN selections sel ON s.id = sel.student_id
      WHERE s.id = $1
    `, [studentId]);

    const fullStudent = fullData.rows[0];
    const normalizedRoomId = normalizeRoomId(room_id);

    const frontendStudent = {
      fio: fullStudent.fio,
      iin: fullStudent.iin,
      gender: fullStudent.gender,
      phone: fullStudent.phone,
      university: fullStudent.university,
      relative: fullStudent.relative_type,
      relativePhone: fullStudent.relative_phone,
      cardNumber: fullStudent.card_number,
      documentNumber: fullStudent.document_number,
      documentIssueDate: fullStudent.document_issue_date,
      documentIssuer: fullStudent.document_issuer,
      isGraduate: fullStudent.is_graduate,
      hasDisability: fullStudent.has_disability,
      email: fullStudent.email,
      registrationCity: fullStudent.registration_city,
      registrationAddress: fullStudent.registration_address,
      payment: fullStudent.payment,
      paid: fullStudent.paid,
      moveInDate: fullStudent.move_in_date,
      rentalPeriod: fullStudent.rental_period,
      left: fullStudent.has_left,
      leftDate: fullStudent.left_date,
      contractNumber: fullStudent.contract_number
    };

    broadcastNewStudent(frontendStudent, normalizedRoomId);
    broadcastRoomUpdate(normalizedRoomId);
    broadcastGlobalUpdate();

    res.status(201).json({ success: true, studentId });
  } catch (err) {
    logger.error("Ошибка при добавлении студента: " + err.message);
    res.status(500).json({ error: "Ошибка при добавлении студента" });
  }
});

router.delete('/delete/:iin', async (req, res) => {
  const { iin } = req.params;
  logger.info(`🟥 Запрос на удаление студента: ИИН = ${iin}`);
  try {
    await db.query('BEGIN');

    const roomResults = await db.query(
      'SELECT room_id FROM selections WHERE student_id IN (SELECT id FROM students WHERE iin = $1)',
      [iin]
    );

    await db.query('DELETE FROM documents WHERE student_id IN (SELECT id FROM students WHERE iin = $1)', [iin]);
    await db.query('DELETE FROM accommodation WHERE student_id IN (SELECT id FROM students WHERE iin = $1)', [iin]);
    await db.query('DELETE FROM selections WHERE student_id IN (SELECT id FROM students WHERE iin = $1)', [iin]);
    await db.query('DELETE FROM students WHERE iin = $1', [iin]);

    await db.query('COMMIT');

    roomResults.rows.forEach(row => {
      if (row.room_id) {
        const normalizedRoomId = normalizeRoomId(row.room_id);
        broadcastRoomUpdate(normalizedRoomId);
        broadcastStudentDeleted(iin, normalizedRoomId);
      }
    });

    broadcastGlobalUpdate();

    logger.info(`✅ Студент с ИИН ${iin} успешно удалён`);
    res.status(200).json({ message: 'Студент удалён' });
  } catch (error) {
    await db.query('ROLLBACK');
    logger.error("❌ Ошибка при удалении студента: " + error.message);
    res.status(500).json({ error: 'Ошибка при удалении студента' });
  }
});

router.patch('/leave/:iin', async (req, res) => {
  const { iin } = req.params;
  const { payment } = req.body;

  logger.info(`🟡 Запрос на отметку как выбывшего: ИИН = ${iin}, новая сумма = ${payment}`);

  try {
    const updateRes = await db.query(`
      UPDATE accommodation
      SET has_left = true,
          left_date = CURRENT_DATE,
          payment = $2
      WHERE student_id = (SELECT id FROM students WHERE iin = $1)
      RETURNING student_id
    `, [iin, payment]);

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: "Студент не найден" });
    }

    const roomResult = await db.query(`
      SELECT room_id FROM selections WHERE student_id = $1
    `, [updateRes.rows[0].student_id]);

    const roomId = roomResult.rows[0]?.room_id || "";
    const normalizedRoomId = normalizeRoomId(roomId);

    broadcastRoomUpdate(normalizedRoomId);
    broadcastGlobalUpdate();

    logger.info(`✅ Студент с ИИН ${iin} успешно отмечен как выбывший`);
    res.json({ message: "Студент отмечен как выбывший" });
  } catch (err) {
    logger.error("❌ Ошибка при отметке как выбывшего: " + err.message);
    res.status(500).json({ error: "Ошибка при обновлении" });
  }
});

// Обновление срока аренды
router.post('/update-rental', async (req, res) => {
  // Ожидает: { iin, rentalPeriod }
  try {
    const { iin, rentalPeriod } = req.body;
    if (!iin || !rentalPeriod) {
      return res.status(400).json({ success: false, error: 'iin and rentalPeriod are required' });
    }

    const months = parseInt(rentalPeriod, 10);
    if (!Number.isInteger(months) || months <= 0) {
      return res.status(400).json({ success: false, error: 'rentalPeriod must be a positive integer' });
    }

    // Логика:
    // - rental_period := months
    // - payment := months * 30000
    // - left_date := если has_left=true, оставить как есть; иначе move_in_date + (months - 1) месяцев (тот же день месяца)
    const result = await db.query(
      `UPDATE accommodation
         SET rental_period = $1,
             payment = ($1::int * 30000),
             left_date = CASE
                           WHEN has_left THEN left_date
                           ELSE (move_in_date + make_interval(months => ($1::int - 1)))
                         END
       WHERE student_id = (SELECT id FROM students WHERE iin = $2)
       RETURNING student_id`,
      [months, iin]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'student not found' });
    }

    // Получаем актуальные поля студента и комнату для рассылки по WS
    const { rows: infoRows } = await db.query(
      `SELECT s.iin, s.fio,
              a.rental_period, a.payment, a.left_date, a.move_in_date,
              sel.room_id
       FROM students s
       JOIN accommodation a ON a.student_id = s.id
       LEFT JOIN selections sel ON sel.student_id = s.id
       WHERE s.id = $1`,
      [result.rows[0].student_id]
    );

    if (infoRows.length) {
      const r = infoRows[0];
      const normalizedRoomId = normalizeRoomId(r.room_id || '');
      // Рассылаем обновления: комната, сам студент и глобальная статистика
      broadcastRoomUpdate(normalizedRoomId);
      broadcastStudentUpdated({
        iin: r.iin,
        fio: r.fio,
        rentalPeriod: String(r.rental_period),
        payment: Number(r.payment || 0),
        leftDate: r.left_date,
        moveInDate: r.move_in_date
      }, normalizedRoomId);
      broadcastGlobalUpdate();
    }

    return res.json({ success: true, student_id: result.rows[0].student_id });
  } catch (err) {
    console.error('update-rental error:', err);
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

// Обновление номера карточки
router.post('/update-card', async (req, res) => {
  const { iin, room, cardNumber } = req.body;
  logger.info(`💳 Обновление карточки: ИИН = ${iin}, карта = ${cardNumber}`);

  try {
    const updateRes = await db.query(`
      UPDATE students SET card_number = $1 WHERE iin = $2
    `, [cardNumber, iin]);

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: "Студент не найден" });
    }

    // Получаем ФИО по ИИН
    const { rows } = await db.query(`SELECT fio FROM students WHERE iin = $1`, [iin]);
    const fio = rows[0]?.fio || '';

    const normalizedRoomId = normalizeRoomId(room);
    broadcastRoomUpdate(normalizedRoomId);
    broadcastGlobalUpdate();
    broadcastStudentUpdated({ iin, cardNumber, fio }, normalizedRoomId);

    res.json({ success: true });
  } catch (err) {
    logger.error("❌ Ошибка при обновлении номера карточки: " + err.message);
    res.status(500).json({ success: false, error: "Ошибка при обновлении номера карточки" });
  }
});

router.post('/mark-paid', async (req, res) => {
  const { iin } = req.body;

  logger.info(`💰 Обновление статуса оплаты: ИИН = ${iin}`);

  try {
    const updateRes = await db.query(`
      UPDATE accommodation
      SET paid = true
      WHERE student_id = (SELECT id FROM students WHERE iin = $1)
      RETURNING student_id
    `, [iin]);

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: "Студент не найден" });
    }

    const { rows } = await db.query(`SELECT room_id FROM selections WHERE student_id = $1`, [updateRes.rows[0].student_id]);
    const roomId = rows[0]?.room_id || '';
    const normalizedRoomId = normalizeRoomId(roomId);

    broadcastRoomUpdate(normalizedRoomId);
    broadcastStudentUpdated({ iin, paid: true }, normalizedRoomId);
    broadcastGlobalUpdate();

    res.json({ success: true });
  } catch (err) {
    logger.error("❌ Ошибка при обновлении оплаты: " + err.message);
    res.status(500).json({ success: false, error: "Ошибка при обновлении оплаты" });
  }
});

module.exports = router;