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

app.post("/notion-to-github", async (req, res) => {
  const { databaseId } = req.body;
  const token = req.headers.authorization.split(" ")[1];
  const decoded = jwt.verify(token, jwtSecret);

  try {
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
    const octokit = new octokit({ auth: githubToken });

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

app.get('/get-tokens', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const decoded = jwt.verify(token, jwtSecret);

  db.query(
      'SELECT notion_token, github_token FROM tokens WHERE user_id = ?',
      [decoded.id],
      (err, results) => {
          if (err) {
              return res.status(500).json({ error: err.message });
          }
          if (results.length === 0) {
              return res.status(404).json({ tokens: null });
          }
          res.status(200).json({ tokens: results[0] });
      }
  );
});

app.get('/notion-boards', async (req, res) => {
  const notionToken = req.headers.authorization.split(' ')[1];
  const notion = new Client({ auth: notionToken });

  try {
      const response = await notion.search({
          filter: {
              property: 'object',
              value: 'database',
          },
      });

      const boards = response.results.map((board) => ({
          id: board.id,
          name: board.title[0]?.plain_text || 'Untitled',
      }));

      res.status(200).json({ boards });
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
  }
});

app.get('/github-repos', async (req, res) => {
  const githubToken = req.headers.authorization.split(' ')[1];
  const octokit = new Octokit({ auth: githubToken });

  try {
      const response = await octokit.repos.listForAuthenticatedUser();
      const repos = response.data.map((repo) => ({
          id: repo.id,
          name: repo.name,
      }));

      res.status(200).json({ repos });
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
  }
});


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
