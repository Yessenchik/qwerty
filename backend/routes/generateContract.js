const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const db = require("../db");
const fs = require("fs");
const path = require("path");

function getNextContractNumber(outputFolder) {
  const numberFile = path.join(outputFolder, "contract-number.txt");
  let current = 0;

  if (fs.existsSync(numberFile)) {
    const content = fs.readFileSync(numberFile, "utf-8");
    current = parseInt(content, 10) || 0;
  }

  return `${current + 1}(a)`;
}

function saveContractNumber(outputFolder, contractNumber) {
  const number = parseInt(contractNumber);
  const numberFile = path.join(outputFolder, "contract-number.txt");
  fs.writeFileSync(numberFile, number.toString(), "utf-8");
}

function logGeneratedContract(outputFolder, fileName) {
  const logFile = path.join(outputFolder, "generated-contracts-log.txt");
  const now = new Date();
  const dateStr = now.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const logEntry = `[${dateStr}] ${fileName}\n`;
  fs.appendFileSync(logFile, logEntry, "utf-8");
}

function formatDate(dateString) {
  const d = new Date(dateString);
  if (isNaN(d)) return dateString || "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

async function generateContract(data, outputFolder) {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, "0");
  const month = now.toLocaleString("ru-RU", { month: "long" });
  const year = now.getFullYear();
  const contractNumber = getNextContractNumber(outputFolder);

  const templatePath = path.resolve(
    __dirname,
    "../templates/1contract-template.docx"
  );
  const content = fs.readFileSync(templatePath, "binary");

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '<<', end: '>>' },
  });

  doc.setData({
    contractNumber,
    day,
    month,
    year,
    fio: data.fio,
    shortFio: data.shortFio,
    iin: data.iin,
    phone: data.phone,
    email: data.email,
    university: data.university,
    documentNumber: data.documentNumber,
    documentIssueDate: formatDate(data.documentIssueDate),
    documentIssuer: data.documentIssuer,
    hasDisability: data.hasDisability,
    isGraduate: data.isGraduate,
    block: data.block,
    room: data.room,
    registrationCity: data.registrationCity,
    registrationAddress: data.registrationAddress,
  });

  try {
    doc.render();
  } catch (error) {
    const e = {
      message: error.message,
      name: error.name,
      stack: error.stack,
      properties: error.properties,
    };
    console.error("❌ Ошибка генерации шаблона:", JSON.stringify(e, null, 2));
    throw error;
  }

  const buf = doc.getZip().generate({ type: "nodebuffer" });

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const safeIin = data.iin || "без_iin";
  const safeFio = (data.fio || "без_имени").replace(/[\\/:*?"<>|]/g, "_");
  // В имени файла добавляем номер договора. Меняем латинскую "a" на кириллическую "а" в конце.
  const displayContractNumber = contractNumber.replace(/a$/, "а");
  const fileName = `Договор ${displayContractNumber} ${safeFio} (${safeIin}).docx`;
  const outputPath = path.join(outputFolder, fileName);

  fs.writeFileSync(outputPath, buf);
  logGeneratedContract(outputFolder, fileName);
  saveContractNumber(outputFolder, contractNumber);
  // Сохраняем номер договора в таблицу documents как 1a (без скобок)
  const dbContractNumber = contractNumber.replace("(a)", "a");
  try {
    await db.query(
      `UPDATE documents SET contract_number = $1 WHERE student_id = $2`,
      [dbContractNumber, data.studentId]
    );
  } catch (err) {
    console.error("❌ Ошибка сохранения номера договора в documents:", err.message);
  }
  return outputPath;
}

function findExistingContractByIin(folderPath, safeIin) {
  if (!fs.existsSync(folderPath)) return null;
  try {
    const files = fs.readdirSync(folderPath);
    // Ищем файлы формата: "Договор ... (...safeIin...).docx"
    const candidates = files
      .filter(name => name.startsWith("Договор ") && name.endsWith(`(${safeIin}).docx`))
      .map(name => {
        const full = path.join(folderPath, name);
        let mtime = 0;
        try {
          mtime = fs.statSync(full).mtimeMs || 0;
        } catch { /* ignore */ }
        return { name, full, mtime };
      });
    if (candidates.length === 0) return null;
    // Берём самый свежий по дате изменения
    candidates.sort((a, b) => b.mtime - a.mtime);
    return candidates[0].full;
  } catch (e) {
    console.warn("⚠️ Ошибка при поиске существующего договора:", e.message);
    return null;
  }
}

function sendDocx(res, filePath) {
  const fileName = path.basename(filePath);
  const encoded = encodeURIComponent(fileName)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
  try {
    const stat = fs.statSync(filePath);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    // Fallback ASCII filename and RFC5987 UTF-8 filename*
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"; filename*=UTF-8''${encoded}`
    );
    res.setHeader("Content-Length", stat.size);
  } catch (_) {}
  return res.sendFile(filePath);
}

