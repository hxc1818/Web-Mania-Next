// /main.js
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-gpu-sandbox');
const userDataPath = path.join(app.getPath('userData'), 'WebManiaData');
if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

// Read config before ready to apply command line switches
const configPath = path.join(userDataPath, 'sys_config.json');
let sysConfig = {};
try { if (fs.existsSync(configPath)) sysConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e){}

const enabledFeatures = ['SharedArrayBuffer'];
if (sysConfig.renderer === 'graphite') {
    enabledFeatures.push('SkiaGraphite');
    app.commandLine.appendSwitch('use-dawn-backend', 'd3d12'); 
}
app.commandLine.appendSwitch('enable-features', enabledFeatures.join(','));

if (sysConfig.renderer === 'd3d12') app.commandLine.appendSwitch('use-angle', 'd3d12');
else if (sysConfig.renderer === 'd3d11') app.commandLine.appendSwitch('use-angle', 'd3d11');

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

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                autoHideMenuBar: true
            }
        };
    });

    mainWindow.webContents.on('did-create-window', (childWindow, { url }) => {
        if (url && url.includes('keybinds.html')) {
            childWindow.maximize();
            childWindow.webContents.on('did-finish-load', () => {
                childWindow.maximize();
            });
        }
    });

    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'pointerLock') {
            return callback(true);
        }
        callback(true);
    });

    // Kiosk 动态控制
    winControl.on('set-kiosk', (val) => {
        if (mainWindow) {
            mainWindow.setKiosk(val);
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