import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ============================
// 🔹 MySQL connection configuration
// ============================
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: true,
  },
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// ============================
// 🔹 Middleware
// ============================
app.use(cors());
app.use(express.json());
app.use(
  "/schoolImages",
  express.static(path.join(process.cwd(), "public", "schoolImages"))
);

// Ensure schoolImages directory exists (local dev only)
const imagesDir = path.join(__dirname, "public/schoolImages");
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// ============================
// 🔹 Multer config for uploads
// ============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/schoolImages/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "school-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// ============================
// 🔹 Initialize database
// ============================
async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS schools (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        contact BIGINT NOT NULL,
        image TEXT,
        email_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await connection.execute(createTableQuery);
    connection.release();
    console.log("✅ Database table initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
  }
}

// ============================
// 🔹 API ROUTES
// ============================

// 1. Add new school
app.post("/api/schools", upload.single("image"), async (req, res) => {
  try {
    const { name, address, city, state, contact, email_id } = req.body;
    const image = req.file ? `/schoolImages/${req.file.filename}` : null;

    const connection = await pool.getConnection();
    const [result] = await connection.execute(
      `INSERT INTO schools 
        (name, address, city, state, contact, image, email_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, address, city, state, contact, image, email_id]
    );

    connection.release();

    res.status(201).json({
      success: true,
      message: "School added successfully",
      schoolId: result.insertId,
    });
  } catch (error) {
    console.error("❌ Error adding school:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add school",
      error: error.message,
    });
  }
});

// 2. Get all schools
app.get("/api/schools", async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT id, name, address, city, state, contact, image, email_id, created_at 
       FROM schools ORDER BY created_at DESC`
    );

    connection.release();

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const schools = rows.map((row) => ({
      ...row,
      image: row.image ? `${baseUrl}${row.image}` : null,
    }));

    res.json({ success: true, schools });
  } catch (error) {
    console.error("❌ Error fetching schools:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch schools",
      error: error.message,
    });
  }
});

// 3. Get single school by ID
app.get("/api/schools/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      "SELECT * FROM schools WHERE id = ?",
      [id]
    );

    connection.release();

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "School not found",
      });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const school = rows[0];
    school.image = school.image ? `${baseUrl}${school.image}` : null;

    res.json({ success: true, school });
  } catch (error) {
    console.error("❌ Error fetching school:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch school",
      error: error.message,
    });
  }
});

// 4. Global error handler
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB.",
      });
    }
  }

  res.status(500).json({
    success: false,
    message: error.message,
  });
});

// ============================
// 🔹 Start Server
// ============================
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
