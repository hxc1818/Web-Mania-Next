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

function getDefaultBinds(k) {
    const binds = [];
    for(let i = 0; i < k; i++) binds.push(['', '']);
    
    if(k === 1) { binds[0][0]='Space'; }
    else if(k === 2) { binds[0][0]='KeyF'; binds[1][0]='KeyJ'; }
    else if(k === 3) { binds[0][0]='KeyF'; binds[1][0]='Space'; binds[2][0]='KeyJ'; }
    else if(k === 4) { binds[0][0]='KeyD'; binds[1][0]='KeyF'; binds[2][0]='KeyJ'; binds[3][0]='KeyK'; }
    else if(k === 5) { binds[0][0]='KeyD'; binds[1][0]='KeyF'; binds[2][0]='Space'; binds[3][0]='KeyJ'; binds[4][0]='KeyK'; }
    else if(k === 6) { binds[0][0]='KeyS'; binds[1][0]='KeyD'; binds[2][0]='KeyF'; binds[3][0]='KeyJ'; binds[4][0]='KeyK'; binds[5][0]='KeyL'; }
    else if(k === 7) { binds[0][0]='KeyS'; binds[1][0]='KeyD'; binds[2][0]='KeyF'; binds[3][0]='Space'; binds[4][0]='KeyJ'; binds[5][0]='KeyK'; binds[6][0]='KeyL'; }
    else if(k === 8) { binds[0][0]='KeyA'; binds[1][0]='KeyS'; binds[2][0]='KeyD'; binds[3][0]='KeyF'; binds[4][0]='KeyJ'; binds[5][0]='KeyK'; binds[6][0]='KeyL'; binds[7][0]='Semicolon'; }
    else if(k === 9) { binds[0][0]='KeyA'; binds[1][0]='KeyS'; binds[2][0]='KeyD'; binds[3][0]='KeyF'; binds[4][0]='Space'; binds[5][0]='KeyJ'; binds[6][0]='KeyK'; binds[7][0]='KeyL'; binds[8][0]='Semicolon'; }
    return binds;
}

function getDefaultLaneColors(k) {
    const colors = [];
    const colorOut = '#ffffff';
    const colorIn = '#34d399';
    const colorCenter = '#fbbf24';
    for (let i = 0; i < k; i++) {
        if (k % 2 !== 0 && i === Math.floor(k / 2)) colors.push(colorCenter);
        else {
            const distanceFromEdge = Math.min(i, k - 1 - i);
            colors.push(distanceFromEdge % 2 === 0 ? colorOut : colorIn);
        }
    }
    return colors;
}

const defaultSettings = { 
    offset: 0, scrollSpeed: 1000, trackScale: 1.0, bgBlur: 8, bgDim: 80, 
    laneColors: {}, 
    keyBinds: {},
    language: 'zh',
    touchClick: false,
    hitErrorMeter: true,
    noStoryboard: false,
    audioDevice: 'default',
    masterVol: 100,
    bgVol: 50,
    sfxVol: 100,
    musicVol: 100,
    enableHitSounds: true,
    autoOffset: false,
    autoKiosk: false,
    uiScale: 1.0,
    renderer: 'default',
    desync: false,
    fpsLimit: 'unlimited',
    threadMode: 'single',
    showFps: false,
    hwAccel: true,
    multiId: ''
};

for (let i = 1; i <= 18; i++) {
    defaultSettings.keyBinds[i] = getDefaultBinds(i);
    defaultSettings.laneColors[i] = getDefaultLaneColors(i);
}

let userSettings = JSON.parse(localStorage.getItem('webmania_settings')) || {};
userSettings = { ...defaultSettings, ...userSettings }; 

if (Array.isArray(userSettings.laneColors)) {
    const old = userSettings.laneColors;
    userSettings.laneColors = {};
    for (let i = 1; i <= 18; i++) userSettings.laneColors[i] = getDefaultLaneColors(i);
    userSettings.laneColors[4] = old;
} else {
    if (!userSettings.laneColors) userSettings.laneColors = {};
    for (let i = 1; i <= 18; i++) {
        if (!userSettings.laneColors[i]) userSettings.laneColors[i] = getDefaultLaneColors(i);
    }
}

if (Array.isArray(userSettings.keyBinds)) {
    const old = userSettings.keyBinds;
    userSettings.keyBinds = {};
    for (let i = 1; i <= 18; i++) userSettings.keyBinds[i] = getDefaultBinds(i);
    userSettings.keyBinds[4] = old;
} else {
    if (!userSettings.keyBinds) userSettings.keyBinds = {};
    for (let i = 1; i <= 18; i++) {
        if (!userSettings.keyBinds[i]) userSettings.keyBinds[i] = getDefaultBinds(i);
    }
}

localStorage.setItem('webmania_settings', JSON.stringify(userSettings));

