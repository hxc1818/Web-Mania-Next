// /main.js
const { app, BrowserWindow, WebContentsView, ipcMain, globalShortcut, session } = require('electron');
const path = require('path');
const fs = require('fs');

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-gpu-sandbox');
// 禁用 Blink 自动化标记，防止 Cloudflare Turnstile 检测到 webdriver 导致死循环与算力卡死
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
// 启用原生 WebGL 硬件加速
app.commandLine.appendSwitch('enable-webgl');

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
let osuView = null;
let isOsuBrowserVisible = false;
let osuTopOffset = 48;
let currentPort = 3000;
const activeDownloads = new Map();

function updateOsuViewBounds() {
    if (!mainWindow || mainWindow.isDestroyed() || !osuView) return;
    if (!isOsuBrowserVisible) return;
    const bounds = mainWindow.getContentBounds();
    const top = Math.max(0, Math.round(osuTopOffset || 48));
    osuView.setBounds({
        x: 0,
        y: top,
        width: Math.max(0, bounds.width),
        height: Math.max(0, bounds.height - top)
    });
}

function sendOsuNavState() {
    if (!mainWindow || mainWindow.isDestroyed() || !osuView || osuView.webContents.isDestroyed()) return;
    const wc = osuView.webContents;
    let canGoBack = false;
    let canGoForward = false;
    try {
        if (wc.navigationHistory) {
            canGoBack = wc.navigationHistory.canGoBack();
            canGoForward = wc.navigationHistory.canGoForward();
        } else if (typeof wc.canGoBack === 'function') {
            canGoBack = wc.canGoBack();
            canGoForward = wc.canGoForward();
        }
    } catch (e) {}
    mainWindow.webContents.send('osu-nav-state', {
        url: wc.getURL(),
        canGoBack,
        canGoForward,
        isLoading: wc.isLoading()
    });
}

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
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    const osuSession = session.fromPartition('persist:osu');

    // 动态提取原生 Chromium User-Agent 并剥除 Electron/应用特征，确保与底层 TLS/Sec-CH-UA 客户端指纹严格匹配
    const rawUA = session.defaultSession.getUserAgent();
    const CHROME_UA = rawUA
        .replace(/Electron\/[0-9\.]+\s?/g, '')
        .replace(/web-mania-next\/[0-9\.]+\s?/gi, '')
        .trim();
    osuSession.setUserAgent(CHROME_UA);

    const chromeMatch = rawUA.match(/Chrome\/([0-9]+)/);
    const chromeMajor = chromeMatch ? chromeMatch[1] : '130';
    const SEC_CH_UA = `"Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}", "Not?A_Brand";v="99"`;

    // 拦截请求头，确保所有请求（包括嵌套 iframe / Cloudflare Turnstile 验证请求）均保持标准 Chrome UA 和 Client Hints
    osuSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = details.requestHeaders;
        for (const key of Object.keys(headers)) {
            const lowerKey = key.toLowerCase();
            if (lowerKey === 'user-agent') {
                delete headers[key];
            } else if (lowerKey === 'sec-ch-ua') {
                headers[key] = SEC_CH_UA;
            } else if (lowerKey === 'sec-ch-ua-full-version-list') {
                headers[key] = headers[key].replace(/,?\s*"Electron";v="[^"]*"/gi, '');
            } else if (lowerKey === 'sec-ch-ua-mobile') {
                headers[key] = '?0';
            } else if (lowerKey === 'sec-ch-ua-platform') {
                headers[key] = '"Windows"';
            }
        }
        headers['User-Agent'] = CHROME_UA;
        callback({ requestHeaders: headers });
    });

    // 挂载专属防死循环与抹除 webdriver 的预加载脚本 (适配新旧 Electron API)
    const webviewPreload = path.join(__dirname, 'preload-webview.js');
    if (fs.existsSync(webviewPreload)) {
        try {
            if (typeof osuSession.registerPreloadScript === 'function') {
                osuSession.registerPreloadScript({
                    type: 'frame',
                    filePath: webviewPreload
                });
            } else if (typeof osuSession.setPreloads === 'function') {
                osuSession.setPreloads([webviewPreload]);
            }
        } catch (e) {}
    }

    osuSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(true);
    });

    // 使用独立顶层 WebContentsView 替代嵌套 <webview>，彻底隔离主窗口的 COOP/COEP 策略与渲染线程
    osuView = new WebContentsView({
        webPreferences: {
            session: osuSession,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            preload: webviewPreload,
            backgroundThrottling: false
        }
    });
    osuView.setBackgroundColor('#0d0e14');
    osuView.webContents.setUserAgent(CHROME_UA);

    const wc = osuView.webContents;
    wc.on('did-start-loading', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('osu-loading', true);
        }
        sendOsuNavState();
    });

    wc.on('did-stop-loading', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('osu-loading', false);
        }
        sendOsuNavState();
    });

    wc.on('did-navigate', () => sendOsuNavState());
    wc.on('did-navigate-in-page', () => sendOsuNavState());
    wc.on('did-fail-load', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('osu-loading', false);
        }
        sendOsuNavState();
    });

    wc.setWindowOpenHandler(({ url }) => {
        if (!url || url === 'about:blank' || 
            url.includes('challenges.cloudflare.com') || 
            url.includes('cloudflare.com') || 
            url.includes('turnstile') || 
            url.includes('/cdn-cgi/') || 
            url.includes('recaptcha') || 
            url.includes('hcaptcha')) {
            return { action: 'allow' };
        }
        if (url.includes('osu.ppy.sh')) {
            setImmediate(() => {
                if (!wc.isDestroyed()) {
                    wc.loadURL(url).catch(() => {});
                }
            });
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.on('resize', updateOsuViewBounds);
    mainWindow.on('maximize', updateOsuViewBounds);
    mainWindow.on('unmaximize', updateOsuViewBounds);
    mainWindow.on('restore', updateOsuViewBounds);
    mainWindow.on('enter-full-screen', updateOsuViewBounds);
    mainWindow.on('leave-full-screen', updateOsuViewBounds);

    // 当主窗口发生页面跳转（如进入 game.html）时，自动移除覆盖的 osuView
    mainWindow.webContents.on('did-navigate', () => {
        if (isOsuBrowserVisible && osuView && mainWindow && !mainWindow.isDestroyed()) {
            isOsuBrowserVisible = false;
            try { mainWindow.contentView.removeChildView(osuView); } catch (e) {}
        }
    });

    const setupDownloadListener = (targetSession) => {
        targetSession.on('will-download', (event, item, webContents) => {
            const url = item.getURL();
            const originalFilename = item.getFilename();
            const downloadId = 'dl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

            const tempDir = path.join(userDataPath, 'Temp', 'downloads');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            let safeName = originalFilename || 'beatmap.osz';
            if (!safeName.toLowerCase().endsWith('.osz')) {
                safeName += '.osz';
            }
            const savePath = path.join(tempDir, `${Date.now()}_${safeName}`);
            item.setSavePath(savePath);

            activeDownloads.set(downloadId, { item, savePath, filename: safeName });

            const send = (channel, data) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send(channel, data);
                }
            };

            const totalBytes = item.getTotalBytes();
            send('download-start', {
                id: downloadId,
                filename: safeName,
                url: url,
                totalBytes: totalBytes,
                receivedBytes: 0,
                percent: 0,
                state: 'downloading'
            });

            item.on('updated', (e, state) => {
                if (state === 'progressing') {
                    const total = item.getTotalBytes();
                    const received = item.getReceivedBytes();
                    const percent = total > 0 ? Math.floor((received / total) * 100) : 0;
                    send('download-progress', {
                        id: downloadId,
                        filename: safeName,
                        totalBytes: total,
                        receivedBytes: received,
                        percent: percent,
                        state: 'downloading'
                    });
                } else if (state === 'interrupted') {
                    send('download-error', {
                        id: downloadId,
                        filename: safeName,
                        state: 'interrupted',
                        error: '下载已中断'
                    });
                }
            });

            item.once('done', (e, state) => {
                activeDownloads.delete(downloadId);
                if (state === 'completed') {
                    send('download-done', {
                        id: downloadId,
                        filename: safeName,
                        savePath: savePath,
                        state: 'completed',
                        percent: 100
                    });
                } else {
                    send('download-error', {
                        id: downloadId,
                        filename: safeName,
                        state: state,
                        error: state === 'cancelled' ? '用户取消下载' : '下载失败'
                    });
                    try { if (fs.existsSync(savePath)) fs.unlinkSync(savePath); } catch (err) {}
                }
            });
        });
    };

    setupDownloadListener(osuSession);
    setupDownloadListener(session.defaultSession);

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
        if (osuView && !osuView.webContents.isDestroyed()) {
            try { osuView.webContents.close(); } catch (e) {}
            osuView = null;
        }
        mainWindow = null;
    });
}

