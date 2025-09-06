// 🚨 ВАЖНО: Логируется каждая загрузка файлов с IP, User-Agent и деталями файлов
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// 📁 Папка для хранения документов
const destinationRoot = process.env.DESTINATION_ROOT || path.join(__dirname, '..', '..', '..', 'studentsdocs');
fs.mkdirSync(destinationRoot, { recursive: true });

// Кеш для ФИО
let cachedFullName = "неизвестный";

function sanitizeName(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|]/g, '_')     // запрещённые в файловых системах символы
    .replace(/\.{2,}/g, '.')            // многоточия
    .replace(/\s+/g, ' ')               // лишние пробелы
    .trim();
}

function getAcademicYearFolder(settleDateStr) {
  const d = settleDateStr ? new Date(settleDateStr) : null;
  if (!d || isNaN(d)) return 'unknown-year';
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const startYear = month >= 8 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear} - ${endYear}`;
}

// ⚙️ Настройка multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ln = sanitizeName(req.body && req.body.lastName);
    const fn = sanitizeName(req.body && req.body.firstName);
    const mn = sanitizeName(req.body && req.body.middleName);
    cachedFullName = `${ln} ${fn} ${mn}`.trim();
    if (!cachedFullName) {
      cachedFullName = `unknown-${Date.now()}`;
    }

    const settleDate = (req.query && req.query.moveInDate) || (req.body && (req.body.settlementDate || req.body.moveInDate));
    if (!settleDate) {
      console.warn('No move-in date provided; using fallback folder');
    }

    const academicFolder = getAcademicYearFolder(settleDate);
    const academicPath = path.join(destinationRoot, academicFolder);
    const studentDir = path.join(academicPath, cachedFullName);

    fs.mkdirSync(studentDir, { recursive: true });
    return cb(null, studentDir);
  },

  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase();
    if (!ext) {
      if (file.mimetype === "application/pdf") ext = ".pdf";
      else if (file.mimetype === "image/jpeg") ext = ".jpeg";
      else if (file.mimetype === "image/png") ext = ".png";
      else ext = ".bin";
    }

    let name = "";
    if (file.fieldname === "idCard") {
      name = `Удостоверение личности ${cachedFullName}${ext}`;
    } else if (file.fieldname === "universityProof") {
      name = `Справка с места учёбы ${cachedFullName}${ext}`;
    } else if (file.fieldname === "selfie") {
      name = `Фото ${cachedFullName}${ext}`;
    } else if (file.fieldname === "fluorography") {
      name = `Снимок флюорографии ${cachedFullName}${ext}`;
    } else if (file.fieldname === "dormReferral") {
      name = `Направление в общежитие ${cachedFullName}${ext}`;
    } else {
      name = `${file.fieldname} ${cachedFullName}${ext}`;
    }

    const settleDate = (req.query && req.query.moveInDate) || (req.body && (req.body.settlementDate || req.body.moveInDate));
    const academicFolder = getAcademicYearFolder(settleDate);
    const studentDir = path.join(destinationRoot, academicFolder, cachedFullName);
    if (!fs.existsSync(studentDir)) fs.mkdirSync(studentDir, { recursive: true });

    const baseName = name.replace(ext, "");
    const existingFiles = fs.readdirSync(studentDir);
    existingFiles.forEach(file => {
      if (file.startsWith(baseName) && file !== name) {
        fs.unlinkSync(path.join(studentDir, file));
      }
    });

    console.log("📦 Сохраняем файл:", name);
    console.log("📎 MIME тип:", file.mimetype);
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB на файл
});

// Health check for quick connectivity tests
router.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

router.post(
  "/",
  upload.fields([
    { name: "idCard", maxCount: 1 },
    { name: "universityProof", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
    { name: "fluorography", maxCount: 1 },
    { name: "dormReferral", maxCount: 1 },
  ]),
  (req, res) => {
    console.log("📥 Получен POST-запрос на загрузку файлов");
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];
    console.log("🌐 IP-адрес клиента:", ip);
    console.log("🧭 User-Agent:", userAgent);
    const {
      firstName,
      lastName,
      middleName,
      documentNumber,
      documentIssueDate,
      documentIssuer,
      isGraduate,
      hasDisability,
      iin,
      phone,
      email,
      university,
      room,
      block,
      registrationAddress
    } = req.body;

    const fullName = sanitizeName(`${lastName} ${firstName} ${middleName || ""}`.trim());
    const settleDate = (req.query && req.query.moveInDate) || (req.body && (req.body.settlementDate || req.body.moveInDate));
    const academicFolder = getAcademicYearFolder(settleDate);
    const studentDir = path.join(destinationRoot, academicFolder, fullName);

    console.log("🧾 req.body:", req.body);
    console.log("📂 req.files:", req.files);

    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: "ФИО обязательно" });
    }

    const idCardOk = req.files?.idCard?.length > 0;
    const proofOk = req.files?.universityProof?.length > 0;
    const selfieOk = req.files?.selfie?.length > 0;
    const fluorographyOk = req.files?.fluorography?.length > 0;
    const dormReferralOk = req.files?.dormReferral?.length > 0;

    if (!idCardOk || !proofOk || !selfieOk || !fluorographyOk || !dormReferralOk) {
      console.warn("⚠️ Пропущенные файлы:", {
        idCard: idCardOk,
        universityProof: proofOk,
        selfie: selfieOk,
        fluorography: fluorographyOk,
        dormReferral: dormReferralOk,
      });
      console.warn("⚠️ Информация о загруженных файлах:", req.files);
      console.error("❌ Ошибка: не все документы были загружены. Файлы:", Object.keys(req.files || {}));
      return res.status(400).json({
        success: false,
        message: "Не все документы были загружены",
      });
    }
    if (!req.files?.selfie || req.files.selfie.length === 0) {
      console.warn("⚠️ Селфи не прикреплено!");
    } else {
      console.log("📸 Селфи получено:", req.files.selfie[0].originalname);
    }

    console.log("✅ Загрузка завершена для:", fullName);
    console.log("📄 Получены файлы:", Object.keys(req.files));

    // 📄 Генерация договора
    /*
    try {
      const PizZip = require("pizzip");
      const Docxtemplater = require("docxtemplater");
      const contractTemplate = fs.readFileSync(path.join(__dirname, "../templates/contract-template.docx"), "binary");
      const zip = new PizZip(contractTemplate);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

      const contractData = {
        fio: fullName,
        iin: iin || "000000000000",
        phone: phone || "",
        email: email || "",
        university: university || "",
        documentNumber: documentNumber || "",
        documentIssueDate: documentIssueDate || "",
        documentIssuer: documentIssuer || "",
        hasDisability: hasDisability || "",
        isGraduate: isGraduate || "",
        room: room || "___",
        block: block || "___",
        date: new Date().toLocaleDateString("ru-RU"),
        registrationAddress: registrationAddress || "г. Астана"
      };

      doc.setData(contractData);
      doc.render();
      const buf = doc.getZip().generate({ type: "nodebuffer" });

      const contractPath = path.join(studentDir, `Договор ${fullName}.docx`);
      fs.writeFileSync(contractPath, buf);
      console.log("📄 Договор создан:", contractPath);
    } catch (e) {
      console.error("❌ Ошибка генерации договора:", e);
    }
    */

    console.log("📊 Загруженные поля файлов:");
    Object.entries(req.files).forEach(([field, files]) => {
      files.forEach(f => {
        console.log(`🔹 ${field}: ${f.originalname}, ${f.size} байт`);
      });
    });

    console.log("✅ Все 5 документов успешно получены и сохранены");
    console.log("📤 Ответ отправлен клиенту");
    res.json({ success: true, message: "Документы и договор успешно загружены" });
  }
);

// Multer & generic error handler for uploads
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'Размер файла слишком большой. Максимум 50MB на файл.' });
  }
  if (err && err.message) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

module.exports = router;