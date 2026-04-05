// /public/js/common.js
const LOCAL_API_URL = '/api'; 
const REMOTE_WS_URL = 'ws://hahai18.info:2052/';
const REMOTE_API_URL = 'http://hahai18.info:2052/api';

class CustomSocket {
    constructor() {
        this.ws = new WebSocket(REMOTE_WS_URL);
        this.handlers = {};
        this.connected = false;

        this.ws.onopen = () => { this.connected = true; if(this.handlers['connect']) this.handlers['connect'].forEach(cb=>cb()); };
        this.ws.onmessage = (e) => { try { const { type, data } = JSON.parse(e.data); if(this.handlers[type]) this.handlers[type].forEach(cb=>cb(data)); } catch (err) {} };
        this.ws.onclose = () => { this.connected = false; if(this.handlers['disconnect']) this.handlers['disconnect'].forEach(cb=>cb()); };
    }
    on(event, callback) { if(!this.handlers[event]) this.handlers[event] = []; this.handlers[event].push(callback); }
    emit(event, data) {
        const payload = JSON.stringify({ type: event, data });
        if(this.connected && this.ws.readyState === 1) this.ws.send(payload);
        else { const iv = setInterval(() => { if(this.connected && this.ws.readyState === 1) { this.ws.send(payload); clearInterval(iv); } }, 100); }
    }
    disconnect() { this.ws.close(); }
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// 动态生成1-18K默认快捷键
function getDefaultBinds(k) {
    const binds = [];
    for(let i = 0; i < k; i++) binds.push(['', '']);
    
    // 内置一部分常用K数的默认按键方案
    if(k === 1) { binds[0][0]='Space'; }
    else if(k === 2) { binds[0][0]='KeyF'; binds[1][0]='KeyJ'; }
    else if(k === 3) { binds[0][0]='KeyF'; binds[1][0]='Space'; binds[2][0]='KeyJ'; }
    else if(k === 4) { binds[0][0]='KeyD'; binds[1][0]='KeyF'; binds[2][0]='KeyJ'; binds[3][0]='KeyK'; }
    else if(k === 5) { binds[0][0]='KeyD'; binds[1][0]='KeyF'; binds[2][0]='Space'; binds[3][0]='KeyJ'; binds[4][0]='KeyK'; }
    else if(k === 6) { binds[0][0]='KeyS'; binds[1][0]='KeyD'; binds[2][0]='KeyF'; binds[3][0]='KeyJ'; binds[4][0]='KeyK'; binds[5][0]='KeyL'; }
    else if(k === 7) { binds[0][0]='KeyS'; binds[1][0]='KeyD'; binds[2][0]='KeyF'; binds[3][0]='Space'; binds[4][0]='KeyJ'; binds[5][0]='KeyK'; binds[6][0]='KeyL'; }
    else if(k === 8) { binds[0][0]='KeyA'; binds[1][0]='KeyS'; binds[2][0]='KeyD'; binds[3][0]='KeyF'; binds[4][0]='KeyJ'; binds[5][0]='KeyK'; binds[6][0]='KeyL'; binds[7][0]='Semicolon'; }
    else if(k === 9) { binds[0][0]='KeyA'; binds[1][0]='KeyS'; binds[2][0]='KeyD'; binds[3][0]='KeyF'; binds[4][0]='Space'; binds[5][0]='KeyJ'; binds[6][0]='KeyK'; binds[7][0]='KeyL'; binds[8][0]='Semicolon'; }
    // 大于9K留空，由硬核玩家自己设置
    return binds;
}

const defaultSettings = { 
    offset: 0, scrollSpeed: 1000, trackScale: 1.0, bgBlur: 8, bgDim: 80, 
    laneColors: ['#ffffff', '#34d399', '#fbbf24', '#ffffff'],
    keyBinds: {} 
};

// 初始化所有1-18K默认空表
for (let i = 1; i <= 18; i++) {
    defaultSettings.keyBinds[i] = getDefaultBinds(i);
}

let userSettings = JSON.parse(localStorage.getItem('webmania_settings')) || defaultSettings;
if(userSettings.bgDim === undefined) userSettings.bgDim = 80;
if(!userSettings.laneColors) userSettings.laneColors = ['#ffffff', '#34d399', '#fbbf24', '#ffffff'];

// 数据结构迁移（兼容老版本4K的死数据结构）
if (!userSettings.keyBinds || Array.isArray(userSettings.keyBinds)) {
    const oldBinds = Array.isArray(userSettings.keyBinds) ? userSettings.keyBinds : getDefaultBinds(4);
    userSettings.keyBinds = {};
    for (let i = 1; i <= 18; i++) userSettings.keyBinds[i] = getDefaultBinds(i);
    userSettings.keyBinds[4] = oldBinds; // 保留老玩家的4K设置
    localStorage.setItem('webmania_settings', JSON.stringify(userSettings));
} else {
    // 确保 1-18K 键位对象绝对完整
    for (let i = 1; i <= 18; i++) {
        if (!userSettings.keyBinds[i]) userSettings.keyBinds[i] = getDefaultBinds(i);
    }
}

let history = JSON.parse(localStorage.getItem('webmania_history') || '{}');

function getFakeStars(version) {
    const v = version.toLowerCase();
    if (v.includes('easy') || v.includes('beginner')) return 1.5;
    if (v.includes('normal') || v.includes('basic')) return 2.2;
    if (v.includes('hard') || v.includes('advanced')) return 3.5;
    if (v.includes('insane') || v.includes('hyper')) return 4.8;
    if (v.includes('expert') || v.includes('extra') || v.includes('extreme')) return 6.0;
    if (v.includes('master') || v.includes('supreme')) return 7.5;
    return 4.0; 
}

function getStarColor(stars) {
    if (stars < 0.1) return '#aaaaaa';
    if (stars >= 9.0) return '#000000';
    const colors = [
        { s: 0.1, c: [66, 144, 251] }, 
        { s: 1.25, c: [79, 192, 255] },
        { s: 2.0, c: [79, 255, 79] },  
        { s: 2.5, c: [246, 240, 92] },  
        { s: 3.3, c: [255, 128, 104] }, 
        { s: 4.2, c: [255, 46, 46] },   
        { s: 4.9, c: [200, 32, 80] },   
        { s: 5.8, c: [101, 99, 222] },  
        { s: 6.7, c: [24, 21, 142] },   
        { s: 7.7, c: [0, 0, 0] }        
    ];
    for (let i = 0; i < colors.length - 1; i++) {
        if (stars >= colors[i].s && stars < colors[i+1].s) {
            const t = (stars - colors[i].s) / (colors[i+1].s - colors[i].s);
            const r = Math.round(colors[i].c[0] + t * (colors[i+1].c[0] - colors[i].c[0]));
            const g = Math.round(colors[i].c[1] + t * (colors[i+1].c[1] - colors[i].c[1]));
            const b = Math.round(colors[i].c[2] + t * (colors[i+1].c[2] - colors[i].c[2]));
            return `rgb(${r},${g},${b})`;
        }
    }
    return '#000000';
}