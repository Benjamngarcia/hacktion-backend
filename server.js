// require("dotenv").config();
// const express = require("express");
// const bodyParser = require("body-parser");
// const bcrypt = require("bcryptjs");
// const mysql = require("mysql2");
// const fs = require("fs");
// const cors = require("cors");
// const { Client } = require('@notionhq/client');  // Importa el cliente de Notion
// const { Octokit } = require('@octokit/rest');  // Importa Octokit para GitHub

// const app = express();
// const port = 8080;

// app.use(bodyParser.json());

// app.use(cors({ origin: "http://localhost:3000" }));

// const db = mysql.createConnection({
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
//   port: process.env.DB_PORT,
//   ssl: {
//     ca: fs.readFileSync(process.env.DB_SSL_CA),
//   },
// });

// db.connect((err) => {
//   if (err) {
//     console.error("Error connecting to the database:", err);
//     return;
//   }
//   console.log("Connected to the database");
// });

// app.post("/register", async (req, res) => {
//   const { name, lastname, email, password } = req.body;
//   const hashedPassword = await bcrypt.hash(password, 8);

//   db.query(
//     "INSERT INTO usuarios (nombre, apellido, correo, password) VALUES (?, ?, ?, ?)",
//     [name, lastname, email, hashedPassword],
//     (err, result) => {
//       if (err) {
//         return res.status(500).json({ error: err.message });
//       }
//       res.status(201).json({ message: "User registered successfully" });
//     }
//   );
// });

// app.post("/login", (req, res) => {
//   const { email, password } = req.body;

//   db.query(
//     "SELECT * FROM usuarios WHERE correo = ?",
//     [email],
//     async (err, results) => {
//       if (err) {
//         return res.status(500).json({ error: err.message });
//       }
//       if (results.length === 0) {
//         return res.status(400).json({ error: "User not found" });
//       }

//       const user = results[0];
//       const isPasswordValid = await bcrypt.compare(password, user.password);

//       if (!isPasswordValid) {
//         return res.status(400).json({ error: "Invalid password" });
//       }

//       res.json({ message: "Login successful", idUsuario: user.id_usuario});
//     }
//   );
// });

// app.post("/saveToken", (req, res) => {
//   const { notionToken, githubToken, idUsuario } = req.body;
//   db.query(
//     "INSERT INTO tokens (id_usuario, notion_token, github_token) VALUES (?, ?, ?)",
//     [idUsuario, notionToken, githubToken],
//     (err, result) => {
//       if (err) {
//         return res.status(500).json({ error: err.message });
//       }
//       res.status(201).json({ message: "Tokens saved successfully" });
//     }
//   );
// });

// app.post("/notion-to-github", async (req, res) => {
//   const { databaseId, idUsuario } = req.body;
//   try {
//     const [rows] = await db
//       .promise()
//       .query(
//         "SELECT notion_token, github_token FROM tokens WHERE id_usuario = ?",
//         [idUsuario]
//       );

//     if (rows.length === 0) {
//       return res.status(404).json({ error: "Tokens not found" });
//     }

//     const notionToken = rows[0].notion_token;
//     const githubToken = rows[0].github_token;

//     // Configurar clientes de Notion y GitHub con los tokens obtenidos
//     const notion = new Client({ auth: notionToken });
//     const octokit = new Octokit({ auth: githubToken });

//     // Consultar la base de datos de Notion
//     const response = await notion.databases.query({ database_id: databaseId });

//     for (const page of response.results) {
//       const status = page.properties.Status.select.name;
//       const taskName = page.properties.Name.title[0].text.content;

//       if (status === "In Progress") {
//         await createBranch(taskName, octokit);
//       } else if (status === "Done") {
//         await createPullRequest(taskName, octokit);
//       }
//     }

//     res
//       .status(200)
//       .json({ message: "Branches and pull requests created successfully" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: error.message });
//   }
// });

// async function createBranch(taskName, octokit) {
//   const branchName = `feature/${taskName.replace(/\s+/g, "-").toLowerCase()}`;
//   const { data: baseBranchData } = await octokit.git.getRef({
//     owner: process.env.GITHUB_OWNER,
//     repo: process.env.GITHUB_REPO,
//     ref: `heads/${process.env.GITHUB_BASE_BRANCH}`,
//   });