const i18nDict = {
    zh: {
        settings: "设置", cat_general: "常规", open_wizard: "打开设置向导",
        language: "语言", open_songs: "打开songs文件夹", change_songs: "更改songs文件夹位置",
        rebuild_cache: "重新建立谱面缓存", rebuilding_cache: "正在深度扫描并重建缓存...",
        cat_skin: "皮肤", track_keys: "轨道Key数", cat_input: "输入", config_keys: "配置键位",
        touch_click: "启用触屏点击", cat_ui: "界面", bg_blur: "游玩时背景模糊",
        bg_dim: "游玩时背景暗化", speed: "下落速度", scale: "轨道缩放",
        hit_error: "开启 HitErrorMeter", no_sb: "不播放故事板的视频", cat_audio: "音频",
        device: "播放设备", master_vol: "主音量", bg_vol: "主音量(当窗口失焦时)",
        sfx_vol: "音效", music_vol: "音乐", enable_hitsounds: "开启按键音效", audio_offset: "音频延迟",
        use_rec: "使用推荐延迟", auto_offset: "游玩结束后自动校准延迟", cat_gfx: "图像",
        auto_kiosk: "游玩时自动进入Kiosk模式", ui_scale: "UI缩放", renderer: "渲染器 (需重启)",
        desync: "启用desynchronized模式", fps_limit: "帧数限制", thread_mode: "线程模式",
        show_fps: "显示帧率", hw_accel: "播放背景视频时使用硬件加速", cat_online: "在线",
        multi_id: "多人游戏ID", init_title: "初始化", init_desc: "请选择您的 osu! Songs 文件夹",
        browse: "浏览...", start_game: "开始游戏", search_placeholder: "搜索标题、艺术家、难度...",
        sort_title: "标题 (A-Z)", sort_artist: "艺术家 (A-Z)", sort_diff: "难度", sort_bpm: "BPM",
        sort_asc: "升序", sort_desc: "降序", select_song_start: "选择一首歌曲开始",
        loading_map: "正在加载谱面...", local_scores: "本地分数", global_scores: "全球排行榜",
        random_map: "[ 随机选歌 ]", rend_default: "默认", unlimited: "无限制",
        single_thread: "单线程", multi_thread: "多线程"
    },
    en: {
        settings: "Settings", cat_general: "General", open_wizard: "Open Setup Wizard",
        language: "Language", open_songs: "Open Songs Folder", change_songs: "Change Songs Folder",
        rebuild_cache: "Rebuild Beatmap Cache", rebuilding_cache: "Deep scanning and rebuilding cache...",
        cat_skin: "Skin", track_keys: "Track Keys", cat_input: "Input", config_keys: "Configure Keys",
        touch_click: "Enable Touch Click", cat_ui: "UI", bg_blur: "Background Blur",
        bg_dim: "Background Dim", speed: "Scroll Speed", scale: "Track Scale",
        hit_error: "Enable HitErrorMeter", no_sb: "Disable Storyboard Video", cat_audio: "Audio",
        device: "Playback Device", master_vol: "Master Volume", bg_vol: "Master Vol (Unfocused)",
        sfx_vol: "SFX Volume", music_vol: "Music Volume", enable_hitsounds: "Enable Hit Sounds", audio_offset: "Audio Offset",
        use_rec: "Use Recommended Offset", auto_offset: "Auto Calibrate Offset", cat_gfx: "Graphics",
        auto_kiosk: "Auto Kiosk Mode", ui_scale: "UI Scale", renderer: "Renderer (Restart Req)",
        desync: "Enable Desynchronized Mode", fps_limit: "FPS Limit", thread_mode: "Thread Mode",
        show_fps: "Show FPS", hw_accel: "Hardware Video Acceleration", cat_online: "Online",
        multi_id: "Multiplayer ID", init_title: "Initialize", init_desc: "Please select your osu! Songs folder",
        browse: "Browse...", start_game: "Start Game", search_placeholder: "Search title, artist, difficulty...",
        sort_title: "Title (A-Z)", sort_artist: "Artist (A-Z)", sort_diff: "Difficulty", sort_bpm: "BPM",
        sort_asc: "Ascending", sort_desc: "Descending", select_song_start: "Select a song to start",
        loading_map: "Loading beatmap...", local_scores: "Local Scores", global_scores: "Global Rankings",
        random_map: "[ Random Map ]", rend_default: "Default", unlimited: "Unlimited",
        single_thread: "Single Thread", multi_thread: "Multi Thread"
    }
};

function applyTranslations() {
    const lang = userSettings.language || 'zh';
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18nDict[lang] && i18nDict[lang][key]) {
            if (el.tagName === 'INPUT' && el.type === 'text') el.placeholder = i18nDict[lang][key];
            else el.innerText = i18nDict[lang][key];
        }
    });
}

function saveSysConfig() {
    fetch(`${LOCAL_API_URL}/sys_config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renderer: userSettings.renderer, fpsLimit: userSettings.fpsLimit })
    }).catch(()=>{});
}

function saveSettings() {
    localStorage.setItem('webmania_settings', JSON.stringify(userSettings));
    if (userSettings.multiId) localStorage.setItem('wm_username', userSettings.multiId);
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
        { s: 0.1, c: [66, 144, 251] }, { s: 1.25, c: [79, 192, 255] },
        { s: 2.0, c: [79, 255, 79] },  { s: 2.5, c: [246, 240, 92] },  
        { s: 3.3, c: [255, 128, 104] }, { s: 4.2, c: [255, 46, 46] },   
        { s: 4.9, c: [200, 32, 80] },   { s: 5.8, c: [101, 99, 222] },  
        { s: 6.7, c: [24, 21, 142] },   { s: 7.7, c: [0, 0, 0] }        
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