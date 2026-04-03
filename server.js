const express = require("express");
const SftpClient = require("ssh2-sftp-client");
const multer = require("multer");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const upload = multer({ dest: "uploads/" });

let sftp = new SftpClient();
let connected = false;

// CONNECT
app.post("/connect", async (req, res) => {
  try {
    await sftp.connect({
      host: req.body.host,
      port: parseInt(req.body.port),
      username: req.body.user,
      password: req.body.pass
    });

    connected = true;
    res.json({ success: true });

  } catch (e) {
    connected = false;
    res.json({ success: false, error: e.message });
  }
});

// FILE LIST
app.get("/files", async (req, res) => {
  if (!connected) return res.status(500).json({ error: "Not connected" });

  try {
    let list = await sftp.list(req.query.path);

    res.json({
      files: list.map(f => ({
        name: f.name,
        isDir: f.type === "d",
        size: f.size,
        modifyTime: f.modifyTime
      }))
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE
app.post("/delete", async (req, res) => {
  try {
    await sftp.delete(req.body.path);
    res.json({ ok: true });
  } catch {
    await sftp.rmdir(req.body.path, true);
    res.json({ ok: true });
  }
});

// UPLOAD
app.post("/upload", upload.single("file"), async (req, res) => {
  await sftp.put(req.file.path, req.body.path + req.file.originalname);
  fs.unlinkSync(req.file.path);
  res.json({ ok: true });
});

// MKDIR
app.post("/mkdir", async (req, res) => {
  await sftp.mkdir(req.body.path, true);
  res.json({ ok: true });
});

// RENAME
app.post("/rename", async (req, res) => {
  await sftp.rename(req.body.oldPath, req.body.newPath);
  res.json({ ok: true });
});

// READ FILE
app.get("/read", async (req, res) => {
  let data = await sftp.get(req.query.path);
  res.json({ content: data.toString() });
});

// WRITE FILE
app.post("/write", async (req, res) => {
  await sftp.put(Buffer.from(req.body.content), req.body.path);
  res.json({ ok: true });
});

app.listen(3000, () => console.log("Server running on port 3000"));