const express = require("express");
const router = express.Router();

router.get("/contracts/:iin", async (req, res) => {
  const iin = String(req.params.iin).trim();
  console.log("📥 Получен запрос на скачивание договора для IIN:", iin);

  const baseDir = "/Users/yessenzhumagali/Desktop/contract";

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
    console.log("📁 Создана папка для контрактов:", baseDir);
  }

  let result;
  try {
    result = await db.query(
      `
      SELECT 
        s.id AS student_id,
        s.fio, s.iin, s.phone, s.university,
        d.document_number, d.document_issue_date, d.document_issuer, d.is_graduate, d.has_disability,
        d.email, d.registration_address, d.registration_city,
        sel.room_id,
        r.block
      FROM students s
      LEFT JOIN documents d ON s.id = d.student_id
      LEFT JOIN selections sel ON s.id = sel.student_id
      LEFT JOIN rooms r ON sel.room_id = r.id
      WHERE s.iin = $1
    `,
      [iin]
    );
  } catch (e) {
    console.error("❌ Ошибка запроса к базе:", e.message);
    return res.status(500).send("Ошибка запроса к базе");
  }

  const student = result.rows[0];

  if (!student) {
    console.warn("⚠️ Студент с таким IIN не найден в базе:", iin);
    return res.status(404).send("Студент не найден");
  }

  console.log("👤 Найден студент:", student.fio);

  const shortFio = (() => {
    if (!student.fio) return "";
    const parts = student.fio.trim().split(" ");
    if (parts.length < 2) return student.fio;
    const lastName = parts[0];
    const initials = parts
      .slice(1)
      .map((p) => p[0].toUpperCase())
      .join(".");
    return `${lastName}.${initials}.`;
  })();

  const data = {
    fio: student.fio || "",
    iin: student.iin || "",
    phone: student.phone || "",
    email: student.email || "",
    university: student.university || "",
    documentNumber: student.document_number || "",
    documentIssueDate: student.document_issue_date || "",
    documentIssuer: student.document_issuer || "",
    hasDisability: student.has_disability ? "Да" : "Нет",
    isGraduate: student.is_graduate ? "Да" : "Нет",
    block: student.block || "___",
    room: student.room_id || "___",
    registrationAddress: student.registration_address || "",
    registrationCity: student.registration_city || "",
    shortFio: shortFio,
    studentId: student.student_id,
  };

  console.log("📦 Подготовленные данные для шаблона:");
  for (const [key, value] of Object.entries(data)) {
    if (!value) {
      console.warn(`⚠️ Пустое значение: ${key}`);
    } else {
      console.log(`✅ ${key}: ${value}`);
    }
  }

  const folderPath = baseDir;
  console.log("🔧 Подготовка папки:", folderPath);

  const safeIin = data.iin || "без_iin";
  const safeFio = (data.fio || "без_имени").replace(/[\\/:*?"<>|]/g, "_");

  // 1) Сначала пробуем найти уже существующий договор по IIN
  const existingPath = findExistingContractByIin(folderPath, safeIin);
  if (existingPath && fs.existsSync(existingPath)) {
    console.log("📄 Найден ранее созданный договор — скачиваем без генерации:", existingPath);
    return sendDocx(res, existingPath);
  }

  // 2) Если не нашли — генерируем новый и скачиваем
  console.log("📄 Договор не найден — генерируем новый");
  try {
    const generatedPath = await generateContract(data, folderPath);
    if (!fs.existsSync(generatedPath)) {
      console.error("❌ Не удалось создать договор:", generatedPath);
      return res.status(500).send("Ошибка: файл не был создан");
    }
    console.log("📄 Договор успешно создан:", generatedPath);
    return sendDocx(res, generatedPath);
  } catch (e) {
    console.error("❌ Ошибка при генерации .doc:", e.message);
    console.error("❌ Полный стек ошибки:", e.stack);
    return res.status(500).send("Ошибка генерации договора");
  }
});

module.exports = { generateContract, contractRouter: router };