ipcMain.on('cancel-download', (event, id) => {
    const task = activeDownloads.get(id);
    if (task && task.item) {
        task.item.cancel();
    }
});

ipcMain.on('clear-osu-cache', async () => {
    const osuSession = session.fromPartition('persist:osu');
    await osuSession.clearCache();
    await osuSession.clearStorageData({
        storages: ['cookies', 'cache', 'serviceworkers', 'cachestorage', 'websql', 'indexdb']
    });
    if (osuView && !osuView.webContents.isDestroyed()) {
        osuView.webContents.reloadIgnoringCache();
    }
});

ipcMain.on('osu-view-toggle', (event, { visible, topOffset }) => {
    if (!mainWindow || mainWindow.isDestroyed() || !osuView) return;
    if (typeof topOffset === 'number' && topOffset > 0) {
        osuTopOffset = topOffset;
    }
    isOsuBrowserVisible = !!visible;
    if (isOsuBrowserVisible) {
        try {
            mainWindow.contentView.addChildView(osuView);
        } catch (e) {}
        updateOsuViewBounds();
        const curUrl = osuView.webContents.getURL();
        if (!curUrl || curUrl === 'about:blank') {
            osuView.webContents.loadURL('https://osu.ppy.sh/beatmapsets').catch(() => {});
        }
        osuView.webContents.focus();
        sendOsuNavState();
    } else {
        try {
            mainWindow.contentView.removeChildView(osuView);
        } catch (e) {}
        mainWindow.webContents.focus();
    }
});