//   const baseSha = baseBranchData.object.sha;

//   await octokit.git.createRef({
//     owner: process.env.GITHUB_OWNER,
//     repo: process.env.GITHUB_REPO,
//     ref: `refs/heads/${branchName}`,
//     sha: baseSha,
//   });

//   console.log(`Branch ${branchName} created successfully`);
// }

// async function createPullRequest(taskName, octokit) {
//   const branchName = `feature/${taskName.replace(/\s+/g, "-").toLowerCase()}`;

//   const { data: pullRequest } = await octokit.pulls.create({
//     owner: process.env.GITHUB_OWNER,
//     repo: process.env.GITHUB_REPO,
//     title: `PR: ${taskName}`,
//     head: branchName,
//     base: process.env.GITHUB_BASE_BRANCH,
//     body: `Pull request for task: ${taskName}`,
//   });

//   console.log(`Pull Request created: ${pullRequest.html_url}`);
// }

// app.get("/get-tokens", (req, res) => {
//   const { idUsuario } = req.query;
//   console.log(req)
//   db.query(
//     "SELECT notion_token, github_token FROM tokens WHERE id_usuario = ?",
//     [idUsuario],
//     (err, results) => {
//       if (err) {
//         return res.status(500).json({ error: err.message });
//       }
//       if (results.length === 0) {
//         return res.status(404).json({ tokens: null });
//       }
//       res.status(200).json({ tokens: results[0] });
//     }
//   );
// });

// app.get("/notion-boards", async (req, res) => {
//   const { notionToken } = req.body;
//   const notion = new Client({ auth: notionToken });

//   try {
//     const response = await notion.search({
//       filter: {
//         property: "object",
//         value: "database",
//       },
//     });

//     const boards = response.results.map((board) => ({
//       id: board.id,
//       name: board.title[0]?.plain_text || "Untitled",
//     }));

//     res.status(200).json({ boards });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: error.message });
//   }
// });

// app.get("/github-repos", async (req, res) => {
//   const { githubToken } = req.body;
//   const octokit = new octokit({ auth: githubToken });

//   try {
//     const response = await octokit.repos.listForAuthenticatedUser();
//     const repos = response.data.map((repo) => ({
//       id: repo.id,
//       name: repo.name,
//     }));

//     res.status(200).json({ repos });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: error.message });
//   }
// });

// app.listen(port, () => {
//   console.log(`Server is running on port ${port}`);
// });






// server.mjs

import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2';
import fs from 'fs';
import cors from 'cors';
import { Client } from '@notionhq/client';
import { Octokit } from '@octokit/rest';

dotenv.config();

const app = express();
const port = 8080;

app.use(bodyParser.json());

app.use(cors({ origin: "http://localhost:3000" }));

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
    "SELECT * FROM usuarios WHERE correo = ?",
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

      res.json({ message: "Login successful", idUsuario: user.id_usuario});
    }
  );
});

app.post("/saveToken", (req, res) => {
  const { notionToken, githubToken, idUsuario } = req.body;
  db.query(
    "INSERT INTO tokens (id_usuario, notion_token, github_token) VALUES (?, ?, ?)",
    [idUsuario, notionToken, githubToken],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ message: "Tokens saved successfully" });
    }
  );
});

app.post("/notion-to-github", async (req, res) => {
  const { databaseId, idUsuario } = req.body;
  try {
    const [rows] = await db
      .promise()
      .query(
        "SELECT notion_token, github_token FROM tokens WHERE id_usuario = ?",
        [idUsuario]
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

app.get("/get-tokens", (req, res) => {
  const { idUsuario } = req.query;
  console.log(req)
  db.query(
    "SELECT notion_token, github_token FROM tokens WHERE id_usuario = ?",
    [idUsuario],
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

app.get("/notion-boards", async (req, res) => {
  const { notionToken } = req.body;
  const notion = new Client({ auth: notionToken });

  try {
    const response = await notion.search({
      filter: {
        property: "object",
        value: "database",
      },
    });

    const boards = response.results.map((board) => ({
      id: board.id,
      name: board.title[0]?.plain_text || "Untitled",
    }));

    res.status(200).json({ boards });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/github-repos", async (req, res) => {
  const { githubToken } = req.body;
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
