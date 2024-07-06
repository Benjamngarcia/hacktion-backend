require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2");
const fs = require("fs");

const app = express();
const port = 8080;

app.use(bodyParser.json());

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
      ca: fs.readFileSync(process.env.DB_SSL_CA)
  }
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    return;
  }
  console.log("Connected to the database");
});

const jwtSecret = process.env.JWT_SECRET;

app.post("/register", async (req, res) => {
  const { name, lastname, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 8);

  db.query(
    "INSERT INTO users (name, lastname, email, password) VALUES (?, ?, ?, ?)",
    [name, lastname, email, hashedPassword],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ message: "User registered successfully" });
    }
  );
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, results) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (results.length === 0) {
        return res.status(400).json({ error: "User not found" });
      }

      const user = results[0];
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.status(400).json({ error: "Invalid password" });
      }

      const token = jwt.sign({ id: user.id }, jwtSecret, { expiresIn: "1h" });
      res.json({ token });
    }
  );
});

app.post("/saveToken", (req, res) => {
  const { notionToken, githubToken } = req.body;
  const token = req.headers.authorization.split(" ")[1];
  const decoded = jwt.verify(token, jwtSecret);

  db.query(
    "INSERT INTO tokens (user_id, notion_token, github_token) VALUES (?, ?, ?)",
    [decoded.id, notionToken, githubToken],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ message: "Tokens saved successfully" });
    }
  );
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