ipcMain.on('osu-view-bounds', (event, { topOffset }) => {
    if (typeof topOffset === 'number' && topOffset >= 0) {
        osuTopOffset = topOffset;
        updateOsuViewBounds();
    }
});

ipcMain.on('osu-view-nav', (event, { action, url }) => {
    if (!osuView || osuView.webContents.isDestroyed()) return;
    const wc = osuView.webContents;
    if (action === 'back') {
        if (wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack()) {
            wc.goBack();
        }
    } else if (action === 'forward') {
        if (wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward()) {
            wc.goForward();
        }
    } else if (action === 'reload') {
        wc.reload();
    } else if (action === 'reloadIgnoringCache') {
        wc.reloadIgnoringCache();
    } else if (action === 'home') {
        wc.loadURL('https://osu.ppy.sh/beatmapsets').catch(() => {});
    } else if (action === 'go' && url) {
        wc.loadURL(url).catch(() => {});
    }
});

// 监听所有 WebContents（包括 osuView），确保 Alt+B / ESC 能全局响应，F12 可快速排查调试
app.on('web-contents-created', (event, contents) => {
    contents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.alt && (input.key === 'b' || input.key === 'B' || input.code === 'KeyB')) {
            event.preventDefault();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('toggle-osu-browser');
            }
        }
        if (input.type === 'keyDown' && input.key === 'Escape' && isOsuBrowserVisible && osuView && contents === osuView.webContents) {
            event.preventDefault();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('close-osu-browser');
            }
        }
        if (input.type === 'keyDown' && input.key === 'F12') {
            event.preventDefault();
            if (!contents.isDestroyed()) {
                if (contents.isDevToolsOpened()) {
                    contents.closeDevTools();
                } else {
                    contents.openDevTools({ mode: 'detach' });
                }
            }
        }
    });
});

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
