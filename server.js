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
    ca: fs.readFileSync(process.env.DB_SSL_CA),
  },
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
    "INSERT INTO usuarios (nombre, apellido, correo, password) VALUES (?, ?, ?, ?)",
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
    "INSERT INTO tokens (id_usuario, notion_token, github_token) VALUES (?, ?, ?)",
    [decoded.id, notionToken, githubToken],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ message: "Tokens saved successfully" });
    }
  );
});

// Endpoint para leer datos de Notion y crear ramas en GitHub
app.post("/notion-to-github", async (req, res) => {
  const { databaseId } = req.body;
  const token = req.headers.authorization.split(" ")[1];
  const decoded = jwt.verify(token, jwtSecret);

  try {
    // Obtener tokens de la base de datos
    const [rows] = await db
      .promise()
      .query(
        "SELECT notion_token, github_token FROM tokens WHERE user_id = ?",
        [decoded.id]
      );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Tokens not found" });
    }

    const notionToken = rows[0].notion_token;
    const githubToken = rows[0].github_token;

    // Configurar clientes de Notion y GitHub con los tokens obtenidos
    const notion = new Client({ auth: notionToken });
    const octokit = new Octokit({ auth: githubToken });

    // Consultar la base de datos de Notion
    const response = await notion.databases.query({ database_id: databaseId });

    for (const page of response.results) {
      const status = page.properties.Status.select.name;
      const taskName = page.properties.Name.title[0].text.content;

      if (status === "In Progress") {
        await createBranch(taskName, octokit);
      } else if (status === "Done") {
        await createPullRequest(taskName, octokit);
      }
    }

    res
      .status(200)
      .json({ message: "Branches and pull requests created successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

async function createBranch(taskName, octokit) {
  const branchName = `feature/${taskName.replace(/\s+/g, "-").toLowerCase()}`;
  const { data: baseBranchData } = await octokit.git.getRef({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    ref: `heads/${process.env.GITHUB_BASE_BRANCH}`,
  });

  const baseSha = baseBranchData.object.sha;

  await octokit.git.createRef({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });

  console.log(`Branch ${branchName} created successfully`);
}

async function createPullRequest(taskName, octokit) {
  const branchName = `feature/${taskName.replace(/\s+/g, "-").toLowerCase()}`;

  const { data: pullRequest } = await octokit.pulls.create({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    title: `PR: ${taskName}`,
    head: branchName,
    base: process.env.GITHUB_BASE_BRANCH,
    body: `Pull request for task: ${taskName}`,
  });

  console.log(`Pull Request created: ${pullRequest.html_url}`);
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
