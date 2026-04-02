// /client/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const userDataPath = path.join(app.getPath('userData'), 'WebManiaData');
if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

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