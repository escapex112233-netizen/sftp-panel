const express = require("express");
const SftpClient = require("ssh2-sftp-client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const upload = multer({ dest: "uploads/" });

const SECRET = "supersecretkey";

// ===== USERS =====
function loadUsers(){
  return JSON.parse(fs.readFileSync("users.json"));
}
function saveUsers(users){
  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
}

// ===== AUTH =====
function auth(req,res,next){
  let token = req.headers.authorization;
  if(!token) return res.sendStatus(401);

  try{
    let data = jwt.verify(token, SECRET);
    req.user = data;
    next();
  }catch{
    res.sendStatus(403);
  }
}

// ===== SFTP CONNECTIONS =====
let connections = {};

function getSftp(userId){
  return connections[userId];
}

// ===== REGISTER =====
app.post("/register", async (req,res)=>{
  let { username, email, password } = req.body;

  let users = loadUsers();

  if(users.find(u => u.email === email)){
    return res.json({ success:false, message:"Email exists" });
  }

  let hash = await bcrypt.hash(password, 10);

  users.push({
    id: uuidv4(),
    username,
    email,
    password: hash
  });

  saveUsers(users);
  res.json({ success:true });
});

// ===== LOGIN =====
app.post("/login", async (req,res)=>{
  let { email, password } = req.body;

  let users = loadUsers();
  let user = users.find(u => u.email === email);

  if(!user) return res.json({ success:false });

  let valid = await bcrypt.compare(password, user.password);
  if(!valid) return res.json({ success:false });

  let token = jwt.sign({ id:user.id }, SECRET);
  res.json({ success:true, token });
});

// ===== CONNECT SFTP =====
app.post("/connect", auth, async (req,res)=>{
  try{
    let sftp = new SftpClient();

    await sftp.connect({
      host:req.body.host,
      port:parseInt(req.body.port),
      username:req.body.user,
      password:req.body.pass
    });

    connections[req.user.id] = sftp;

    res.json({ success:true });

  }catch(e){
    res.json({ success:false, error:e.message });
  }
});

// ===== FILE LIST =====
app.get("/files", auth, async (req,res)=>{
  let sftp = getSftp(req.user.id);
  if(!sftp) return res.status(400).json({ error:"Not connected" });

  try{
    let list = await sftp.list(req.query.path);

    res.json({
      files:list.map(f=>({
        name:f.name,
        isDir:f.type==="d",
        size:f.size,
        modifyTime:f.modifyTime
      }))
    });

  }catch(e){
    res.status(500).json({ error:e.message });
  }
});

// ===== DELETE =====
app.post("/delete", auth, async (req,res)=>{
  let sftp = getSftp(req.user.id);

  try{
    await sftp.delete(req.body.path);
  }catch{
    await sftp.rmdir(req.body.path,true);
  }

  res.json({ ok:true });
});

// ===== UPLOAD =====
app.post("/upload", auth, upload.single("file"), async (req,res)=>{
  let sftp = getSftp(req.user.id);

  await sftp.put(req.file.path, req.body.path + req.file.originalname);
  fs.unlinkSync(req.file.path);

  res.json({ ok:true });
});

// ===== MKDIR =====
app.post("/mkdir", auth, async (req,res)=>{
  let sftp = getSftp(req.user.id);
  await sftp.mkdir(req.body.path,true);
  res.json({ ok:true });
});

// ===== RENAME =====
app.post("/rename", auth, async (req,res)=>{
  let sftp = getSftp(req.user.id);
  await sftp.rename(req.body.oldPath, req.body.newPath);
  res.json({ ok:true });
});

// ===== READ =====
app.get("/read", auth, async (req,res)=>{
  let sftp = getSftp(req.user.id);
  let data = await sftp.get(req.query.path);
  res.json({ content:data.toString() });
});

// ===== WRITE =====
app.post("/write", auth, async (req,res)=>{
  let sftp = getSftp(req.user.id);
  await sftp.put(Buffer.from(req.body.content), req.body.path);
  res.json({ ok:true });
});

app.listen(3000, ()=>console.log("Server running on port 3000"));
