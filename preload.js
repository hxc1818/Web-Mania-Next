// /preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onDownloadStart: (callback) => {
        ipcRenderer.on('download-start', (_event, data) => callback(data));
    },
    onDownloadProgress: (callback) => {
        ipcRenderer.on('download-progress', (_event, data) => callback(data));
    },
    onDownloadDone: (callback) => {
        ipcRenderer.on('download-done', (_event, data) => callback(data));
    },
    onDownloadError: (callback) => {
        ipcRenderer.on('download-error', (_event, data) => callback(data));
    },
    onToggleBrowser: (callback) => {
        ipcRenderer.on('toggle-osu-browser', (_event, data) => callback(data));
    },
    onCloseBrowser: (callback) => {
        ipcRenderer.on('close-osu-browser', (_event, data) => callback(data));
    },
    onOsuNavState: (callback) => {
        ipcRenderer.on('osu-nav-state', (_event, data) => callback(data));
    },
    onOsuLoading: (callback) => {
        ipcRenderer.on('osu-loading', (_event, isLoading) => callback(isLoading));
    },
    setOsuViewVisible: (visible, topOffset) => {
        ipcRenderer.send('osu-view-toggle', { visible, topOffset });
    },
    updateOsuViewBounds: (topOffset) => {
        ipcRenderer.send('osu-view-bounds', { topOffset });
    },
    osuNavAction: (action, url) => {
        ipcRenderer.send('osu-view-nav', { action, url });
    },
    cancelDownload: (id) => {
        ipcRenderer.send('cancel-download', id);
    },
    clearOsuCache: () => {
        ipcRenderer.send('clear-osu-cache');
    }
});
