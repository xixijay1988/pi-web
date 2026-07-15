"use strict";

const { app, BrowserWindow, dialog, Menu, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const isDev = process.argv.includes("--dev") || process.env.PI_DESKTOP_DEV === "1";
const DEV_PORT = process.env.PI_DESKTOP_DEV_PORT || "30141";
const PROD_PORT = process.env.PI_DESKTOP_PORT || "30142";
// Production stays on loopback IP. Dev uses localhost so Next.js allowedDevOrigins
// does not block client hydration / HMR when the window origin is not trusted.
const HOST = "127.0.0.1";
const DEV_HOST = process.env.PI_DESKTOP_DEV_HOST || "localhost";

let mainWindow = null;
let serverProcess = null;
let isQuitting = false;

function getLogPath() {
  return path.join(app.getPath("userData"), "pi-desktop.log");
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(getLogPath(), line);
  } catch {
    // ignore logging failures
  }
  console.log(message);
}

function getWebRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "web");
  }
  return path.join(__dirname, "..");
}

function resolveNextBin(webRoot) {
  try {
    return require.resolve("next/dist/bin/next", { paths: [webRoot] });
  } catch {
    try {
      const nextPkg = require.resolve("next/package.json", { paths: [webRoot] });
      return path.join(path.dirname(nextPkg), "dist", "bin", "next");
    } catch {
      return path.join(webRoot, "node_modules", "next", "dist", "bin", "next");
    }
  }
}

function waitForServerOnHost(host, port, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host, port, path: "/", timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(
            new Error(`Server did not become ready on ${host}:${port} within ${timeoutMs}ms`)
          );
          return;
        }
        setTimeout(tryOnce, 300);
      });
      req.on("timeout", () => {
        req.destroy();
      });
    };
    tryOnce();
  });
}

function waitForServer(port, timeoutMs = 60000) {
  return waitForServerOnHost(HOST, port, timeoutMs);
}

function startProductionServer() {
  const webRoot = getWebRoot();
  const nextDir = path.join(webRoot, ".next");
  const nextBin = resolveNextBin(webRoot);
  const port = PROD_PORT;

  if (!fs.existsSync(nextDir)) {
    throw new Error(`Build artifacts not found at ${nextDir}`);
  }
  if (!fs.existsSync(nextBin)) {
    throw new Error(`Next.js binary not found at ${nextBin}`);
  }

  log(`Starting Next.js from ${webRoot} on ${HOST}:${port}`);
  log(`Using next bin: ${nextBin}`);
  log(`Using runtime: ${process.execPath}`);

  // Use Electron as Node so the app does not depend on a system Node install.
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(port),
  };

  serverProcess = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(port), "-H", HOST],
    {
      cwd: webRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    }
  );

  serverProcess.stdout.on("data", (chunk) => {
    log(`[next] ${chunk.toString().trimEnd()}`);
  });
  serverProcess.stderr.on("data", (chunk) => {
    log(`[next:err] ${chunk.toString().trimEnd()}`);
  });
  serverProcess.on("exit", (code, signal) => {
    log(`Next.js exited code=${code} signal=${signal}`);
    serverProcess = null;
    if (!isQuitting) {
      dialog.showErrorBox(
        "Pi Desktop",
        `The local server stopped unexpectedly (code=${code}).\n\nLog: ${getLogPath()}`
      );
      app.quit();
    }
  });

  return waitForServer(port).then(() => `http://${HOST}:${port}`);
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: "Pi Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    try {
      const parsed = new URL(target);
      if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
        return { action: "allow" };
      }
    } catch {
      // fall through
    }
    shell.openExternal(target);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, target) => {
    try {
      const parsed = new URL(target);
      if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
        event.preventDefault();
        shell.openExternal(target);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : [
          {
            label: "File",
            submenu: [{ role: "quit" }],
          },
        ]),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" }, { role: "front" }]
          : [{ role: "close" }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function stopServer() {
  if (!serverProcess) return;
  const child = serverProcess;
  serverProcess = null;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
      }
      setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
        }
      }, 2000).unref?.();
    }
  } catch (error) {
    log(`Failed to stop server: ${error.message}`);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Product name in macOS menu / about panel.
    app.setName("Pi Desktop");
    buildMenu();

    try {
      let url;
      if (isDev) {
        url = `http://${DEV_HOST}:${DEV_PORT}`;
        log(`Dev mode: loading ${url}`);
        try {
          await waitForServerOnHost(DEV_HOST, Number(DEV_PORT), 3000);
        } catch {
          throw new Error(
            `Dev server not reachable at ${url}. Start it first with: npm run dev`
          );
        }
      } else {
        url = await startProductionServer();
      }
      createWindow(url);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      const stack = error && error.stack ? error.stack : message;
      log(`Startup failed: ${stack}`);
      dialog.showErrorBox(
        "Pi Desktop failed to start",
        `${message}\n\nLog file:\n${getLogPath()}`
      );
      stopServer();
      app.quit();
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    stopServer();
  });

  app.on("window-all-closed", () => {
    isQuitting = true;
    stopServer();
    app.quit();
  });
}
