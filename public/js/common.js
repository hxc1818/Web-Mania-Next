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
    highPrecision: false, sensitivity: 1.0, confineCursor: 'never', disableWheel: false, disableClick: false, multiId: '',
    stdKeyBinds: ['KeyZ', 'KeyX'],
    cursorSize: 1.0,
    cursorTrail: true,
    snakingSliders: true,
    hide300: false
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

if (!Array.isArray(userSettings.stdKeyBinds) || userSettings.stdKeyBinds.length < 2) {
    userSettings.stdKeyBinds = ['KeyZ', 'KeyX'];
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
        single_thread: "单线程", multi_thread: "多线程", high_precision: "高精度鼠标", mouse_sensitivity: "光标灵敏度", confine_cursor: "将光标限制在窗口内", confine_never: "不限制", confine_play: "仅在游玩时限制", confine_always: "总是限制", disable_wheel: "在游戏中禁用鼠标滚轮调整音量", disable_click: "在游戏中禁用鼠标点击", calibrate_offset: "主动调整音频延迟",
        cursor_size: "光标尺寸 (osu!std)", cursor_trail: "开启光标拖尾 (osu!std)", snaking_sliders: "开启滑条渐出动画 (osu!std)", hide_300: "隐藏 300 判定文字 (osu!std)", drop_osz_title: "松开鼠标以自动解析并安装谱面", drop_osz_desc: "支持单个或多个 .osz 谱面包，将自动解压并加入曲库", toast_installing: "正在解析并安装谱面: ", toast_installed: "已成功安装谱面: ", toast_install_fail: "安装谱面失败: ", toast_not_osz: "请拖入 .osz 格式的 osu! 谱面包", toast_no_folder: "未配置 osu! Songs 文件夹路径，请先在初始化界面选择路径。"
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
        single_thread: "Single Thread", multi_thread: "Multi Thread", high_precision: "Raw Input", mouse_sensitivity: "Mouse Sensitivity", confine_cursor: "Confine Cursor", confine_never: "Never", confine_play: "During Gameplay", confine_always: "Always", disable_wheel: "Disable Mouse Wheel in Game", disable_click: "Disable Mouse Clicks in Game", calibrate_offset: "Active Audio Offset Calibration",
        cursor_size: "Cursor Size (osu!std)", cursor_trail: "Enable Cursor Trail (osu!std)", snaking_sliders: "Snaking Sliders (osu!std)", hide_300: "Hide 300 Judgements (osu!std)", drop_osz_title: "Release to parse and install beatmap", drop_osz_desc: "Supports .osz packages, will automatically extract and add to library", toast_installing: "Parsing and installing beatmap: ", toast_installed: "Successfully installed beatmap: ", toast_install_fail: "Failed to install beatmap: ", toast_not_osz: "Please drop .osz format osu! beatmaps", toast_no_folder: "osu! Songs folder path not configured. Please select path first."
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

let _saveSettingsTimer = null;
function saveSettings(immediate = false) {
    if (immediate) {
        if (_saveSettingsTimer) { clearTimeout(_saveSettingsTimer); _saveSettingsTimer = null; }
        try {
            localStorage.setItem('webmania_settings', JSON.stringify(userSettings));
            if (userSettings.multiId) localStorage.setItem('wm_username', userSettings.multiId);
        } catch(e) {}
        return;
    }
    if (_saveSettingsTimer) clearTimeout(_saveSettingsTimer);
    _saveSettingsTimer = setTimeout(() => {
        try {
            localStorage.setItem('webmania_settings', JSON.stringify(userSettings));
            if (userSettings.multiId) localStorage.setItem('wm_username', userSettings.multiId);
        } catch(e) {}
        _saveSettingsTimer = null;
    }, 150);
}

window.addEventListener('beforeunload', () => {
    saveSettings(true);
});

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

class HighPrecisionMouseManager {
    constructor() {
        this.isLocked = false;
        this.isMouseDown = false;
        this.cursorX = window.innerWidth / 2;
        this.cursorY = window.innerHeight / 2;
        this.lastClientX = window.innerWidth / 2;
        this.lastClientY = window.innerHeight / 2;
        this.dragTarget = null;
        this.mouseDownTarget = null;
        this.mouseDownTime = 0;
        this.mouseDownX = 0;
        this.mouseDownY = 0;
        this.lastHoveredTarget = null;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        this.createCursorDOM();
        this.bindEvents();
        this.onSettingsChange();
    }

    createCursorDOM() {
        if (document.getElementById('wmn-custom-cursor')) {
            this.cursorEl = document.getElementById('wmn-custom-cursor');
            return;
        }
        const cursor = document.createElement('div');
        cursor.id = 'wmn-custom-cursor';
        cursor.className = 'wmn-cursor';
        cursor.style.display = 'none';
        cursor.innerHTML = `
            <div class="wmn-cursor-inner">
                <div class="wmn-cursor-dot"></div>
                <div class="wmn-cursor-ring"></div>
            </div>
        `;
        document.body.appendChild(cursor);
        this.cursorEl = cursor;
    }

    shouldLock() {
        const osuBrowser = document.getElementById("osu-browser-container");
        if (osuBrowser && osuBrowser.classList.contains("active")) return false;
        const s = window.userSettings || {};
        const isGame = window.location.pathname.includes('game.html');
        if (s.confineCursor === 'always') return true;
        if (s.confineCursor === 'play' && isGame) return true;
        if (s.highPrecision) return true;
        if (s.sensitivity !== undefined && Math.abs(s.sensitivity - 1.0) > 0.001) return true;
        return false;
    }

    onSettingsChange() {
        if (!this.shouldLock()) {
            if (document.pointerLockElement) {
                try { document.exitPointerLock(); } catch(e) {}
            }
        }
    }

    requestLock() {
        const target = document.body;
        if (!target || document.pointerLockElement) return;
        const s = window.userSettings || {};
        if (s.highPrecision) {
            try {
                const promise = target.requestPointerLock({ unadjustedMovement: true });
                if (promise && promise.catch) {
                    promise.catch(() => {
                        try { target.requestPointerLock(); } catch(e){}
                    });
                }
            } catch(e) {
                try { target.requestPointerLock(); } catch(err){}
            }
        } else {
            try { target.requestPointerLock(); } catch(e){}
        }
    }

    updateCursorPos() {
        if (this.cursorEl) {
            if (window.isStdGameplayActive) {
                this.cursorEl.style.display = 'none';
            } else if (this.isLocked) {
                this.cursorEl.style.display = 'block';
            }
            this.cursorEl.style.transform = `translate3d(${this.cursorX}px, ${this.cursorY}px, 0)`;
        }
    }

    bindEvents() {
        document.addEventListener('pointerlockchange', () => {
            const isLocked = !!document.pointerLockElement;
            this.isLocked = isLocked;
            if (isLocked) {
                document.body.classList.add('wmn-pointer-locked');
                if (this.cursorEl) {
                    this.cursorEl.style.display = window.isStdGameplayActive ? 'none' : 'block';
                    this.updateCursorPos();
                }
            } else {
                document.body.classList.remove('wmn-pointer-locked');
                if (this.cursorEl) {
                    this.cursorEl.style.display = 'none';
                    this.cursorEl.classList.remove('active');
                }
                this.isMouseDown = false;
                this.dragTarget = null;
                this.mouseDownTarget = null;
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isLocked) {
                this.lastClientX = e.clientX;
                this.lastClientY = e.clientY;
                return;
            }
            if (!e.isTrusted) return;

            const s = window.userSettings || {};
            const sens = (s.sensitivity !== undefined && s.sensitivity > 0) ? s.sensitivity : 1.0;

            const dx = e.movementX * sens;
            const dy = e.movementY * sens;

            this.cursorX = Math.max(0, Math.min(window.innerWidth - 1, this.cursorX + dx));
            this.cursorY = Math.max(0, Math.min(window.innerHeight - 1, this.cursorY + dy));
            this.updateCursorPos();

            if (typeof window.onWmnCursorMove === 'function') {
                window.onWmnCursorMove(this.cursorX, this.cursorY);
            }

            if (this.isMouseDown && this.dragTarget) {
                this.dragTarget.dispatchEvent(new PointerEvent('pointermove', {
                    bubbles: true, cancelable: true,
                    clientX: this.cursorX, clientY: this.cursorY,
                    pointerId: 1, isPrimary: true,
                    button: 0, buttons: 1
                }));
                this.dragTarget.dispatchEvent(new MouseEvent('mousemove', {
                    bubbles: true, cancelable: true,
                    clientX: this.cursorX, clientY: this.cursorY,
                    button: 0, buttons: 1
                }));
            } else {
                const target = document.elementFromPoint(this.cursorX, this.cursorY);
                if (target !== this.lastHoveredTarget) {
                    if (this.lastHoveredTarget) {
                        this.lastHoveredTarget.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, clientX: this.cursorX, clientY: this.cursorY }));
                        this.lastHoveredTarget.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, clientX: this.cursorX, clientY: this.cursorY }));
                    }
                    if (target) {
                        target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: this.cursorX, clientY: this.cursorY }));
                        target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: this.cursorX, clientY: this.cursorY }));
                    }
                    this.lastHoveredTarget = target;
                }
            }
        }, { passive: false });

        document.addEventListener('mousedown', (e) => {
            if (!e.isTrusted) return;
            if (!this.isLocked) {
                if (this.shouldLock()) {
                    this.cursorX = e.clientX;
                    this.cursorY = e.clientY;
                    this.requestLock();
                }
                return;
            }

            this.isMouseDown = true;
            if (this.cursorEl) this.cursorEl.classList.add('active');

            const isGame = window.location.pathname.includes('game.html');
            if (isGame && window.userSettings && window.userSettings.disableClick && !window.isStdGameplayActive) {
                const pauseScreen = document.getElementById('pause-screen');
                const failScreen = document.getElementById('fail-screen');
                const resultScreen = document.getElementById('result-screen');
                const isPaused = pauseScreen && (pauseScreen.classList.contains('active') || pauseScreen.style.display === 'flex' || pauseScreen.style.display === 'block');
                const isFailed = failScreen && (failScreen.classList.contains('active') || failScreen.style.display === 'flex' || failScreen.style.display === 'block');
                const isResult = resultScreen && (resultScreen.classList.contains('active') || resultScreen.style.display === 'flex' || resultScreen.style.display === 'block');
                if (!isPaused && !isFailed && !isResult) {
                    return;
                }
            }

            const target = document.elementFromPoint(this.cursorX, this.cursorY);
            this.dragTarget = target;
            this.mouseDownTarget = target;
            this.mouseDownTime = Date.now();
            this.mouseDownX = this.cursorX;
            this.mouseDownY = this.cursorY;

            if (target) {
                target.dispatchEvent(new PointerEvent('pointerdown', {
                    bubbles: true, cancelable: true,
                    clientX: this.cursorX, clientY: this.cursorY,
                    pointerId: 1, isPrimary: true,
                    button: e.button, buttons: e.buttons
                }));
                target.dispatchEvent(new MouseEvent('mousedown', {
                    bubbles: true, cancelable: true,
                    clientX: this.cursorX, clientY: this.cursorY,
                    button: e.button, buttons: e.buttons
                }));

                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.getAttribute('tabindex') !== null) {
                    target.focus();
                } else {
                    const focusable = target.closest('input, textarea, [tabindex]');
                    if (focusable) focusable.focus();
                }
            }
        }, true);

        document.addEventListener('mouseup', (e) => {
            if (!e.isTrusted) return;
            if (!this.isLocked) return;

            this.isMouseDown = false;
            if (this.cursorEl) this.cursorEl.classList.remove('active');

            const isGame = window.location.pathname.includes('game.html');
            if (isGame && window.userSettings && window.userSettings.disableClick && !window.isStdGameplayActive) {
                const pauseScreen = document.getElementById('pause-screen');
                const failScreen = document.getElementById('fail-screen');
                const resultScreen = document.getElementById('result-screen');
                const isPaused = pauseScreen && (pauseScreen.classList.contains('active') || pauseScreen.style.display === 'flex' || pauseScreen.style.display === 'block');
                const isFailed = failScreen && (failScreen.classList.contains('active') || failScreen.style.display === 'flex' || failScreen.style.display === 'block');
                const isResult = resultScreen && (resultScreen.classList.contains('active') || resultScreen.style.display === 'flex' || resultScreen.style.display === 'block');
                if (!isPaused && !isFailed && !isResult) {
                    return;
                }
            }

            const target = document.elementFromPoint(this.cursorX, this.cursorY);
            if (this.dragTarget) {
                this.dragTarget.dispatchEvent(new PointerEvent('pointerup', {
                    bubbles: true, cancelable: true,
                    clientX: this.cursorX, clientY: this.cursorY,
                    pointerId: 1, isPrimary: true,
                    button: e.button, buttons: e.buttons
                }));
                this.dragTarget.dispatchEvent(new MouseEvent('mouseup', {
                    bubbles: true, cancelable: true,
                    clientX: this.cursorX, clientY: this.cursorY,
                    button: e.button, buttons: e.buttons
                }));
            }

            if (target && this.mouseDownTarget) {
                const dist = Math.hypot(this.cursorX - this.mouseDownX, this.cursorY - this.mouseDownY);
                if (dist < 20 && (Date.now() - this.mouseDownTime) < 800) {
                    if (target === this.mouseDownTarget || target.contains(this.mouseDownTarget) || this.mouseDownTarget.contains(target)) {
                        target.dispatchEvent(new MouseEvent('click', {
                            bubbles: true, cancelable: true,
                            clientX: this.cursorX, clientY: this.cursorY,
                            button: e.button, buttons: e.buttons
                        }));
                    }
                }
            }
            this.dragTarget = null;
            this.mouseDownTarget = null;
        }, true);

        document.addEventListener('wheel', (e) => {
            if (!e.isTrusted) return;
            const isGame = window.location.pathname.includes('game.html');
            if (isGame) {
                if (window.userSettings && window.userSettings.disableWheel) {
                    e.preventDefault();
                    return;
                } else if (typeof window.adjustGameVolumeByWheel === 'function') {
                    e.preventDefault();
                    window.adjustGameVolumeByWheel(e.deltaY);
                    return;
                }
            }

            if (this.isLocked) {
                const target = document.elementFromPoint(this.cursorX, this.cursorY);
                if (target) {
                    let el = target;
                    while (el && el !== document.documentElement && el !== document.body) {
                        const style = window.getComputedStyle(el);
                        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
                            el.scrollTop += e.deltaY;
                            break;
                        }
                        el = el.parentElement;
                    }
                    target.dispatchEvent(new WheelEvent('wheel', {
                        bubbles: true, cancelable: true,
                        clientX: this.cursorX, clientY: this.cursorY,
                        deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode
                    }));
                }
            }
        }, { passive: false });

        document.addEventListener('contextmenu', (e) => {
            if (!e.isTrusted) return;
            if (!this.isLocked) return;
            const target = document.elementFromPoint(this.cursorX, this.cursorY);
            if (target) {
                target.dispatchEvent(new MouseEvent('contextmenu', {
                    bubbles: true, cancelable: true,
                    clientX: this.cursorX, clientY: this.cursorY,
                    button: 2
                }));
            }
        }, true);
    }
}

window.mouseManager = new HighPrecisionMouseManager();
