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

const defaultSettings = { 
    offset: 0, scrollSpeed: 1000, trackScale: 1.0, bgBlur: 8, bgDim: 80, 
    laneColors: ['#ffffff', '#34d399', '#34d399', '#ffffff'],
    keyBinds: [['KeyD', ''], ['KeyF', ''], ['KeyJ', ''], ['KeyK', '']] 
};

let userSettings = JSON.parse(localStorage.getItem('webmania_settings')) || defaultSettings;
if(userSettings.bgDim === undefined) userSettings.bgDim = 80;
if(!userSettings.laneColors) userSettings.laneColors = ['#ffffff', '#34d399', '#34d399', '#ffffff'];
if(!userSettings.keyBinds) userSettings.keyBinds = [['KeyD', ''], ['KeyF', ''], ['KeyJ', ''], ['KeyK', '']];
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