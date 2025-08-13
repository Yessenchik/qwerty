// 🚨 ВАЖНО: Логируется каждая загрузка файлов с IP, User-Agent и деталями файлов
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// 📁 Папка для хранения документов
const destinationRoot = "/Users/yessenzhumagali/Desktop/studentsdocs"; // 🔧 Укажи свою корневую папку

// Кеш для ФИО
let cachedFullName = "неизвестный";
const clearedDirs = new Set();

function getAcademicYearFolder(settleDateStr) {
  const settleDate = new Date(settleDateStr);
  const year = settleDate.getFullYear();
  const month = settleDate.getMonth() + 1;
  const startYear = month >= 8 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear} - ${endYear}`;
}

// ⚙️ Настройка multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.body.firstName || !req.body.lastName) {
      console.error("❌ Неверное ФИО: firstName или lastName отсутствует", req.body);
      return cb(new Error("Некорректное имя/фамилия — невозможно создать директорию"), null);
    }
    cachedFullName = `${req.body.lastName} ${req.body.firstName} ${req.body.middleName || ""}`.trim();

    const settleDate = req.query.moveInDate;
    if (!settleDate) {
      console.error("❌ Не указана дата заселения");
      return cb(new Error("Не указана дата заселения — невозможно определить учебный год"), null);
    }

    const academicFolder = getAcademicYearFolder(settleDate);
    const academicPath = path.join(destinationRoot, academicFolder);
    const studentDir = path.join(academicPath, cachedFullName);

    if (!fs.existsSync(academicPath)) {
      fs.mkdirSync(academicPath, { recursive: true });
    }

    if (!clearedDirs.has(studentDir)) {
      if (fs.existsSync(studentDir)) {
        fs.rmSync(studentDir, { recursive: true, force: true });
      }
      fs.mkdirSync(studentDir, { recursive: true });
      clearedDirs.add(studentDir);
    }

    cb(null, studentDir);
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
    } else {
      name = `${file.fieldname} ${cachedFullName}${ext}`;
    }

    const settleDate = req.query.moveInDate;
    const academicFolder = getAcademicYearFolder(settleDate);
    const studentDir = path.join(destinationRoot, academicFolder, cachedFullName);

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

const upload = multer({ storage });

router.post(
  "/",
  upload.fields([
    { name: "idCard", maxCount: 1 },
    { name: "universityProof", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
    { name: "fluorography", maxCount: 1 },
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

    const fullName = `${lastName} ${firstName} ${middleName || ""}`.trim();
    console.log("🧾 req.body:", req.body);
    console.log("📂 req.files:", req.files);
    const studentDir = path.join(destinationRoot, fullName);

    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: "ФИО обязательно" });
    }

    const idCardOk = req.files?.idCard?.length > 0;
    const proofOk = req.files?.universityProof?.length > 0;
    const selfieOk = req.files?.selfie?.length > 0;
    const fluorographyOk = req.files?.fluorography?.length > 0;

    if (!idCardOk || !proofOk || !selfieOk || !fluorographyOk) {
      console.warn("⚠️ Пропущенные файлы:", {
        idCard: idCardOk,
        universityProof: proofOk,
        selfie: selfieOk,
        fluorography: fluorographyOk
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

    console.log("✅ Все 4 документа успешно получены и сохранены");
    console.log("📤 Ответ отправлен клиенту");
    res.json({ success: true, message: "Документы и договор успешно загружены" });
  }
);

module.exports = router;