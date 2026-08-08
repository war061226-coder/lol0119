const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const http = require("node:http");

const PORT = 5000;
let logFile;

function log(message, error) {
  const line = `[${new Date().toISOString()}] ${message}${error ? `\n${error.stack || error}` : ""}\n`;
  try {
    if (logFile) fs.appendFileSync(logFile, line, "utf8");
  } catch {
    // Logging must never prevent the error page from appearing.
  }
  console.error(line);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function copyIfMissing(source, destination) {
  if (fs.existsSync(destination) || !fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get(`http://127.0.0.1:${PORT}`, (response) => {
          response.resume();
          response.statusCode >= 200 && response.statusCode < 500
            ? resolve()
            : reject(new Error(`서버 응답 코드: ${response.statusCode}`));
        });
        request.on("error", reject);
        request.setTimeout(1000, () => {
          request.destroy();
          reject(new Error("서버 응답 시간 초과"));
        });
      });
      return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("로컬 서버가 시작되지 않았습니다.");
}

async function startServer() {
  const projectRoot = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, "..");
  const bundledRoot = app.isPackaged ? process.resourcesPath : path.join(projectRoot, "dist");
  const bundledDataDir = path.join(bundledRoot, "data");
  const dataDir = path.join(app.getPath("userData"), "data");
  const publicDir = path.join(bundledRoot, "public");

  fs.mkdirSync(dataDir, { recursive: true });
  copyIfMissing(path.join(bundledDataDir, "manual-players.json"), path.join(dataDir, "manual-players.json"));
  copyIfMissing(path.join(bundledDataDir, "balance-history.json"), path.join(dataDir, "balance-history.json"));

  process.env.NODE_ENV = "production";
  process.env.PORT = String(PORT);
  process.env.LOL_BALANCER_DATA_DIR = dataDir;
  process.env.LOL_BALANCER_PUBLIC_DIR = publicDir;

  const serverEntry = path.join(projectRoot, "dist", "index.js");
  const serverModule = await import(pathToFileURL(serverEntry).href);
  if (serverModule.serverReady) {
    await serverModule.serverReady;
  }
  await waitForServer();
}

function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "build", "icon.png")
    : path.join(__dirname, "..", "build", "icon.png");
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#0b0d0f",
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  return window;
}

async function showError(window, error) {
  log("프로그램을 시작하지 못했습니다.", error);
  const detail = escapeHtml(error?.message || error);
  const logPath = escapeHtml(logFile || "로그 파일을 만들지 못했습니다.");
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <html lang="ko">
      <meta charset="utf-8">
      <title>LoL 커스텀 게임 밸런서 오류</title>
      <style>
        body { margin: 0; padding: 40px; background: #0b0d0f; color: #f4f4f5; font-family: sans-serif; }
        main { max-width: 760px; margin: 0 auto; padding: 28px; border: 1px solid #3f454d; border-radius: 12px; background: #181b20; }
        h1 { margin-top: 0; color: #f87171; }
        code { display: block; margin: 16px 0; padding: 14px; white-space: pre-wrap; overflow-wrap: anywhere; background: #0b0d0f; border-radius: 8px; color: #fca5a5; }
        p { color: #c5c8ce; line-height: 1.6; }
      </style>
      <main>
        <h1>프로그램을 시작하지 못했습니다.</h1>
        <p>아래 오류 내용을 확인해주세요. 프로그램을 다시 실행하기 전에 기존 프로그램 창이 모두 닫혔는지도 확인해주세요.</p>
        <code>${detail}</code>
        <p>상세 로그 파일:</p>
        <code>${logPath}</code>
      </main>
    </html>
  `)}`);
}

process.on("uncaughtException", (error) => {
  log("처리되지 않은 오류가 발생했습니다.", error);
});

process.on("unhandledRejection", (error) => {
  log("처리되지 않은 비동기 오류가 발생했습니다.", error);
});

app.whenReady().then(async () => {
  logFile = path.join(app.getPath("userData"), "startup.log");
  const window = createWindow();
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html><html lang="ko"><meta charset="utf-8">
    <style>body{margin:0;background:#0b0d0f;color:#f4f4f5;font-family:sans-serif;display:grid;place-items:center;height:100vh}main{text-align:center}p{color:#a1a1aa}</style>
    <main><h1>LoL 커스텀 게임 밸런서</h1><p>프로그램을 시작하는 중입니다...</p></main>
  `)}`);
  try {
    await startServer();
    await window.loadURL(`http://127.0.0.1:${PORT}`);
  } catch (error) {
    await showError(window, error);
  }
}).catch((error) => {
  log("Electron을 시작하지 못했습니다.", error);
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});