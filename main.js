// /main.js
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

// 屏蔽讨厌的 Electron 安全警告！
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// 1. 禁用掉帧率限制
app.commandLine.appendSwitch('disable-frame-rate-limit');
// 2. 彻底禁用垂直同步
app.commandLine.appendSwitch('disable-gpu-vsync');
// 3. 开启硬件加速（忽略黑名单）
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// 4. 修复部分系统的 ANGLE 及 GPU 沙盒崩溃报错
app.commandLine.appendSwitch('disable-gpu-sandbox');

const userDataPath = path.join(app.getPath('userData'), 'WebManiaData');
if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

// Read config before ready to apply command line switches
const configPath = path.join(userDataPath, 'sys_config.json');
let sysConfig = {};
try { if (fs.existsSync(configPath)) sysConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e){}

if (sysConfig.renderer === 'd3d12') app.commandLine.appendSwitch('use-angle', 'd3d12');
else if (sysConfig.renderer === 'd3d11') app.commandLine.appendSwitch('use-angle', 'd3d11');
else if (sysConfig.renderer === 'graphite') app.commandLine.appendSwitch('enable-skia-graphite');

global.USER_DATA_PATH = userDataPath;

const { startServer, winControl } = require('./server.js');

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

    // Kiosk 动态控制
    winControl.on('set-kiosk', (val) => {
        if (mainWindow) {
            mainWindow.setKiosk(val);
            // 修复：移除了引发报错的 globalShortcut.register('Super') 
            // 因为 Super 是修饰键，Electron 不允许单独作为主键注册
        }
    });

    mainWindow.on('closed', function () {
        globalShortcut.unregisterAll();
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