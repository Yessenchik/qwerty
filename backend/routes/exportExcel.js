const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

router.get('/', async (req, res) => {
  try {
    const { rows: students } = await req.app.locals.db.query(`
      SELECT
        s.fio,
        s.iin,
        s.gender,
        s.phone,
        s.university,
        s.relative_type,
        s.relative_phone,
        d.document_number,
        d.document_issue_date,
        d.document_issuer,
        d.is_graduate,
        d.has_disability,
        d.email,
        d.registration_city,
        d.registration_address,
        a.move_in_date,
        a.rental_period,
        a.payment,
        a.has_left,
        a.left_date,
        r.block,
        r.floor,
        r.id as room_id
      FROM students s
      LEFT JOIN documents d ON d.student_id = s.id
      LEFT JOIN accommodation a ON a.student_id = s.id
      LEFT JOIN selections sel ON sel.student_id = s.id
      LEFT JOIN rooms r ON r.id = sel.room_id
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Бухгалтерия');

    worksheet.columns = [
      { header: '#', key: 'index', width: 5 },
      { header: 'ФИО', key: 'fio', width: 30 },
      { header: 'ИИН', key: 'iin', width: 15 },
      { header: 'Пол', key: 'gender', width: 10 },
      { header: 'Телефон', key: 'phone', width: 18 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Университет', key: 'university', width: 30 },

      { header: 'Блок', key: 'block', width: 8 },
      { header: 'Этаж', key: 'floor', width: 8 },
      { header: 'Комната', key: 'room_id', width: 12 },

      { header: 'Тип родственника', key: 'relative_type', width: 15 },
      { header: 'Тел. родственника', key: 'relative_phone', width: 18 },

      { header: 'Номер документа', key: 'document_number', width: 15 },
      { header: 'Дата выдачи', key: 'document_issue_date', width: 15 },
      { header: 'Кем выдан', key: 'document_issuer', width: 25 },

      { header: 'Город регистрации', key: 'registration_city', width: 20 },
      { header: 'Адрес регистрации', key: 'registration_address', width: 25 },

      { header: 'Дата заселения', key: 'move_in_date', width: 15 },
      { header: 'Срок аренды', key: 'rental_period', width: 12 },
      { header: 'Сумма оплаты', key: 'payment', width: 12 },
      { header: 'Выбыл?', key: 'has_left', width: 10 },
      { header: 'Дата выбытия', key: 'left_date', width: 15 },

      { header: 'Выпускник', key: 'is_graduate', width: 10 },
      { header: 'Инвалидность', key: 'has_disability', width: 10 },
    ];

    students.sort((a, b) => a.fio.localeCompare(b.fio, 'ru'));

    students.forEach((s, i) => {
      worksheet.addRow({
        index: i + 1,
        ...s,
        has_left: s.has_left ? 'Да' : 'Нет',
        is_graduate: s.is_graduate ? 'Да' : 'Нет',
        has_disability: s.has_disability ? 'Да' : 'Нет',
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Disposition', 'attachment; filename="accounting-full.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (err) {
    console.error("Ошибка при экспорте Excel:", err);
    res.status(500).json({ error: "Ошибка при экспорте Excel" });
  }
});

module.exports = router;