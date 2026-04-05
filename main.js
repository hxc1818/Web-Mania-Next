// /main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 屏蔽讨厌的 Electron 安全警告！
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const userDataPath = path.join(app.getPath('userData'), 'WebManiaData');
if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

// Read config before ready to apply command line switches
const configPath = path.join(userDataPath, 'sys_config.json');
let sysConfig = {};
try { if (fs.existsSync(configPath)) sysConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e){}

if (sysConfig.renderer === 'd3d12') app.commandLine.appendSwitch('use-angle', 'd3d12');
else if (sysConfig.renderer === 'd3d11') app.commandLine.appendSwitch('use-angle', 'd3d11');
else if (sysConfig.renderer === 'graphite') app.commandLine.appendSwitch('enable-skia-graphite');

if (sysConfig.fpsLimit === 'unlimited') {
    app.commandLine.appendSwitch('disable-frame-rate-limit');
}

global.USER_DATA_PATH = userDataPath;

const { startServer } = require('./server.js');

let mainWindow;
let currentPort = 3000;

async function createWindow() {
    currentPort = await startServer(3000, userDataPath);

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        title: 'Web Mania Next',
        autoHideMenuBar: true,
        backgroundColor: '#0f0f13',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadURL(`http://localhost:${currentPort}`);

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
        process.exit(0);
    }
});