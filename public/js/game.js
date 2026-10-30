// /public/js/game.js
const SCORES = { max: 320, p300: 300, p200: 200, p100: 100, p50: 50, miss: 0 };
const HP_MOD = { max: 2, p300: 1, p200: 0.5, p100: -1, p50: -2, miss: -4 };
const MANIA_TAU = Math.PI * 2;
const maniaClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const maniaEaseOut = t => 1 - (1 - t) * (1 - t);

let KEY_MAP = {};
let selectedMap = null;
let currentLeaderboard = [];
let gameEngine = null;
let audioCtx = null;

let currentInitId = 0; 
let socket = null;
let playerScores = {}; 

const isMulti = sessionStorage.getItem('webmania_multi') === 'true';
const role = sessionStorage.getItem('webmania_multi_role');
const roomInfo = JSON.parse(sessionStorage.getItem('webmania_multi_room') || '{}');
const myUid = sessionStorage.getItem('webmania_multi_uid');
const urlParams = new URLSearchParams(window.location.search);
const specClientUid = urlParams.get('spectate_client');

const replayStr = sessionStorage.getItem('webmania_replay_data');
const replayData = replayStr ? JSON.parse(replayStr) : null;
const isReplayMode = !!replayData;

let resumeInterval = null;
let isResuming = false;
let escHoldTimer = null;
let escProgress = 0;
let retryHoldTimer = null;
let retryProgress = 0;

window.onload = async () => {
    sessionStorage.removeItem('webmania_is_navigating_to_game');

    const mapData = sessionStorage.getItem('webmania_current_map');
    if (mapData) selectedMap = JSON.parse(mapData);
    
    if (!selectedMap && !specClientUid && role !== 'spectator') {
        return window.location.href = isMulti ? 'multiplayer.html' : 'index.html';
    }
    
    if (userSettings.autoKiosk && !specClientUid) {
        fetch(`${LOCAL_API_URL}/kiosk`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ kiosk: true }) 
        }).catch(()=>{});
        
        document.documentElement.requestFullscreen().catch(()=>{});
    }

    if (userSettings.showFps && !specClientUid) {
        const fpsDiv = document.createElement('div');
        fpsDiv.id = 'fps-counter';
        fpsDiv.style.cssText = 'position:fixed; bottom:10px; right:10px; color:#10b981; font-weight:bold; font-family:monospace; font-size:20px; z-index:9999; text-shadow:0 2px 4px rgba(0,0,0,0.8);';
        document.body.appendChild(fpsDiv);
    }

    const lbData = sessionStorage.getItem('webmania_current_leaderboard');
    currentLeaderboard = lbData ? JSON.parse(lbData) : [];
    
    if (isReplayMode) {
        const replayBadge = document.getElementById('replay-badge');
        if (replayBadge) {
            replayBadge.style.display = 'block';
            replayBadge.innerText = `回放: ${replayData.player}`;
        }
        sessionStorage.removeItem('webmania_replay_data'); 
    }

    if (isMulti) {
        socket = new CustomSocket(); 
        
        if (!specClientUid) {
            socket.emit('join_multi', { uid: myUid, username: localStorage.getItem('wm_username') });
            socket.emit('join_room', { roomId: roomInfo.id });
        } else {
            socket.emit('join_multi', { uid: 'spec_' + Math.random().toString(36).substr(2,9), username: 'SpectatorViewer' });
            socket.emit('join_room', { roomId: roomInfo.id, isSpectatorClient: true });
        }
        
        socket.on('room_game_update', data => {
            playerScores[data.uid] = data;
            if (!specClientUid && !isReplayMode) updateLeaderboard();
            else if (specClientUid === data.uid) updateSpecClientHUD(data);
        });

        socket.on('room_judge_event', data => {
            if (specClientUid && specClientUid === data.uid && gameEngine && gameEngine.queueSpectatorEvent) {
                gameEngine.queueSpectatorEvent({ eventType: 'judge', ...data });
            }
        });

        socket.on('room_key_event', data => {
            if (specClientUid && specClientUid === data.uid && gameEngine && gameEngine.queueSpectatorEvent) {
                gameEngine.queueSpectatorEvent({ eventType: 'key', action: data.type, lane: data.lane, time: data.time });
            }
        });

        socket.on('all_finished', results => {
            const waitingOverlay = document.getElementById('waiting-overlay');
            if (waitingOverlay) waitingOverlay.style.display = 'none';
            if (specClientUid) return; 
            
            showScreen('result-screen');
            
            if (role === 'spectator') {
                const statsContainer = document.getElementById('result-stats-container');
                const resultGrade = document.getElementById('result-grade');
                const resultTitle = document.querySelector('.result-title');
                if (statsContainer) statsContainer.style.display = 'none';
                if (resultGrade) resultGrade.style.display = 'none';
                if (resultTitle) resultTitle.innerText = "多人游戏结算";
            }

            const multiTable = document.getElementById('multi-res-table');
            if (multiTable) {
                multiTable.style.display = 'table';
                const tbody = multiTable.querySelector('tbody');
                if (tbody) {
                    tbody.innerHTML = results.map((r, i) => `
                        <tr style="${r.uid === myUid ? 'background: rgba(59, 130, 246, 0.2)' : ''}">
                            <td>#${i+1}</td><td><b>${r.name}</b> ${r.failed?'<span style="color:#ef4444;font-size:12px;">(失败)</span>':''}</td>
                            <td style="color:#fbbf24; font-weight:bold;">${r.score.toString().padStart(7,'0')}</td>
                            <td>${r.acc.toFixed(2)}%</td><td>${r.combo}x</td>
                        </tr>
                    `).join('');
                }
            }
        });

        socket.on('force_game_ended', () => {
            if (gameEngine && gameEngine.state) gameEngine.state.failed = true;
            quitGame();
        });
    }

    if (specClientUid) {
        document.getElementById('game-screen').classList.add('active');
        document.body.style.background = 'transparent';
        document.getElementById('game-screen').style.background = 'transparent';
        
        const replayBadge = document.getElementById('replay-badge');
        if (replayBadge) {
            replayBadge.style.display = 'block';
            const pName = roomInfo.players.find(p => p.uid === specClientUid)?.name || 'Unknown';
            replayBadge.innerText = `正在观战: ${pName}`;
        }

        await initGame(true); 
    } 
    else if (role === 'spectator') {
        document.getElementById('spectator-grid').classList.add('active');
        const players = roomInfo.players.filter(p => p.status === 'playing');
        if (players.length === 0) {
            document.getElementById('spectator-grid').innerHTML = '<div style="color:#aaa; margin: auto; font-size:20px; font-weight:600;">当前没有玩家在游戏中。</div>';
        } else {
            document.getElementById('spectator-grid').innerHTML = players.map(p => 
                `<iframe class="spec-iframe" src="game.html?spectate_client=${p.uid}" allow="autoplay"></iframe>`
            ).join('');
        }
    } 
    else {
        document.getElementById('game-screen').classList.add('active');
        if(isMulti) {
            const multiLb = document.getElementById('multi-lb');
            if (multiLb) multiLb.style.display = 'flex';
        }
        await initGame(false);
    }

    const backBtn = document.getElementById('back-to-select');
    if (backBtn) {
        backBtn.onclick = () => quitGame();
    }

    if (userSettings.touchClick) {
        const canvas = document.getElementById('game-canvas');
        if (canvas) {
            canvas.addEventListener('touchstart', (e) => {
                if(!gameEngine || !gameEngine.isRunning || gameEngine.isPaused || isReplayMode || gameEngine.isSpectator || !gameEngine.onKeyDown) return;
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const W = gameEngine.W || window.innerWidth;
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    const x = touch.clientX - rect.left;
                    const offsetX = (W - gameEngine.trackWidth) / 2;
                    if (x >= offsetX && x <= offsetX + gameEngine.trackWidth) {
                        const lane = Math.floor((x - offsetX) / gameEngine.laneWidth);
                        if(lane >= 0 && lane < gameEngine.laneCount) {
                            gameEngine.onKeyDown(lane);
                            touch.webmaniaLane = lane; 
                        }
                    }
                }
            }, {passive: false});

            canvas.addEventListener('touchend', (e) => {
                if(!gameEngine || !gameEngine.isRunning || gameEngine.isPaused || isReplayMode || gameEngine.isSpectator || !gameEngine.onKeyUp) return;
                e.preventDefault();
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    if(touch.webmaniaLane !== undefined) {
                        gameEngine.onKeyUp(touch.webmaniaLane);
                    }
                }
            }, {passive: false});
        }
    }
};

function updateSpecClientHUD(data) {
    if(data.failed && gameEngine && gameEngine.state && !gameEngine.state.failed) {
        gameEngine.state.failed = true;
        const canvas = document.getElementById('game-canvas');
        if (canvas) canvas.style.filter = 'grayscale(1)';
    }
}

function updateLeaderboard() {
    if(!isMulti || role === 'spectator') return;
    const lb = document.getElementById('multi-lb');
    if (!lb) return;
    const sorted = Object.values(playerScores).sort((a,b) => b.score - a.score);
    lb.innerHTML = sorted.map((p, i) => `
        <div class="multi-lb-item ${p.failed ? 'failed' : ''}">
            <div><span style="color:#aaa;font-size:12px;">#${i+1}</span> <b>${roomInfo.players.find(x=>x.uid===p.uid)?.name || '?'}</b></div>
            <div style="font-family:monospace; font-weight:bold; color:#fbbf24;">${p.score.toString().padStart(7,'0')}</div>
        </div>
    `).join('');
}

function getGrade(acc, failed, mods = []) {
    if (failed) return 'F';
    const isSilver = Array.isArray(mods) && (mods.includes('HD') || mods.includes('FL'));
    if (acc === 100) return isSilver ? 'SSH' : 'SS';
    if (acc >= 95) return isSilver ? 'SH' : 'S';
    if (acc >= 90) return 'A';
    if (acc >= 80) return 'B';
    if (acc >= 70) return 'C';
    if (acc > 0) return 'D';
    return 'F';
}

class GameEngine {
    constructor(canvas, beatmapData, audioBuffer, audioCtx, stars, onEnd, leaderboard, isSpectator = false, loadedHitSounds = {}, mods = []) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { desynchronized: userSettings.desync || false });
        this.mods = Array.isArray(mods) ? [...mods] : [];
        this.hasMod = (mod) => this.mods.includes(mod);
        this.modMultiplier = (window.OsuModsManager && typeof window.OsuModsManager.calculateMultiplier === 'function')
            ? window.OsuModsManager.calculateMultiplier(this.mods, 3) : 1.0;
        this.playbackRate = (this.hasMod('DT') || this.hasMod('NC')) ? 1.5 : (this.hasMod('HT') ? 0.75 : 1.0);
        this.ezLives = this.hasMod('EZ') ? 2 : 0;
        this.timingPoints = beatmapData.timingPoints || [];
        this.lastNcBeat = -1;

        // Clone notes to allow mod transformations (e.g. MR / RD)
        this.notes = beatmapData.notes.map(n => ({ ...n }));
        this.audioBuffer = audioBuffer;
        this.audioCtx = audioCtx;
        this.onEnd = onEnd;
        this.stars = stars;
        this.leaderboard = leaderboard || [];
        
        this.isSpectator = isSpectator; 
        this.isReplay = isReplayMode; 
        
        this.spectatorDelay = this.isSpectator ? 4000 : 0; 
        
        this.remoteKeyEvents = this.isReplay ? [...replayData.events] : [];
        this.spectatorEvents = []; 

        this.breaks = beatmapData.breaks || [];

        if (this.breaks.length === 0 && this.notes.length > 0) {
            if (this.notes[0].time > 5000) {
                this.breaks.push({ startTime: 1000, endTime: this.notes[0].time - 1500 });
            }

            let lastEnd = this.notes[0].type === 'hold' ? this.notes[0].endTime : this.notes[0].time;
            for (let i = 1; i < this.notes.length; i++) {
                const note = this.notes[i];
                if (note.time - lastEnd > 4000) {
                    this.breaks.push({ startTime: lastEnd + 1000, endTime: note.time - 1500 });
                }
                const noteEnd = note.type === 'hold' ? note.endTime : note.time;
                if (noteEnd > lastEnd) lastEnd = noteEnd;
            }
        }
        
        this.inBreak = false;

        this.laneCount = beatmapData.cs || 4;

        // Apply Mirror (MR) or Random (RD) lane mapping
        if (this.hasMod('MR')) {
            for (let n of this.notes) {
                n.column = (this.laneCount - 1) - n.column;
            }
        } else if (this.hasMod('RD')) {
            const perm = Array.from({ length: this.laneCount }, (_, i) => i);
            for (let i = perm.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
            }
            for (let n of this.notes) {
                n.column = perm[n.column];
            }
        }

        this.od = beatmapData.od !== undefined ? beatmapData.od : 5;
        if (this.hasMod('EZ')) this.od *= 0.5;
        if (this.hasMod('HR')) this.od = Math.min(10, this.od * 1.4);

        this.judge = {
            max: 16,
            p300: Math.max(16, 64 - 3 * this.od),
            p200: Math.max(16, 97 - 3 * this.od),
            p100: Math.max(16, 127 - 3 * this.od),
            p50:  Math.max(16, 151 - 3 * this.od),
            miss: Math.max(16, 188 - 3 * this.od) 
        };

        this.scrollSpeed = userSettings.scrollSpeed || 1000;
        
        let baseLaneWidth = 100;
        if(this.laneCount > 4) baseLaneWidth = 80;
        if(this.laneCount > 7) baseLaneWidth = 60;
        if(this.laneCount > 10) baseLaneWidth = 45;
        if(this.laneCount > 15) baseLaneWidth = 35;
        
        this.trackWidth = (this.laneCount * baseLaneWidth) * (userSettings.trackScale || 1.0);
        this.laneWidth = this.trackWidth / this.laneCount;
        
        this._resize = this._resize.bind(this);
        this._resize();
        window.addEventListener('resize', this._resize);

        this._onCanvasPointerDown = (e) => {
            if (this.isPaused || this.state.failed) return;
            const uiScale = userSettings.uiScale || 1.0;
            const u = Math.max(0.6, this.H / 900) * uiScale;
            const now = this.getTime();
            const cx = document.pointerLockElement ? (window.innerWidth / 2) : e.clientX;
            const cy = document.pointerLockElement ? (window.innerHeight / 2) : e.clientY;
            if (e.button === 0 && now < this.firstNoteTime - 2500 &&
                cx >= this.W - 200 * u && cx <= this.W - 20 * u &&
                cy >= this.H - 110 * u && cy <= this.H - 60 * u) {
                this.skip();
            }
        };
        this.canvas.addEventListener('pointerdown', this._onCanvasPointerDown);
        
        this.laneColors = userSettings.laneColors[this.laneCount] || [];

        this.keys = new Array(this.laneCount).fill(false);
        this.isRunning = false;
        this.isPaused = false;
        this.audioSource = null;
        this.startTime = 0;
        this.fallbackStartTime = 0;
        this.audioOffsetSec = 0;
        this.failTime = 0;
        this.failedAtTime = 0;

        this.nextSoundNoteIndex = 0;
        this.recordedEvents = []; 

        this.state = {
            combo: 0, maxCombo: 0, hp: 100, failed: false,
            stats: { max: 0, p300: 0, p200: 0, p100: 0, p50: 0, miss: 0 },
            totalBasePossible: 0, currentBase: 0, acc: 100,
            scoreV2: 0, hitErrors: [], allHitErrors: [], currentPP: 0, effect: null
        };

        let totalJudgements = 0;
        let maxTime = 0;
        this.notes.forEach(n => { 
            totalJudgements += (n.type === 'hold' ? 2 : 1); 
            const t = n.type === 'hold' ? n.endTime : n.time;
            if (t > maxTime) maxTime = t;
        });
        this.state.totalBasePossible = totalJudgements * SCORES.max;
        this.firstNoteTime = this.notes.length > 0 ? this.notes[0].time : 0;
        this.lastNoteTime = maxTime;
        this.totalLengthMs = maxTime;
        this.holdingNotes = new Array(this.laneCount).fill(null);
        this.drawTimeStartIndex = 0;
        this.headJudgeStartIndex = 0;
        this.missJudgeStartIndex = 0;
        this.cachedUR = 0;

        // Pre-synthesize default hitsound buffer once to avoid runtime WebAudio oscillator/gain creation
        this.defaultHitSoundBuffer = null;
        if (window.AudioEngine && this.audioCtx) {
            try {
                const tempEngine = new window.AudioEngine(this.audioCtx);
                this.defaultHitSoundBuffer = tempEngine.defaults['normal-hitnormal'];
            } catch(e) {}
        }
        if (!this.defaultHitSoundBuffer && this.audioCtx) {
            try {
                const sr = this.audioCtx.sampleRate;
                const len = Math.max(1, Math.floor(0.06 * sr));
                const buf = this.audioCtx.createBuffer(1, len, sr);
                const d = buf.getChannelData(0);
                for (let i = 0; i < len; i++) {
                    const t = i / sr;
                    d[i] = Math.sin(2 * Math.PI * 1400 * t) * Math.exp(-t * 60) * 0.6;
                }
                this.defaultHitSoundBuffer = buf;
            } catch(e) {}
        }

        this.loop = this.loop.bind(this);

        this.hudScore = document.getElementById('hud-score');
        this.hudAcc = document.getElementById('hud-acc');
        this.hudPP = document.getElementById('hud-pp');
        this.hudUR = document.getElementById('hud-ur');
        this.hudRank = document.getElementById('hud-rank');
        this.progressBar = document.getElementById('song-progress-bar');

        this.lastMultiSend = 0;

        if (this.canvas) this.canvas.style.filter = 'none';

        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.fpsUpdateTime = 0;

        try {
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.connect(this.audioCtx.destination);
            this.musicGain = this.audioCtx.createGain();
            this.musicGain.connect(this.masterGain);
            
            this.hitSounds = loadedHitSounds;
            this.sfxGain = this.audioCtx.createGain();
            this.sfxGain.connect(this.masterGain);

            const mVol = (userSettings.masterVol !== undefined ? userSettings.masterVol : 100) / 100;
            const bgVol = (userSettings.bgVol !== undefined ? userSettings.bgVol : 50) / 100;
            const muVol = (userSettings.musicVol !== undefined ? userSettings.musicVol : 100) / 100;
            const sfxVol = (userSettings.sfxVol !== undefined ? userSettings.sfxVol : 100) / 100;

            if (this.masterGain && this.masterGain.gain) {
                this.masterGain.gain.value = document.hasFocus() ? mVol : bgVol;
            }
            if (this.musicGain && this.musicGain.gain) {
                this.musicGain.gain.value = muVol;
            }
            if (this.sfxGain && this.sfxGain.gain) {
                this.sfxGain.gain.value = sfxVol;
            }
        } catch (e) {
            console.warn("Audio Context Node setup encountered a problem", e);
        }

        let volTimeout;
        const checkVolume = () => {
            clearTimeout(volTimeout);
            volTimeout = setTimeout(() => {
                const hasFocus = document.hasFocus();
                const targetVol = (hasFocus 
                    ? (userSettings.masterVol !== undefined ? userSettings.masterVol : 100) 
                    : (userSettings.bgVol !== undefined ? userSettings.bgVol : 50)) / 100;

                if (this.masterGain && this.masterGain.gain) {
                    try {
                        if (this.audioCtx.state === 'running') {
                            this.masterGain.gain.setTargetAtTime(targetVol, this.audioCtx.currentTime, 0.2);
                        } else {
                            this.masterGain.gain.value = targetVol;
                        }
                    } catch(e) {}
                }
            }, 150); 
        };

        this.onBlur = checkVolume;
        this.onFocus = checkVolume;

        window.addEventListener('blur', this.onBlur);
        window.addEventListener('focus', this.onFocus);
    }

    _resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth, h = window.innerHeight;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.dpr = dpr;
        this.W = w;
        this.H = h;
        this.hitLineY = this.H - 120;
    }

    queueSpectatorEvent(evt) {
        this.spectatorEvents.push(evt);
        this.spectatorEvents.sort((a, b) => a.time - b.time);
    }

    _startAudioAt(offsetSec = 0) {
        if (this.audioSource) {
            try { this.audioSource.stop(); this.audioSource.disconnect(); } catch (e) {}
        }
        this.audioSource = this.audioCtx.createBufferSource();
        this.audioSource.buffer = this.audioBuffer;
        if (this.audioSource.playbackRate) {
            this.audioSource.playbackRate.value = this.playbackRate;
        }
        if (this.musicGain) this.audioSource.connect(this.musicGain);
        else this.audioSource.connect(this.audioCtx.destination);

        const delaySeconds = offsetSec === 0 ? (this.spectatorDelay / 1000) : 0;
        this.audioOffsetSec = offsetSec;
        this.fallbackStartTime = performance.now() + delaySeconds * 1000 - (offsetSec * 1000) / this.playbackRate;

        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(e => console.warn("Audio autoplay prevented", e));
        }

        this.startTime = this.audioCtx.currentTime + delaySeconds - (offsetSec / this.playbackRate);
        this.audioSource.start(this.audioCtx.currentTime + delaySeconds, Math.max(0, offsetSec));

        // Advance nextSoundNoteIndex past skipped time
        const targetMs = offsetSec * 1000;
        while (this.nextSoundNoteIndex < this.notes.length && this.notes[this.nextSoundNoteIndex].time < targetMs) {
            this.notes[this.nextSoundNoteIndex].soundPlayed = true;
            this.nextSoundNoteIndex++;
        }

        if (window.videoPlayer) {
            const decoderVideo = document.getElementById('decoder-video');
            if (decoderVideo && decoderVideo.src && offsetSec > 0) {
                try { decoderVideo.currentTime = offsetSec; } catch (e) {}
            }
            if (delaySeconds > 0) {
                setTimeout(() => { if (this.isRunning && !this.isPaused) window.videoPlayer.play(); }, delaySeconds * 1000);
            } else {
                window.videoPlayer.play();
            }
        }
    }

    start() {
        window.isStdGameplayActive = false;
        this._startAudioAt(0);
        this.isRunning = true;
        this.isPaused = false;
        requestAnimationFrame(this.loop);
    }

    skip() {
        if (isMulti || this.isSpectator || this.isPaused || this.state.failed) return;
        const now = this.getTime();
        if (now < this.firstNoteTime - 2500) {
            const targetSec = Math.max(0, (this.firstNoteTime - 1800) / 1000);
            this._startAudioAt(targetSec);
        }
    }

    pause() {
        if (isMulti) return; 
        if (!this.isRunning || this.isPaused || this.state.failed) return;
        this.isPaused = true;
        if (this.audioCtx.state === 'running') this.audioCtx.suspend();
        
        if (window.videoPlayer) window.videoPlayer.pause();
        
        const pauseScreen = document.getElementById('pause-screen');
        if (pauseScreen) pauseScreen.classList.add('active');
        const pauseTitle = document.getElementById('pause-title');
        if (pauseTitle) pauseTitle.style.display = 'block';
        const pauseBtns = document.getElementById('pause-buttons');
        if (pauseBtns) pauseBtns.style.display = 'flex';
        const countdownText = document.getElementById('pause-countdown-text');
        if (countdownText) countdownText.style.display = 'none';
    }

    quit() {
        this.isRunning = false;
        window.removeEventListener('blur', this.onBlur);
        window.removeEventListener('focus', this.onFocus);
        window.removeEventListener('resize', this._resize);
        if (this.canvas && this._onCanvasPointerDown) {
            this.canvas.removeEventListener('pointerdown', this._onCanvasPointerDown);
        }

        if (this.audioSource) { try { this.audioSource.stop(); this.audioSource.disconnect(); } catch(e) {} }
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(()=>{});
    }

    endGame() {
        this.quit();
        
        if (this.state.allHitErrors.length > 0 && !this.state.failed) {
            let sum = 0;
            for (let d of this.state.allHitErrors) sum += d;
            const err = Math.round(sum / this.state.allHitErrors.length);
            localStorage.setItem('webmania_last_error', err);

            if (userSettings.autoOffset) {
                userSettings.offset += err;
                localStorage.setItem('webmania_settings', JSON.stringify(userSettings));
            }
        }

        if(this.onEnd) this.onEnd({
            mode: 3,
            failed: this.state.failed,
            acc: this.state.acc,
            score: this.state.scoreV2,
            pp: this.state.currentPP,
            combo: this.state.maxCombo,
            stats: this.state.stats,
            grade: getGrade(this.state.acc, this.state.failed, this.mods),
            mods: this.mods
        });
    }

    getTime() { 
        if (this.state.failed && !isMulti && !this.isReplay && !this.isSpectator) {
            return this.failedAtTime;
        }
        let t = 0;
        if (this.audioCtx.state === 'running') {
            t = (this.audioCtx.currentTime - this.startTime) * 1000 * this.playbackRate;
        } else {
            t = (performance.now() - this.fallbackStartTime) * this.playbackRate;
        }
        return t - (userSettings.offset || 0); 
    }

    playHitSound(buffer, volumeScale = 1.0) {
        if (!this.audioCtx || !buffer) return;
        try {
            const source = this.audioCtx.createBufferSource();
            source.buffer = buffer;
            if (Math.abs(volumeScale - 1.0) < 0.01) {
                source.connect(this.sfxGain || this.audioCtx.destination);
            } else {
                const gainNode = this.audioCtx.createGain();
                gainNode.gain.value = volumeScale;
                source.connect(gainNode);
                gainNode.connect(this.sfxGain || this.audioCtx.destination);
            }
            source.start(0);
        } catch(e) {}
    }

    playDefaultHitSound() {
        if (!this.audioCtx || !this.defaultHitSoundBuffer) return;
        this.playHitSound(this.defaultHitSoundBuffer, 0.4);
    }

    _triggerFail() {
        this.failedAtTime = this.getTime();
        this.state.failed = true;
        this.failTime = performance.now();
        if (isMulti || this.isReplay || this.isSpectator) {
            if (this.canvas) this.canvas.style.filter = 'grayscale(1)';
            return;
        }
        if (window.videoPlayer) window.videoPlayer.pause();
        if (this.audioSource && this.audioCtx) {
            try {
                const p = this.audioSource.playbackRate;
                const now = this.audioCtx.currentTime;
                p.setValueAtTime(1, now);
                p.linearRampToValueAtTime(0.05, now + 1.6);
                if (this.musicGain && this.musicGain.gain) {
                    const muVol = (userSettings.musicVol !== undefined ? userSettings.musicVol : 100) / 100;
                    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
                    this.musicGain.gain.linearRampToValueAtTime(0, now + 1.8);
                    const g = this.musicGain;
                    setTimeout(() => {
                        try { this.audioSource.stop(); } catch (e) {}
                        g.gain.cancelScheduledValues(0);
                        g.gain.value = muVol;
                    }, 1900);
                }
            } catch (e) {}
        }
        setTimeout(() => {
            if (!this.state.failed) return;
            const failScreen = document.getElementById('fail-screen');
            if (failScreen) failScreen.classList.add('active');
        }, 650);
    }

    addJudge(type, diff = 0, lane = -1, isTail = false) {
        if(this.state.failed) return; 
        
        // SD / PF Instant fail checks
        if (!isMulti && !this.isReplay && !this.isSpectator && !this.hasMod('AT') && !this.hasMod('CM')) {
            if (this.hasMod('SD') && type === 'miss') {
                this.state.hp = 0;
                this._triggerFail();
                return;
            }
            if (this.hasMod('PF') && type !== 'max' && type !== 'p300') {
                this.state.hp = 0;
                this._triggerFail();
                return;
            }
        }

        this.state.stats[type]++;
        if (type !== 'miss') {
            this.state.hitErrors.push({ diff: diff, time: this.getTime(), type: type });
            if (this.state.hitErrors.length > 60) this.state.hitErrors.shift();
            this.state.allHitErrors.push(diff);
            this.cachedUR = this.calculateUR();
        }

        if (type === 'miss') this.state.combo = 0;
        else { this.state.combo++; if (this.state.combo > this.state.maxCombo) this.state.maxCombo = this.state.combo; }
        
        let hpDelta = HP_MOD[type];
        if (this.hasMod('EZ') && hpDelta < 0) hpDelta *= 0.5;
        else if (this.hasMod('HR') && hpDelta < 0) hpDelta *= 1.4;
        this.state.hp = Math.min(100, Math.max(0, this.state.hp + hpDelta));
        
        if (this.state.hp <= 0 && !this.state.failed) {
            if (this.ezLives > 0) {
                this.ezLives--;
                this.state.hp = 100;
            } else if (this.hasMod('NF')) {
                this.state.hp = 0;
            } else {
                this._triggerFail();
                if (!isMulti && !this.isReplay && !this.isSpectator) return;
            }
        }

        this.addEffect(type);

        if (!this.isSpectator && !this.isReplay && isMulti && socket) {
            socket.emit('judge_event', {
                judgeType: type, diff, lane, isTail, time: this.getTime(),
                hp: this.state.hp, combo: this.state.combo, maxCombo: this.state.maxCombo,
                score: this.state.scoreV2, acc: this.state.acc, pp: this.state.currentPP,
                stats: this.state.stats
            });
        }

        let totalJudged = this.state.stats.max + this.state.stats.p300 + this.state.stats.p200 + this.state.stats.p100 + this.state.stats.p50 + this.state.stats.miss;
        let currentBase = this.state.stats.max * SCORES.max + this.state.stats.p300 * SCORES.p300 + this.state.stats.p200 * SCORES.p200 + this.state.stats.p100 * SCORES.p100 + this.state.stats.p50 * SCORES.p50;
        
        this.state.acc = totalJudged === 0 ? 100 : (currentBase / (totalJudged * SCORES.max)) * 100;
        
        if (this.state.totalBasePossible > 0) {
            let maxBase = this.state.totalBasePossible;
            let accScore = Math.floor(700000 * (currentBase / maxBase)); 
            let totalObj = this.notes.length * 2; 
            let comboBonus = Math.floor(300000 * (this.state.maxCombo / totalObj));
            this.state.scoreV2 = Math.round((accScore + comboBonus) * this.modMultiplier);
        }

        let score = this.state.scoreV2;
        let baseStrain = Math.pow(5 * Math.max(1, this.stars / 0.2) - 4, 2.2) / 135.0;
        let lengthBonus = 1.0 + 0.1 * Math.min(1.0, this.notes.length / 1500.0);
        
        let scoreMultiplier = 0;
        if (score <= 500000) scoreMultiplier = 0;
        else if (score <= 600000) scoreMultiplier = (score - 500000) / 100000 * 0.3;
        else if (score <= 700000) scoreMultiplier = 0.3 + (score - 600000) / 100000 * 0.25;
        else if (score <= 800000) scoreMultiplier = 0.55 + (score - 700000) / 100000 * 0.2;
        else if (score <= 900000) scoreMultiplier = 0.75 + (score - 800000) / 100000 * 0.15;
        else scoreMultiplier = 0.9 + (score - 900000) / 100000 * 0.1;
        
        let accMultiplier = Math.pow(this.state.acc / 100, 2);
        let finalPP = baseStrain * lengthBonus * scoreMultiplier * accMultiplier * 0.8;
        this.state.currentPP = Math.floor(finalPP);
    }

    applyRemoteJudge(data) {
        this.state.hp = data.hp;
        this.state.combo = data.combo;
        this.state.maxCombo = data.maxCombo;
        this.state.scoreV2 = data.score;
        this.state.acc = data.acc;
        this.state.currentPP = data.pp;
        this.state.stats = data.stats;

        if (data.judgeType !== 'miss') {
            this.state.hitErrors.push({ diff: data.diff, time: this.getTime(), type: data.judgeType });
            if (this.state.hitErrors.length > 60) this.state.hitErrors.shift();
            this.cachedUR = this.calculateUR();
        }

        this.addEffect(data.judgeType);

        if (data.lane >= 0) {
            let target = null, minDiff = Infinity;
            const startI = Math.max(0, this.headJudgeStartIndex - 20);
            for (let i = startI; i < this.notes.length; i++) {
                const note = this.notes[i];
                if (note.column !== data.lane) continue;
                if (note.time - data.time > 1000) break;
                
                if (!data.isTail && !note.headJudged) {
                    const d = Math.abs(note.time - data.time);
                    if (d < minDiff) { minDiff = d; target = note; }
                } else if (data.isTail && note.type === 'hold' && note.headJudged && !note.tailJudged) {
                    const d = Math.abs(note.endTime - data.time);
                    if (d < minDiff) { minDiff = d; target = note; }
                }
            }
            if (target) {
                if (!data.isTail) {
                    target.headJudged = true;
                    if (target.type === 'hold' && data.judgeType !== 'miss') {
                        target.isHolding = true;
                        this.holdingNotes[data.lane] = target;
                    }
                } else {
                    target.tailJudged = true;
                    target.isHolding = false;
                    this.holdingNotes[data.lane] = null;
                }
            }
        }
    }

    calculateUR() {
        if (this.state.hitErrors.length === 0) return 0;
        let sum = 0; for (let h of this.state.hitErrors) sum += h.diff;
        let mean = sum / this.state.hitErrors.length;
        let varianceSum = 0; for (let h of this.state.hitErrors) varianceSum += Math.pow(h.diff - mean, 2);
        return Math.sqrt(varianceSum / this.state.hitErrors.length) * 10;
    }

    updateHUD() {
        // Only update DOM on demand (e.g. pause/gameover) to prevent layout thrashing during 240+ FPS gameplay
        if (this.hudScore) this.hudScore.innerText = this.state.scoreV2.toString().padStart(7, '0');
        if (this.hudAcc) this.hudAcc.innerText = this.state.acc.toFixed(2) + '%';
        if (this.hudPP) this.hudPP.innerText = this.state.currentPP;
        if (this.hudUR) this.hudUR.innerText = (this.cachedUR || 0).toFixed(2);
    }

    addEffect(type) {
        if (userSettings && userSettings.hide300 === true && (type === 'max' || type === 'p300')) {
            return;
        }
        const colors = { max: '#8ef', p300: '#8cf', p200: '#7f7', p100: '#7f7', p50: '#fc6', miss: '#f44' };
        const texts = { max: 'MAX', p300: '300', p200: '200', p100: '100', p50: '50', miss: 'MISS' };
        this.state.effect = { text: texts[type], color: colors[type], startTime: this.getTime(), type: type };
    }

    onKeyDown(lane, forcedTime = null) {
        if (!this.isRunning || this.isPaused || this.state.failed || lane >= this.laneCount) return;
        if (!forcedTime && (this.hasMod('AT') || this.hasMod('CM'))) return;
        
        this.keys[lane] = true;
        const now = forcedTime !== null ? forcedTime : this.getTime();

        if (!this.isSpectator && !this.isReplay && isMulti && socket) {
            socket.emit('key_event', { type: 'down', lane, time: now });
        }

        if (!this.isSpectator && !this.isReplay && forcedTime === null) {
            this.recordedEvents.push({ type: 'down', lane, time: now });
        }

        while (this.headJudgeStartIndex < this.notes.length && this.notes[this.headJudgeStartIndex].headJudged) {
            this.headJudgeStartIndex++;
        }

        let target = null, minDiff = Infinity;
        for (let i = this.headJudgeStartIndex; i < this.notes.length; i++) {
            const note = this.notes[i];
            if (note.column !== lane || note.headJudged) continue;
            
            const diff = note.time - now;
            
            // 按太早或者还在很远的未来，忽略之后的寻找
            if (diff > this.judge.miss) break; 

            // 如果按键落在了我们的判定窗口内（包括了 early miss 窗口）
            if (Math.abs(diff) <= this.judge.miss && Math.abs(diff) < minDiff) { 
                minDiff = Math.abs(diff); 
                target = note; 
            }
        }

        if (target && !this.isSpectator) { 
            const diff = now - target.time;
            const absDiff = Math.abs(diff);
            let j = 'miss';
            if (absDiff <= this.judge.max) j = 'max'; 
            else if (absDiff <= this.judge.p300) j = 'p300'; 
            else if (absDiff <= this.judge.p200) j = 'p200'; 
            else if (absDiff <= this.judge.p100) j = 'p100'; 
            else if (absDiff <= this.judge.p50) j = 'p50';
            else j = 'miss'; // 这里就是按太早的情况触发了Miss
            
            target.headJudged = true;
            this.addJudge(j, diff, lane, false); 
            
            if (target.type === 'hold') {
                if (j !== 'miss') {
                    target.isHolding = true;
                    this.holdingNotes[lane] = target;
                } else {
                    // 头部如果判定为Miss（如按太早），那么长按的尾巴直接连带作为Miss处理
                    target.tailJudged = true;
                    target.isHolding = false;
                    this.holdingNotes[lane] = null;
                    this.addJudge('miss', diff, lane, true); 
                }
            }
        }
    }

    onKeyUp(lane, forcedTime = null) {
        if (!this.isRunning || this.isPaused || this.state.failed || lane >= this.laneCount || this.isSpectator) return;
        if (!forcedTime && (this.hasMod('AT') || this.hasMod('CM'))) return;

        this.keys[lane] = false;
        const now = forcedTime !== null ? forcedTime : this.getTime();

        if (!this.isReplay && isMulti && socket) {
            socket.emit('key_event', { type: 'up', lane, time: now });
        }

        if (!this.isReplay && forcedTime === null) {
            this.recordedEvents.push({ type: 'up', lane, time: now });
        }

        // O(1) direct lookup of currently held note for this lane
        const note = this.holdingNotes[lane];
        if (note && note.type === 'hold' && note.isHolding && !note.tailJudged) {
            this.holdingNotes[lane] = null;
            note.isHolding = false;
            note.tailJudged = true;
            const diff = now - note.endTime;
            if (diff < -this.judge.p50) {
                this.addJudge('miss', diff, lane, true);
            } else {
                const absDiff = Math.abs(diff);
                let j = 'miss';
                if (absDiff <= this.judge.max) j = 'max'; 
                else if (absDiff <= this.judge.p300) j = 'p300'; 
                else if (absDiff <= this.judge.p200) j = 'p200'; 
                else if (absDiff <= this.judge.p100) j = 'p100'; 
                else if (absDiff <= this.judge.p50) j = 'p50';
                this.addJudge(j, diff, lane, true); 
            }
        }
    }

    loop() {
        if (!this.isRunning || this.isPaused) return;

        const hrTime = performance.now();
        if (userSettings.fpsLimit && userSettings.fpsLimit !== 'unlimited') {
            const targets = { 'vsync': 60, '2x': 120, '4x': 240, '8x': 480 };
            const targetFps = targets[userSettings.fpsLimit] || 60;
            if (hrTime - this.lastFrameTime < (1000 / targetFps) - 1.5) {
                requestAnimationFrame(this.loop);
                return;
            }
        }
        
        if (userSettings.showFps && !this.isSpectator) {
            this.frameCount++;
            if (hrTime - this.fpsUpdateTime >= 1000) {
                const fpsEl = document.getElementById('fps-counter');
                if(fpsEl) fpsEl.innerText = this.frameCount + ' FPS';
                this.frameCount = 0;
                this.fpsUpdateTime = hrTime;
            }
        }

        this.lastFrameTime = hrTime;

        const now = this.getTime();
        
        if (this.state.failed && !isMulti && !this.isReplay && !this.isSpectator) {
            this.draw(now);
            requestAnimationFrame(this.loop);
            return;
        }

        if (isMulti && socket && !this.isSpectator && !this.isReplay && now - this.lastMultiSend > 100) {
            socket.emit('game_update', { score: this.state.scoreV2, combo: this.state.combo, acc: this.state.acc, maxCombo: this.state.maxCombo, failed: this.state.failed });
            this.lastMultiSend = now;
        }

        if (now > this.lastNoteTime + 1500) { this.endGame(); return; }

        if (this.isReplay) {
            while (this.remoteKeyEvents.length > 0 && this.remoteKeyEvents[0].time <= now) {
                const evt = this.remoteKeyEvents.shift();
                if (evt.type === 'down') this.onKeyDown(evt.lane, evt.time);
                else if (evt.type === 'up') this.onKeyUp(evt.lane, evt.time);
            }
        }

        if (this.isSpectator) {
            while (this.spectatorEvents.length > 0 && this.spectatorEvents[0].time <= now) {
                const evt = this.spectatorEvents.shift();
                if (evt.eventType === 'key') {
                    this.keys[evt.lane] = (evt.action === 'down');
                } else if (evt.eventType === 'judge') {
                    this.applyRemoteJudge(evt);
                }
            }
        }

        const enableSounds = userSettings.enableHitSounds !== false;
        if (enableSounds && !this.isPaused && this.isRunning) {
            while (this.nextSoundNoteIndex < this.notes.length && now >= this.notes[this.nextSoundNoteIndex].time) {
                const note = this.notes[this.nextSoundNoteIndex];
                if (!note.soundPlayed) {
                    note.soundPlayed = true;
                    if (note.samples && note.samples.length > 0) {
                        for (let s of note.samples) {
                            const buffer = this.hitSounds[s.filename];
                            if (buffer) this.playHitSound(buffer, s.volume / 100);
                        }
                    } else {
                        this.playDefaultHitSound();
                    }
                }
                this.nextSoundNoteIndex++;
            }
        }

        // Nightcore (NC) drum beat synchronization
        if (this.hasMod('NC') && this.audioCtx && this.timingPoints && this.timingPoints.length > 0) {
            let activeTp = this.timingPoints[0];
            for (let i = 0; i < this.timingPoints.length; i++) {
                if (this.timingPoints[i].time <= now) {
                    activeTp = this.timingPoints[i];
                } else {
                    break;
                }
            }
            if (activeTp && activeTp.beatLength > 0 && now >= this.firstNoteTime - 500) {
                const beatIdx = Math.floor((now - activeTp.time) / activeTp.beatLength);
                if (beatIdx !== this.lastNcBeat && beatIdx >= 0) {
                    this.lastNcBeat = beatIdx;
                    if (typeof playNightcoreBeat === 'function') {
                        playNightcoreBeat(this.audioCtx, this.sfxGain, beatIdx);
                    }
                }
            }
        }

        // Auto (AT) / Cinema (CM) automated replay logic
        if (!this.isSpectator && (this.hasMod('AT') || this.hasMod('CM'))) {
            while (this.headJudgeStartIndex < this.notes.length && this.notes[this.headJudgeStartIndex].headJudged) {
                this.headJudgeStartIndex++;
            }
            for (let i = this.headJudgeStartIndex; i < this.notes.length; i++) {
                const note = this.notes[i];
                if (note.time - now > 50) break;
                if (!note.headJudged && now >= note.time) {
                    note.headJudged = true;
                    this.keys[note.column] = true;
                    this.addJudge('max', 0, note.column, false);
                    if (note.type === 'hold') {
                        note.isHolding = true;
                        this.holdingNotes[note.column] = note;
                    } else {
                        const col = note.column;
                        setTimeout(() => { if (this.keys) this.keys[col] = false; }, 60);
                    }
                }
            }
            for (let lane = 0; lane < this.laneCount; lane++) {
                const note = this.holdingNotes[lane];
                if (note && note.type === 'hold' && note.isHolding && now >= note.endTime && !note.tailJudged) {
                    note.tailJudged = true;
                    note.isHolding = false;
                    this.holdingNotes[lane] = null;
                    this.keys[lane] = false;
                    this.addJudge('max', 0, lane, true);
                }
            }
        }

        const missThreshold = this.isReplay ? this.judge.p50 + 400 : this.judge.p50;

        if (!this.isSpectator && !this.hasMod('AT') && !this.hasMod('CM')) {
            // 1. Check completed hold notes in O(laneCount)
            for (let lane = 0; lane < this.laneCount; lane++) {
                const note = this.holdingNotes[lane];
                if (note && note.type === 'hold' && note.headJudged && note.isHolding && now > note.endTime && !note.tailJudged) {
                    note.tailJudged = true;
                    note.isHolding = false;
                    this.holdingNotes[lane] = null;
                    this.addJudge('max', 0, note.column, true);
                }
            }

            // 2. Advance missJudgeStartIndex as heads are judged
            while (this.missJudgeStartIndex < this.notes.length && this.notes[this.missJudgeStartIndex].headJudged) {
                this.missJudgeStartIndex++;
            }

            for (let i = this.missJudgeStartIndex; i < this.notes.length; i++) {
                const note = this.notes[i];
                if (note.time - now > missThreshold) break;
                
                // 完全漏掉（没有按）
                if (!note.headJudged && now > note.time + missThreshold) { 
                    note.headJudged = true; 
                    this.addJudge('miss', missThreshold, note.column, false); 
                    if (note.type === 'hold') {
                        // 头部没按导致直接错过，那么尾部肯定也算作漏掉了（连带Miss惩罚）
                        note.tailJudged = true; 
                        note.isHolding = false; 
                        if (this.holdingNotes[note.column] === note) this.holdingNotes[note.column] = null;
                        this.addJudge('miss', missThreshold, note.column, true);
                    }
                }
            }
        }

        this.draw(now);
        requestAnimationFrame(this.loop);
    }

    draw(now) {
        const ctx = this.ctx;
        const W = this.W, H = this.H, dpr = this.dpr;

        // Cinema (CM) mode: completely hide game HUD/track and only allow background/video playback
        if (this.hasMod('CM')) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);
            return;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const offsetX = (W - this.trackWidth) / 2;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(10,10,15,0.85)';
        ctx.fillRect(offsetX, 0, this.trackWidth, H);

        // Track side borders
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(offsetX, 0); ctx.lineTo(offsetX, H);
        ctx.moveTo(offsetX + this.trackWidth, 0); ctx.lineTo(offsetX + this.trackWidth, H);
        ctx.stroke();

        ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
        for (let i = 1; i < this.laneCount; i++) {
            ctx.beginPath(); ctx.moveTo(offsetX + i * this.laneWidth, 0); ctx.lineTo(offsetX + i * this.laneWidth, H); ctx.stroke();
        }

        ctx.fillStyle = '#60a5fa'; ctx.fillRect(offsetX, this.hitLineY, this.trackWidth, 4);

        for (let i = 0; i < this.laneCount; i++) {
            if (this.keys[i]) { 
                ctx.fillStyle = this.laneColors[i]; 
                ctx.globalAlpha = 0.2;
                ctx.fillRect(offsetX + i * this.laneWidth, this.hitLineY, this.laneWidth, H - this.hitLineY); 
                ctx.globalAlpha = 1.0;
            }
        }

        while (this.drawTimeStartIndex < this.notes.length && this.notes[this.drawTimeStartIndex].time < now - 300) {
            this.drawTimeStartIndex++;
        }

        const maxFutureTime = ((this.hitLineY + 60) / this.scrollSpeed) * 1000;
        let endIdx = this.drawTimeStartIndex;
        while (endIdx < this.notes.length && (this.notes[endIdx].time - now) < maxFutureTime) {
            endIdx++;
        }

        for (let i = endIdx - 1; i >= this.drawTimeStartIndex; i--) {
            const note = this.notes[i]; const color = this.laneColors[note.column]; const x = offsetX + note.column * this.laneWidth;
            if (note.type === 'hold') {
                if (note.tailJudged) continue;
                let startY = this.hitLineY - ((note.time - now) / 1000) * this.scrollSpeed;
                let endY = this.hitLineY - ((note.endTime - now) / 1000) * this.scrollSpeed;
                if (note.isHolding) startY = this.hitLineY;
                if (startY > 0 && endY < H) {
                    let modAlpha = 1.0;
                    if (this.hasMod('HD')) {
                        const prog = startY / this.hitLineY;
                        modAlpha = prog <= 0.4 ? 1.0 : prog >= 0.7 ? 0.0 : (1.0 - (prog - 0.4) / 0.3);
                    } else if (this.hasMod('FI')) {
                        const prog = startY / this.hitLineY;
                        modAlpha = prog <= 0.3 ? 0.0 : prog >= 0.65 ? 1.0 : ((prog - 0.3) / 0.35);
                    }
                    if (modAlpha <= 0.01) continue;
                    ctx.globalAlpha = 0.5 * modAlpha; ctx.fillStyle = color; ctx.fillRect(x + 2, endY, this.laneWidth - 4, startY - endY); ctx.globalAlpha = modAlpha;
                    if (!note.headJudged) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 2, startY - 15, this.laneWidth - 4, 15); }
                    ctx.fillStyle = color; ctx.fillRect(x + 2, endY, this.laneWidth - 4, 15);
                    ctx.globalAlpha = 1.0;
                }
            } else {
                if (note.headJudged) continue;
                const y = this.hitLineY - ((note.time - now) / 1000) * this.scrollSpeed;
                if (y > -20 && y < H + 20) {
                    let modAlpha = 1.0;
                    if (this.hasMod('HD')) {
                        const prog = y / this.hitLineY;
                        modAlpha = prog <= 0.4 ? 1.0 : prog >= 0.7 ? 0.0 : (1.0 - (prog - 0.4) / 0.3);
                    } else if (this.hasMod('FI')) {
                        const prog = y / this.hitLineY;
                        modAlpha = prog <= 0.3 ? 0.0 : prog >= 0.65 ? 1.0 : ((prog - 0.3) / 0.35);
                    }
                    if (modAlpha <= 0.01) continue;
                    ctx.globalAlpha = modAlpha;
                    ctx.fillStyle = color; ctx.fillRect(x + 2, y - 15, this.laneWidth - 4, 15);
                    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 8, y - 10, this.laneWidth - 16, 5);
                    ctx.globalAlpha = 1.0;
                }
            }
        }

        // Also draw any actively held notes whose start time was before drawTimeStartIndex
        const minVisibleTime = this.drawTimeStartIndex < this.notes.length ? this.notes[this.drawTimeStartIndex].time : now - 300;
        for (let lane = 0; lane < this.laneCount; lane++) {
            const note = this.holdingNotes[lane];
            if (note && note.type === 'hold' && !note.tailJudged && note.time < minVisibleTime) {
                const color = this.laneColors[note.column];
                const x = offsetX + note.column * this.laneWidth;
                let startY = this.hitLineY;
                let endY = this.hitLineY - ((note.endTime - now) / 1000) * this.scrollSpeed;
                if (startY > 0 && endY < H) {
                    let modAlpha = 1.0;
                    if (this.hasMod('HD')) {
                        const prog = startY / this.hitLineY;
                        modAlpha = prog <= 0.4 ? 1.0 : prog >= 0.7 ? 0.0 : (1.0 - (prog - 0.4) / 0.3);
                    } else if (this.hasMod('FI')) {
                        const prog = startY / this.hitLineY;
                        modAlpha = prog <= 0.3 ? 0.0 : prog >= 0.65 ? 1.0 : ((prog - 0.3) / 0.35);
                    }
                    if (modAlpha > 0.01) {
                        ctx.globalAlpha = 0.5 * modAlpha; ctx.fillStyle = color; ctx.fillRect(x + 2, endY, this.laneWidth - 4, startY - endY); ctx.globalAlpha = modAlpha;
                        ctx.fillStyle = color; ctx.fillRect(x + 2, endY, this.laneWidth - 4, 15);
                        ctx.globalAlpha = 1.0;
                    }
                }
            }
        }

        // Flashlight (FL) illuminated horizontal mask
        if (this.hasMod('FL')) {
            ctx.save();
            let slitHeight = 240;
            if (this.state.combo >= 200) slitHeight = 160;
            else if (this.state.combo >= 100) slitHeight = 200;
            const topOfSlit = this.hitLineY - slitHeight * 0.75;
            const bottomOfSlit = this.hitLineY + slitHeight * 0.25;

            // Darkness above
            if (topOfSlit > 0) {
                ctx.fillStyle = '#050508';
                ctx.fillRect(offsetX, 0, this.trackWidth, Math.max(0, topOfSlit - 50));
                const gradTop = ctx.createLinearGradient(0, topOfSlit - 50, 0, topOfSlit);
                gradTop.addColorStop(0, '#050508');
                gradTop.addColorStop(1, 'rgba(5,5,8,0)');
                ctx.fillStyle = gradTop;
                ctx.fillRect(offsetX, topOfSlit - 50, this.trackWidth, 50);
            }

            // Darkness below
            if (bottomOfSlit < H) {
                const gradBot = ctx.createLinearGradient(0, bottomOfSlit, 0, bottomOfSlit + 50);
                gradBot.addColorStop(0, 'rgba(5,5,8,0)');
                gradBot.addColorStop(1, '#050508');
                ctx.fillStyle = gradBot;
                ctx.fillRect(offsetX, bottomOfSlit, this.trackWidth, 50);
                ctx.fillStyle = '#050508';
                ctx.fillRect(offsetX, bottomOfSlit + 50, this.trackWidth, Math.max(0, H - (bottomOfSlit + 50)));
            }
            ctx.restore();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Combo (std font & dark stroke outline at mania's track-center position)
        if (this.state.combo > 5) {
            ctx.font = 'bold 50px "Segoe UI", Arial';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.strokeText(this.state.combo, W / 2, H / 2 - 42);
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillText(this.state.combo, W / 2, H / 2 - 42);

            ctx.font = 'bold 16px "Segoe UI", Arial';
            ctx.lineWidth = 3;
            ctx.strokeText('COMBO', W / 2, H / 2 - 8);
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.fillText('COMBO', W / 2, H / 2 - 8);
        }

        // Judgement text (std palette + easeOut pop-in scale + dark outline at mania's position)
        if (this.state.effect) {
            const ef = this.state.effect;
            const elapsed = Math.max(0, now - ef.startTime);
            const duration = 500;
            if (elapsed >= duration) {
                this.state.effect = null;
            } else {
                const k = elapsed / duration;
                const scale = 1 + 0.22 * maniaEaseOut(Math.min(1, k * 4));
                const alpha = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
                const jy = this.hitLineY - 110 + (ef.type === 'miss' ? 20 * k : 0);
                ctx.save();
                ctx.translate(W / 2, jy);
                ctx.scale(scale, scale);
                ctx.globalAlpha = maniaClamp(alpha, 0, 1);
                ctx.font = 'bold 32px "Segoe UI", Arial';
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(0,0,0,0.65)';
                ctx.strokeText(ef.text, 0, 0);
                ctx.fillStyle = ef.color;
                ctx.fillText(ef.text, 0, 0);
                ctx.restore();
            }
        }

        ctx.textBaseline = 'alphabetic';

        // Hit Error Meter (std 3-color zones + colored fading ticks + white moving-average triangle at mania's position)
        if (userSettings.hitErrorMeter !== false) {
            const ex = W / 2, ey = this.hitLineY + 60, scaleE = 1.5;
            const w50 = this.judge.p50 * scaleE;
            const w100 = this.judge.p100 * scaleE;
            const w300 = this.judge.p300 * scaleE;
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = '#d9a74a'; ctx.fillRect(ex - w50, ey - 3, w50 * 2, 6);
            ctx.fillStyle = '#57e313'; ctx.fillRect(ex - w100, ey - 3, w100 * 2, 6);
            ctx.fillStyle = '#32bce7'; ctx.fillRect(ex - w300, ey - 3, w300 * 2, 6);
            ctx.fillStyle = '#fff'; ctx.fillRect(ex - 1, ey - 12, 2, 24);
            for (let i = 0; i < this.state.hitErrors.length; i++) {
                const err = this.state.hitErrors[i];
                const age = now - err.time;
                if (age > 6000 || age < 0) continue;
                ctx.globalAlpha = maniaClamp(1 - age / 6000, 0, 1) * 0.9;
                const absErr = Math.abs(err.diff);
                ctx.fillStyle = absErr <= this.judge.p300 ? '#32bce7' : absErr <= this.judge.p100 ? '#57e313' : '#d9a74a';
                ctx.fillRect(ex + err.diff * scaleE - 1.5, ey - 10, 3, 20);
            }
            ctx.globalAlpha = 1.0;
            if (this.state.hitErrors.length > 0) {
                const errs = this.state.hitErrors;
                const len = errs.length;
                const count = len > 20 ? 20 : len;
                let sum = 0;
                for (let j = len - count; j < len; j++) sum += errs[j].diff;
                const avg = sum / count;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(ex + avg * scaleE, ey - 14);
                ctx.lineTo(ex + avg * scaleE - 5, ey - 21);
                ctx.lineTo(ex + avg * scaleE + 5, ey - 21);
                ctx.fill();
            }
        }

        // Track-top HP Bar (std style: rgba(0,0,0,0.5) background, #ffffff fill, #ff4d4d when < 20%)
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(offsetX, 0, this.trackWidth, 12);
        ctx.fillStyle = this.state.hp < 20 ? '#ff4d4d' : '#ffffff';
        ctx.fillRect(offsetX, 0, (this.state.hp / 100) * this.trackWidth, 12);

        // Unified Top-Right HUD (Score + ACC + Circular Progress Pie + PP/UR/Rank)
        const uiScale = userSettings.uiScale || 1.0;
        const u = Math.max(0.6, H / 900) * uiScale;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.font = `bold ${40 * u}px "Segoe UI", Consolas, monospace`;
        ctx.fillText(String(Math.round(this.state.scoreV2)).padStart(8, '0'), W - 16 * u, 52 * u);
        ctx.font = `bold ${24 * u}px "Segoe UI", Arial`;
        ctx.fillText(this.state.acc.toFixed(2) + '%', W - 16 * u, 84 * u);

        // Progress Pie
        const prog = maniaClamp((now - this.firstNoteTime) / Math.max(1, this.lastNoteTime - this.firstNoteTime), 0, 1);
        const pcx = W - 160 * u, pcy = 76 * u, pr = 11 * u;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, MANIA_TAU); ctx.stroke();
        ctx.fillStyle = now < this.firstNoteTime ? 'rgba(120,255,120,0.7)' : 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.moveTo(pcx, pcy);
        if (now < this.firstNoteTime) {
            const k = maniaClamp((this.firstNoteTime - now) / Math.max(1, this.firstNoteTime), 0, 1);
            ctx.arc(pcx, pcy, pr, -Math.PI / 2, -Math.PI / 2 + MANIA_TAU * k);
        } else {
            ctx.arc(pcx, pcy, pr, -Math.PI / 2, -Math.PI / 2 + MANIA_TAU * prog);
        }
        ctx.fill();

        // PP & UR & Rank
        if (!this.isSpectator) {
            ctx.font = `bold ${15 * u}px "Segoe UI", Arial`;
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.fillText(`PP ${this.state.currentPP}   UR ${(this.cachedUR || 0).toFixed(2)}`, W - 16 * u, 110 * u);
            if (!isMulti && !this.isReplay && this.leaderboard.length > 0 && this.state.scoreV2 > 0) {
                let rank = 1;
                for (let s of this.leaderboard) { if (this.state.scoreV2 < s._realScore) rank++; }
                ctx.font = `bold ${26 * u}px "Segoe UI", Arial`;
                ctx.fillStyle = '#fbbf24';
                ctx.fillText('#' + rank, W - 16 * u, 140 * u);
            }
        }

        // Intro Skip Button (std style bottom-right)
        ctx.textAlign = 'center';
        if (now < this.firstNoteTime - 2500 && !this.isPaused && !this.state.failed && !isMulti && !this.isSpectator) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(W - 200 * u, H - 110 * u, 180 * u, 50 * u);
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${22 * u}px "Segoe UI", Arial`;
            ctx.fillText('SKIP ▶ (Space)', W - 110 * u, H - 77 * u);
        }

        let currentBreak = null;
        for (let i = 0; i < this.breaks.length; i++) {
            const b = this.breaks[i];
            if (now >= b.startTime && now <= b.endTime) {
                currentBreak = b;
                break;
            }
        }
        
        if (currentBreak) {
            if (!this.inBreak) {
                this.inBreak = true;
                const bgEl = document.getElementById('game-bg');
                const vidEl = document.getElementById('bg-video-canvas');
                if (bgEl) bgEl.style.filter = `brightness(0.05) blur(${userSettings.bgBlur || 8}px)`;
                if (vidEl && vidEl.style.display !== 'none') vidEl.style.filter = `brightness(0.05)`;
            }
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, W, H);
            
            const progress = Math.min(1, Math.max(0, (now - currentBreak.startTime) / (currentBreak.endTime - currentBreak.startTime)));
            const barMaxWidth = Math.min(600, W * 0.75);
            const barWidth = barMaxWidth * (1 - progress);
            const barX = (W - barWidth) / 2;
            const barY = H / 2;
            
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(barX, barY, barWidth, 6);
            
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(barX, barY + 1, barWidth, 2);
            
            const timeLeft = Math.ceil((currentBreak.endTime - now) / 1000);
            ctx.font = '800 50px Consolas, monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.fillText(timeLeft, W / 2, barY - 30);
            ctx.shadowBlur = 0;
            
            const grade = getGrade(this.state.acc, this.state.failed);
            let gradeColor = '#71717a';
            if (grade === 'SS') gradeColor = '#fbbf24';
            else if (grade === 'S') gradeColor = '#f59e0b';
            else if (grade === 'A') gradeColor = '#34d399';
            else if (grade === 'B') gradeColor = '#60a5fa';
            else if (grade === 'C') gradeColor = '#f43f5e';
            else if (grade === 'D') gradeColor = '#ef4444';
            
            ctx.font = '600 24px Segoe UI';
            ctx.fillStyle = '#aaaaaa';
            ctx.fillText(`ACC: ${this.state.acc.toFixed(2)}%`, W / 2, barY + 50);
            
            ctx.font = 'italic 800 36px Segoe UI';
            ctx.fillStyle = gradeColor;
            ctx.fillText(grade, W / 2, barY + 95);
            
        } else {
            if (this.inBreak) {
                this.inBreak = false;
                const dimVal = (100 - (userSettings.bgDim !== undefined ? userSettings.bgDim : 80)) / 100;
                let bgFilterStr = `brightness(${dimVal})`;
                if (userSettings.bgBlur > 0) bgFilterStr += ` blur(${userSettings.bgBlur}px)`;
                const vidFilterStr = `brightness(${dimVal})`;
                const bgEl = document.getElementById('game-bg');
                const vidEl = document.getElementById('bg-video-canvas');
                if (bgEl) bgEl.style.filter = bgFilterStr;
                if (vidEl) vidEl.style.filter = vidFilterStr;
            }
        }

        if (typeof retryProgress !== 'undefined' && retryProgress > 0) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(offsetX, H / 2 - 50, this.trackWidth, 100);

            const barMaxWidth = this.trackWidth * 0.8;
            const barWidth = barMaxWidth * (retryProgress / 100);
            const barX = offsetX + (this.trackWidth - barMaxWidth) / 2;
            const barY = H / 2 + 10;
            
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#3b82f6';
            ctx.fillStyle = '#3b82f6'; 
            ctx.fillRect(barX, barY, barWidth, 8);
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(barX, barY + 2, barWidth, 4);

            ctx.font = '800 22px Segoe UI';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 5;
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.fillText('快速重试...', offsetX + this.trackWidth / 2, barY - 15);
            ctx.shadowBlur = 0;
        }

        if (typeof escProgress !== 'undefined' && escProgress > 0) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(offsetX, H / 2 - 50, this.trackWidth, 100);

            const barMaxWidth = this.trackWidth * 0.8;
            const barWidth = barMaxWidth * (escProgress / 100);
            const barX = offsetX + (this.trackWidth - barMaxWidth) / 2;
            const barY = H / 2 + 10;
            
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ef4444';
            ctx.fillStyle = '#ef4444'; 
            ctx.fillRect(barX, barY, barWidth, 8);
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(barX, barY + 2, barWidth, 4);

            ctx.font = '800 22px Segoe UI';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 5;
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.fillText('返回房间...', offsetX + this.trackWidth / 2, barY - 15);
            ctx.shadowBlur = 0;
        }

        if (this.state.failed && !isMulti && !this.isReplay && !this.isSpectator) {
            const k = maniaClamp((performance.now() - this.failTime) / 800, 0, 1);
            ctx.fillStyle = `rgba(80,0,0,${0.5 * k})`;
            ctx.fillRect(0, 0, W, H);
        }
    }
}

async function initGame(isSpectating) {
    const initId = ++currentInitId; 

    try {
        const gameBgEl = document.getElementById('game-bg');
        const videoCanvas = document.getElementById('bg-video-canvas');

        const dimVal = (100 - (userSettings.bgDim !== undefined ? userSettings.bgDim : 80)) / 100;
        let bgFilterStr = `brightness(${dimVal})`;
        if (userSettings.bgBlur > 0) bgFilterStr += ` blur(${userSettings.bgBlur}px)`;
        const videoFilterStr = `brightness(${dimVal})`; // Never blur BGA video

        if (selectedMap.bgPath && gameBgEl) {
            const bgUrl = `${LOCAL_API_URL}/file?path=${encodeURIComponent(selectedMap.bgPath)}`;
            gameBgEl.style.backgroundImage = `url("${bgUrl}")`;
            gameBgEl.style.filter = bgFilterStr;
        }

        if (!selectedMap.audioPath) {
            alert('音频加载失败。');
            window.location.href = isMulti ? 'multiplayer.html' : 'index.html';
            return;
        }

        const osuRes = await fetch(`${LOCAL_API_URL}/file?path=${encodeURIComponent(selectedMap.osuPath)}`);
        if (initId !== currentInitId) return; 
        const osuText = await osuRes.text();
        if (initId !== currentInitId) return; 
        const parsed = parseOsuFile(osuText);
        const isStdMode = (selectedMap.mode === 0) || (parsed.mode === 0);

        let stdBeatmap = null;
        if (isStdMode && window.OsuBeatmap) {
            stdBeatmap = window.OsuBeatmap.parseBeatmap(osuText);
        }

        KEY_MAP = {};
        if (!isStdMode) {
            const currentCS = parsed.cs || selectedMap.cs || 4;
            let currentBinds = userSettings.keyBinds[currentCS];
            if (!currentBinds) currentBinds = [];
            currentBinds.forEach((binds, laneIndex) => {
                binds.forEach(key => {
                    if (key) KEY_MAP[key] = laneIndex;
                });
            });
        }

        const videoRelPath = isStdMode ? (stdBeatmap && stdBeatmap.video ? stdBeatmap.video.filename : parsed.videoPath) : parsed.videoPath;

        if (videoRelPath && userSettings.noStoryboard !== true) {
            const cleanVideoPath = videoRelPath.trim();
            const fullVideoPath = selectedMap.dirPath + '/' + cleanVideoPath;
            const cachedVideo = sessionStorage.getItem('webmania_cached_video');
            
            if (gameBgEl) gameBgEl.style.display = 'none';
            if (videoCanvas) {
                videoCanvas.style.display = 'block';
                videoCanvas.style.filter = videoFilterStr;
            }

            if (window.videoPlayer) {
                if (typeof window.videoPlayer.destroy === 'function') window.videoPlayer.destroy();
                window.videoPlayer = null;
            }

            let videoUrl = null;
            let useNativePlayer = false;

            if (cachedVideo) {
                videoUrl = `${LOCAL_API_URL}/file?path=${encodeURIComponent(cachedVideo)}`;
                useNativePlayer = true;
            } else if (fullVideoPath.toLowerCase().endsWith('.mp4') || fullVideoPath.toLowerCase().endsWith('.webm')) {
                videoUrl = `${LOCAL_API_URL}/file?path=${encodeURIComponent(fullVideoPath)}`;
                useNativePlayer = true;
            }

            if (useNativePlayer && videoUrl) {
                const decoderVideo = document.getElementById('decoder-video');
                if (decoderVideo) {
                    decoderVideo.src = videoUrl;
                    decoderVideo.load();
                    decoderVideo.muted = true;

                    window.videoPlayer = {
                        play: () => decoderVideo.play().catch(()=>{}),
                        pause: () => decoderVideo.pause(),
                        destroy: () => {
                            decoderVideo.pause();
                            decoderVideo.removeAttribute('src');
                            decoderVideo.load();
                            if (window.videoRenderLoopId) {
                                cancelAnimationFrame(window.videoRenderLoopId);
                                window.videoRenderLoopId = null;
                            }
                        }
                    };

                    decoderVideo.onloadedmetadata = () => {
                        if (videoCanvas) {
                            videoCanvas.width = decoderVideo.videoWidth;
                            videoCanvas.height = decoderVideo.videoHeight;
                        }
                    };

                    decoderVideo.onplay = () => {
                        if (window.videoRenderLoopId) {
                            cancelAnimationFrame(window.videoRenderLoopId);
                            window.videoRenderLoopId = null;
                        }
                        const ctx = videoCanvas ? videoCanvas.getContext('2d') : null;
                        function renderVideoLoop() {
                            if (!decoderVideo.paused && !decoderVideo.ended && ctx && videoCanvas) {
                                ctx.drawImage(decoderVideo, 0, 0, videoCanvas.width, videoCanvas.height);
                                window.videoRenderLoopId = requestAnimationFrame(renderVideoLoop);
                            } else {
                                window.videoRenderLoopId = null;
                            }
                        }
                        renderVideoLoop();
                    };
                }
            } else {
                const streamUrl = `${LOCAL_API_URL}/video_stream?path=${encodeURIComponent(fullVideoPath)}&hwAccel=${userSettings.hwAccel ? 'true' : 'false'}`;
                class FetchStreamSource {
                    constructor(url, options) {
                        this.url = url;
                        this.destination = null;
                    }
                    connect(destination) { this.destination = destination; }
                    start() {
                        fetch(this.url).then(res => {
                            const reader = res.body.getReader();
                            const pump = () => {
                                reader.read().then(({value, done}) => {
                                    if (done) return;
                                    if (this.destination) this.destination.write(value);
                                    pump();
                                });
                            };
                            pump();
                        }).catch(()=>{});
                    }
                    resume() {}
                    destroy() {}
                }

                if (videoCanvas) {
                    window.videoPlayer = new JSMpeg.Player(streamUrl, {
                        canvas: videoCanvas,
                        source: FetchStreamSource, 
                        loop: true,
                        autoplay: false, 
                        audio: false 
                    });
                }
            }
        } else {
            if (videoCanvas) videoCanvas.style.display = 'none'; 
            if (gameBgEl) gameBgEl.style.display = 'block'; 
            if (window.videoPlayer) {
                if (typeof window.videoPlayer.destroy === 'function') window.videoPlayer.destroy();
                window.videoPlayer = null;
            }
        }

        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        if (userSettings.audioDevice && userSettings.audioDevice !== 'default') {
            if (audioCtx.setSinkId) await audioCtx.setSinkId(userSettings.audioDevice).catch(()=>{});
        }

        const audioRes = await fetch(`${LOCAL_API_URL}/file?path=${encodeURIComponent(selectedMap.audioPath)}`);
        if (initId !== currentInitId) return;
        const arrayBuffer = await audioRes.arrayBuffer();
        if (initId !== currentInitId) return;
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        if (initId !== currentInitId) return;

        const canvas = document.getElementById('game-canvas');
        if (gameEngine) gameEngine.quit();

        // Retrieve active mods for standard or mania mode
        let activeMods = [];
        if (isReplayMode && replayData && Array.isArray(replayData.mods)) {
            activeMods = [...replayData.mods];
        } else {
            try {
                const stored = sessionStorage.getItem('webmania_mods');
                if (stored) activeMods = JSON.parse(stored);
            } catch(e) {}
        }

        // Render active mod badges in the in-game HUD container
        const inGameModsHud = document.getElementById('in-game-mods');
        if (inGameModsHud && window.OsuModsManager) {
            inGameModsHud.innerHTML = window.OsuModsManager.renderBadgeList(activeMods, 'small');
        }

        if (isStdMode && stdBeatmap && window.OsuStdEngine && window.AudioEngine) {
            const stdAudio = new window.AudioEngine(audioCtx);
            const mVol = (userSettings.masterVol !== undefined ? userSettings.masterVol : 100) / 100;
            const bgVol = (userSettings.bgVol !== undefined ? userSettings.bgVol : 50) / 100;
            const muVol = (userSettings.musicVol !== undefined ? userSettings.musicVol : 100) / 100;
            const sfxVol = (userSettings.sfxVol !== undefined ? userSettings.sfxVol : 100) / 100;
            stdAudio.setMaster(document.hasFocus() ? mVol : bgVol);
            stdAudio.setMusic(muVol);
            stdAudio.setEffect(sfxVol);
            stdAudio.enableHitSounds = (userSettings.enableHitSounds !== false);

            try {
                const smpRes = await fetch(`${LOCAL_API_URL}/dir_samples?dirPath=${encodeURIComponent(selectedMap.dirPath)}&excludeAudio=${encodeURIComponent(selectedMap.audioPath || '')}`);
                if (smpRes.ok) {
                    const smpData = await smpRes.json();
                    if (smpData && Array.isArray(smpData.files) && smpData.files.length > 0) {
                        await stdAudio.loadMapSamples(selectedMap.dirPath, smpData.files, LOCAL_API_URL);
                    }
                }
            } catch (e) {}
            if (initId !== currentInitId) return;

            gameEngine = new window.OsuStdEngine({
                canvas,
                audio: stdAudio,
                beatmap: stdBeatmap,
                musicBuffer: audioBuffer,
                stars: selectedMap.stars || window.OsuBeatmap.estimateStars(stdBeatmap),
                leaderboard: currentLeaderboard,
                isReplay: isReplayMode,
                replayEvents: isReplayMode && replayData && Array.isArray(replayData.events) ? [...replayData.events] : [],
                mods: activeMods,
                onEnd: onGameEnd
            });
            gameEngine.start();
            return;
        }
        
        const uniqueSamples = new Set();
        parsed.notes.forEach(n => {
            if (n.samples) n.samples.forEach(s => uniqueSamples.add(s.filename));
        });
        
        const loadedHitSounds = {};
        const fetchPromises = Array.from(uniqueSamples).map(async filename => {
            try {
                const fullPath = selectedMap.dirPath + '/' + filename;
                const res = await fetch(`${LOCAL_API_URL}/file?path=${encodeURIComponent(fullPath)}`);
                if (res.ok) {
                    const arrayBuffer = await res.arrayBuffer();
                    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
                    loadedHitSounds[filename] = buffer;
                }
            } catch (e) {}
        });
        await Promise.all(fetchPromises);
        if (initId !== currentInitId) return;

        gameEngine = new GameEngine(
            canvas, parsed, audioBuffer, audioCtx, 
            selectedMap.stars || getFakeStars(selectedMap.version), 
            onGameEnd, currentLeaderboard, isSpectating, loadedHitSounds, activeMods
        );
        gameEngine.start();
    } catch (e) {
        if (initId === currentInitId) { 
            alert('谱面加载失败: ' + e.message);
            window.location.href = isMulti ? 'multiplayer.html' : 'index.html';
        }
    }
}

function parseOsuFile(osuText) {
    const lines = osuText.split(/\r?\n/);
    let section = '', mode = 0, bpm = 0, hp = 0, od = 5, cs = 4, previewTime = -1, noteCount = 0, holdCount = 0, videoPath = null, beatLengths = [];
    const timingPoints = [];
    const notes = [];
    const samples = []; 
    const breaks = []; 
    
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('[')) { section = line; continue; }
        if (!line) continue;
        
        if (section === '[General]') {
            if (line.startsWith('Mode:')) mode = parseInt(line.split(':')[1].trim());
            if (line.startsWith('PreviewTime:')) previewTime = parseInt(line.split(':')[1].trim());
        } 
        else if (section === '[Difficulty]') { 
            if (line.startsWith('HPDrainRate:')) hp = parseFloat(line.split(':')[1].trim()); 
            if (line.startsWith('OverallDifficulty:')) od = parseFloat(line.split(':')[1].trim()); 
            if (line.startsWith('CircleSize:')) cs = parseFloat(line.split(':')[1].trim());
        } 
        else if (section === '[Events]') {
            const parts = line.split(',');
            if (parts[0] === 'Video' || parts[0] === '1') {
                if (parts.length >= 3) {
                    videoPath = parts[2].replace(/"/g, '').trim();
                }
            } else if (parts[0] === '2' || parts[0] === 'Break') {
                if (parts.length >= 3) {
                    breaks.push({ startTime: parseInt(parts[1]), endTime: parseInt(parts[2]) });
                }
            } else if (parts[0] === 'Sample' || parts[0] === '5') {
                if (parts.length >= 4) {
                    const sTime = parseInt(parts[1]);
                    const sFilename = parts[3].replace(/"/g, '').trim();
                    const sVol = parts.length >= 5 ? parseInt(parts[4]) : 100;
                    samples.push({ time: sTime, filename: sFilename, volume: sVol });
                }
            }
        } 
        else if (section === '[TimingPoints]') {
            let parts = line.split(',');
            if (parts.length >= 2) {
                let t = parseFloat(parts[0]);
                let bl = parseFloat(parts[1]);
                if (bl > 0) {
                    beatLengths.push(bl);
                    timingPoints.push({ time: t, beatLength: bl });
                }
            }
        } 
        else if (section === '[HitObjects]') {
            const parts = line.split(',');
            if (parts.length >= 5) {
                const x = parseInt(parts[0]), time = parseInt(parts[2]), type = parseInt(parts[3]);
                const column = Math.floor(x * cs / 512);
                if (column >= 0 && column < cs) {
                    
                    let hitSampleStr = '';
                    let noteFilename = '';
                    if ((type & 128) !== 0) { 
                        if (parts.length >= 6) {
                            const extras = parts[5].split(':');
                            hitSampleStr = parts[5].substring(extras[0].length + 1);
                        }
                    } else { 
                        if (parts.length >= 6) hitSampleStr = parts[5];
                    }

                    if (hitSampleStr) {
                        const hsParts = hitSampleStr.split(':');
                        if (hsParts.length >= 5 && hsParts[4]) noteFilename = hsParts[4];
                    }

                    if ((type & 128) !== 0) {
                        const endTime = parseInt(parts[5].split(':')[0]);
                        notes.push({ type: 'hold', time, endTime, column, headJudged: false, tailJudged: false, isHolding: false, filename: noteFilename });
                        holdCount++;
                    } else {
                        notes.push({ type: 'tap', time, column, headJudged: false, filename: noteFilename }); noteCount++;
                    }
                }
            }
        }
    }
    
    samples.sort((a,b) => a.time - b.time);
    let sIdx = 0;
    for (let note of notes) {
        note.samples = [];
        if (note.filename) note.samples.push({ filename: note.filename, volume: 100 });
        while (sIdx < samples.length && samples[sIdx].time < note.time - 5) {
            sIdx++;
        }
        for (let j = sIdx; j < samples.length && samples[j].time <= note.time + 5; j++) {
            note.samples.push({ filename: samples[j].filename, volume: samples[j].volume });
        }
    }

    if (beatLengths.length > 0) {
        const counts = new Map();
        let maxCount = 0;
        let mainBL = beatLengths[0];
        for (let i = 0; i < beatLengths.length; i++) {
            const bl = beatLengths[i];
            const c = (counts.get(bl) || 0) + 1;
            counts.set(bl, c);
            if (c > maxCount) {
                maxCount = c;
                mainBL = bl;
            }
        }
        bpm = Math.round(60000 / mainBL);
    }
    return { 
        mode,
        notes: notes.sort((a,b) => a.time - b.time), 
        breaks: breaks.sort((a,b) => a.startTime - b.startTime),
        timingPoints: timingPoints.sort((a,b) => a.time - b.time),
        bpm, hp, od, cs, previewTime, noteCount, holdCount, videoPath 
    };
}

function animateValue(obj, start, end, duration, formatStr = false) {
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = progress * (2 - progress); 
        const current = start + (end - start) * easeProgress;
        
        if (formatStr) obj.innerText = formatStr(current);
        else obj.innerText = Math.floor(current);

        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

function onGameEnd(result) {
    window.isStdGameplayActive = false;
    const failScreen = document.getElementById('fail-screen');
    if (failScreen) failScreen.classList.remove('active');

    if (window.videoPlayer) {
        if (typeof window.videoPlayer.destroy === 'function') window.videoPlayer.destroy();
        window.videoPlayer = null;
    }

    const isStd = (result.mode === 0) || (selectedMap && selectedMap.mode === 0);

    const endMods = (result && result.mods) || (gameEngine && gameEngine.mods) || [];

    if (!isMulti && !isReplayMode && !result.failed && gameEngine && gameEngine.recordedEvents && gameEngine.recordedEvents.length > 0) {
        const folderPath = localStorage.getItem('wm_folderPath');
        const scorePayload = {
            folderPath: folderPath,
            mapId: selectedMap.id,
            scoreData: {
                player: localStorage.getItem('wm_username') || 'Unknown Player',
                mode: isStd ? 0 : 3,
                score: result.score,
                combo: result.combo,
                acc: result.acc,
                grade: result.grade,
                mods: endMods,
                replay: gameEngine.recordedEvents
            }
        };
        fetch(`${LOCAL_API_URL}/local_scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(scorePayload)
        }).catch(()=>{});
    }
    
    if (isMulti && socket) {
        socket.emit('multi_game_end', { score: result.score, combo: result.combo, acc: result.acc, failed: result.failed });
        const waitingOverlay = document.getElementById('waiting-overlay');
        if (waitingOverlay) waitingOverlay.style.display = 'flex';
    } else {
        showScreen('result-screen');
    }

    if (isReplayMode) {
        const resultTitle = document.querySelector('.result-title');
        if (resultTitle) resultTitle.innerText = "回放结束";
    }

    // Update judgement labels for std vs mania
    const lblMax = document.getElementById('lbl-res-max');
    const lbl300 = document.getElementById('lbl-res-300');
    const lbl200 = document.getElementById('lbl-res-200');
    const lbl100 = document.getElementById('lbl-res-100');
    const lbl50 = document.getElementById('lbl-res-50');
    const lblMiss = document.getElementById('lbl-res-miss');
    if (isStd) {
        if (lblMax) { lblMax.innerText = '激'; lblMax.style.color = '#8ef'; }
        if (lbl300) { lbl300.innerText = '300'; lbl300.style.color = '#8cf'; }
        if (lbl200) { lbl200.innerText = '喝'; lbl200.style.color = '#7f7'; }
        if (lbl100) { lbl100.innerText = '100'; lbl100.style.color = '#7f7'; }
        if (lbl50) { lbl50.innerText = '50'; lbl50.style.color = '#fc6'; }
        if (lblMiss) { lblMiss.innerText = 'MISS'; lblMiss.style.color = '#f44'; }
    } else {
        if (lblMax) { lblMax.innerText = 'MAX'; lblMax.style.color = '#ffffff'; }
        if (lbl300) { lbl300.innerText = '300'; lbl300.style.color = '#fbbf24'; }
        if (lbl200) { lbl200.innerText = '200'; lbl200.style.color = '#34d399'; }
        if (lbl100) { lbl100.innerText = '100'; lbl100.style.color = '#60a5fa'; }
        if (lbl50) { lbl50.innerText = '50'; lbl50.style.color = '#a78bfa'; }
        if (lblMiss) { lblMiss.innerText = 'MISS'; lblMiss.style.color = '#ef4444'; }
    }

    if (selectedMap && !specClientUid && role !== 'spectator') {
        const titleEl = document.getElementById('res-meta-title');
        const artistEl = document.getElementById('res-meta-artist');
        const starsEl = document.getElementById('res-meta-stars');
        const bgContainer = document.getElementById('res-bg-container');

        if (titleEl) titleEl.innerText = selectedMap.title;
        if (artistEl) artistEl.innerText = selectedMap.artist + " // " + selectedMap.version;
        const stars = selectedMap.stars || getFakeStars(selectedMap.version);
        if (starsEl) {
            starsEl.innerText = stars.toFixed(2) + ' ★';
            starsEl.style.color = getStarColor(stars);
        }
        if (selectedMap.bgPath && bgContainer) {
            bgContainer.style.backgroundImage = `url("${LOCAL_API_URL}/file?path=${encodeURIComponent(selectedMap.bgPath)}")`;
        }
    }

    const gradeEl = document.getElementById('result-grade');
    const failedEl = document.getElementById('result-failed');
    const statsContainer = document.getElementById('result-stats-container');

    // Populate mod badges on result screen
    const resBadgesEl = document.getElementById('res-mods-badges');
    if (resBadgesEl && window.OsuModsManager) {
        resBadgesEl.innerHTML = window.OsuModsManager.renderBadgeList(endMods, 'medium');
    }

    if (gradeEl) {
        gradeEl.classList.remove('show');
        gradeEl.className = `result-grade color-${result.grade.toLowerCase()}`;
        gradeEl.innerText = result.grade;
    }

    if (result.failed) {
        if (failedEl) failedEl.style.display = 'block';
        if (gradeEl) gradeEl.style.display = 'none';
        if (statsContainer) statsContainer.style.opacity = '0.5';
    } else {
        if (failedEl) failedEl.style.display = 'none';
        if (gradeEl) gradeEl.style.display = 'block';
        if (statsContainer) statsContainer.style.opacity = '1';

        if (result.grade !== 'F' && !isMulti && !isReplayMode) { 
            const histKey = selectedMap.id;
            const ranks = { 'SS':6, 'S':5, 'A':4, 'B':3, 'C':2, 'D':1, 'F':0 };
            const oldRank = history[histKey] ? ranks[history[histKey]] : -1;
            if (ranks[result.grade] > oldRank) { 
                history[histKey] = result.grade; 
                localStorage.setItem('webmania_history', JSON.stringify(history)); 
            }
        }
    }

    let totalNotes = result.stats.max + result.stats.p300 + result.stats.p200 + result.stats.p100 + result.stats.p50 + result.stats.miss;
    if (totalNotes === 0) totalNotes = 1;

    animateValue(document.getElementById('res-max'), 0, result.stats.max, 1500);
    const barMax = document.getElementById('bar-max');
    if (barMax) barMax.style.width = (result.stats.max / totalNotes * 100) + '%';

    animateValue(document.getElementById('res-300'), 0, result.stats.p300, 1500);
    const bar300 = document.getElementById('bar-300');
    if (bar300) bar300.style.width = (result.stats.p300 / totalNotes * 100) + '%';

    animateValue(document.getElementById('res-200'), 0, result.stats.p200, 1500);
    const bar200 = document.getElementById('bar-200');
    if (bar200) bar200.style.width = (result.stats.p200 / totalNotes * 100) + '%';

    animateValue(document.getElementById('res-100'), 0, result.stats.p100, 1500);
    const bar100 = document.getElementById('bar-100');
    if (bar100) bar100.style.width = (result.stats.p100 / totalNotes * 100) + '%';

    animateValue(document.getElementById('res-50'), 0, result.stats.p50, 1500);
    const bar50 = document.getElementById('bar-50');
    if (bar50) bar50.style.width = (result.stats.p50 / totalNotes * 100) + '%';

    animateValue(document.getElementById('res-miss'), 0, result.stats.miss, 1500);
    const barMiss = document.getElementById('bar-miss');
    if (barMiss) barMiss.style.width = (result.stats.miss / totalNotes * 100) + '%';

    animateValue(document.getElementById('res-score'), 0, result.score, 2000);
    animateValue(document.getElementById('res-combo'), 0, result.combo, 1500, val => Math.floor(val) + 'x');
    animateValue(document.getElementById('res-pp'), 0, result.pp, 2000);

    let simulatedRank = '-';
    if (!isMulti && !isReplayMode && currentLeaderboard.length > 0 && result.score > 0) {
        let rank = 1; for (let s of currentLeaderboard) { if (result.score < s._realScore) rank++; }
        simulatedRank = '#' + rank;
    }
    const resRank = document.getElementById('res-rank');
    if (resRank) resRank.innerText = simulatedRank;

    animateValue(document.getElementById('res-acc'), 0, result.acc, 2000, val => val.toFixed(2) + '%');
    setTimeout(() => { if (gradeEl) gradeEl.classList.add('show'); }, 500);
}

function resumeGame() {
    isResuming = true;
    const pauseTitle = document.getElementById('pause-title');
    if (pauseTitle) pauseTitle.style.display = 'none'; 
    const pauseBtns = document.getElementById('pause-buttons');
    if (pauseBtns) pauseBtns.style.display = 'none';
    const countdownEl = document.getElementById('pause-countdown-text'); 
    if (countdownEl) countdownEl.style.display = 'block';
    
    if (userSettings.autoKiosk && !specClientUid) {
        fetch(`${LOCAL_API_URL}/kiosk`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ kiosk: true }) 
        }).catch(()=>{});
        
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(()=>{});
        }
    }
    
    let count = 3; 
    if (countdownEl) countdownEl.innerText = count;
    
    resumeInterval = setInterval(() => {
        count--;
        if (count > 0) {
            if (countdownEl) countdownEl.innerText = count;
        } else {
            clearInterval(resumeInterval); 
            resumeInterval = null;
            isResuming = false;
            const pauseScreen = document.getElementById('pause-screen');
            if (pauseScreen) pauseScreen.classList.remove('active');
            if (gameEngine) {
                if (typeof gameEngine.resumeFromCountdown === 'function') {
                    gameEngine.resumeFromCountdown();
                } else {
                    gameEngine.isPaused = false;
                    if (gameEngine.audioCtx && gameEngine.audioCtx.state === 'suspended') gameEngine.audioCtx.resume();
                    if (window.videoPlayer && typeof window.videoPlayer.play === 'function') {
                        window.videoPlayer.play();
                    }
                    if (typeof gameEngine.loop === 'function') {
                        requestAnimationFrame(gameEngine.loop.bind(gameEngine));
                    }
                }
            }
        }
    }, 1000);
}

function retryGame() { 
    if(isResuming) clearInterval(resumeInterval);
    isResuming = false;
    const pauseScreen = document.getElementById('pause-screen');
    if (pauseScreen) pauseScreen.classList.remove('active'); 
    const failScreen = document.getElementById('fail-screen');
    if (failScreen) failScreen.classList.remove('active');
    
    if (window.videoPlayer) { 
        if (typeof window.videoPlayer.destroy === 'function') window.videoPlayer.destroy();
        window.videoPlayer = null; 
    }
    
    if (gameEngine) {
        gameEngine.quit();
        gameEngine = null; 
    }
    
    const gameCanvas = document.getElementById('game-canvas');
    if (gameCanvas) gameCanvas.style.filter = 'none';

    initGame(false); 
}

function quitGame() { 
    if(isResuming) clearInterval(resumeInterval);
    isResuming = false;
    window.isStdGameplayActive = false;
    const pauseScreen = document.getElementById('pause-screen');
    if (pauseScreen) pauseScreen.classList.remove('active'); 
    const failScreen = document.getElementById('fail-screen');
    if (failScreen) failScreen.classList.remove('active');
    
    if (window.videoPlayer) { 
        if (typeof window.videoPlayer.destroy === 'function') window.videoPlayer.destroy();
        window.videoPlayer = null; 
    }
    
    if (isMulti && socket && gameEngine && gameEngine.isRunning && gameEngine.state && !gameEngine.state.failed) {
        socket.emit('multi_game_end', { 
            score: gameEngine.state.scoreV2 || 0, 
            combo: gameEngine.state.combo || 0, 
            acc: gameEngine.state.acc || 0, 
            failed: true 
        });
    }

    if (gameEngine) {
        gameEngine.quit(); 
        gameEngine = null;
    }
    
    if (userSettings.autoKiosk) {
        fetch(`${LOCAL_API_URL}/kiosk`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ kiosk: false }) 
        }).catch(()=>{});
    }

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(()=>{});
    }

    setTimeout(() => {
        window.location.href = isMulti ? 'multiplayer.html' : 'index.html'; 
    }, 50);
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        e.preventDefault();
        const failScreen = document.getElementById('fail-screen');
        if (failScreen && failScreen.classList.contains('active')) {
            quitGame();
            return;
        }
        if (gameEngine && gameEngine.isRunning) {
            if (isMulti) {
                if (!escHoldTimer) {
                    escHoldTimer = setInterval(() => {
                        escProgress += 5; 
                        if (gameEngine && gameEngine.isPaused) gameEngine.draw(gameEngine.getTime());
                        if (escProgress >= 100) { 
                            clearInterval(escHoldTimer); 
                            escHoldTimer = null; 
                            escProgress = 0;
                            quitGame(); 
                        }
                    }, 50);
                }
            } else {
                if (!gameEngine.isPaused) {
                    gameEngine.pause();
                } else {
                    if (isResuming) {
                        clearInterval(resumeInterval);
                        isResuming = false;
                        const countdownEl = document.getElementById('pause-countdown-text');
                        if (countdownEl) countdownEl.style.display = 'none';
                        const pauseTitle = document.getElementById('pause-title');
                        if (pauseTitle) pauseTitle.style.display = 'block';
                        const pauseBtns = document.getElementById('pause-buttons');
                        if (pauseBtns) pauseBtns.style.display = 'flex';
                    } else {
                        resumeGame();
                    }
                }
            }
        }
    }

    if (e.code === 'Space' && gameEngine && gameEngine.isRunning && !gameEngine.isPaused && typeof gameEngine.skip === 'function') {
        if (gameEngine instanceof GameEngine && gameEngine.getTime() < gameEngine.firstNoteTime - 2500) {
            e.preventDefault();
            gameEngine.skip();
            return;
        }
    }

    if (e.code === 'Backquote' && gameEngine && gameEngine.isRunning && !isMulti && !isReplayMode) {
        if (!retryHoldTimer) {
            retryHoldTimer = setInterval(() => {
                retryProgress += 5;
                if (gameEngine && gameEngine.isPaused) gameEngine.draw(gameEngine.getTime());
                if (retryProgress >= 100) {
                    retryGame();
                    clearInterval(retryHoldTimer);
                    retryHoldTimer = null;
                    retryProgress = 0;
                }
            }, 20);
        }
    }

    if (KEY_MAP.hasOwnProperty(e.code) && gameEngine && gameEngine.isRunning && gameEngine.onKeyDown) { 
        if (!e.repeat && !isReplayMode && !gameEngine.isSpectator) gameEngine.onKeyDown(KEY_MAP[e.code]); 
    }
});

window.addEventListener('keyup', (e) => { 
    if (e.code === 'Escape' && isMulti) {
        if (escHoldTimer) {
            clearInterval(escHoldTimer);
            escHoldTimer = null;
            escProgress = 0;
            if (gameEngine && gameEngine.isPaused) gameEngine.draw(gameEngine.getTime());
        }
    }
    if (e.code === 'Backquote' && !isMulti && !isReplayMode) {
        if (retryHoldTimer) {
            clearInterval(retryHoldTimer);
            retryHoldTimer = null;
            retryProgress = 0;
            if (gameEngine && gameEngine.isPaused) gameEngine.draw(gameEngine.getTime());
        }
    }
    if (KEY_MAP.hasOwnProperty(e.code) && gameEngine && gameEngine.isRunning && !isReplayMode && !gameEngine.isSpectator && gameEngine.onKeyUp) {
        gameEngine.onKeyUp(KEY_MAP[e.code]);
    }
});

window.adjustGameVolumeByWheel = function(deltaY) {
    if (userSettings && userSettings.disableWheel) return;
    let mVol = userSettings.masterVol !== undefined ? userSettings.masterVol : 100;
    const step = deltaY < 0 ? 5 : -5;
    mVol = Math.max(0, Math.min(100, mVol + step));
    userSettings.masterVol = mVol;
    localStorage.setItem('webmania_settings', JSON.stringify(userSettings));
    
    if (gameEngine && gameEngine.masterGain && gameEngine.masterGain.gain) {
        const bgVol = (userSettings.bgVol !== undefined ? userSettings.bgVol : 50) / 100;
        const target = (document.hasFocus() ? mVol : bgVol) / 100;
        if (gameEngine.audioCtx && gameEngine.audioCtx.state === 'running') {
            gameEngine.masterGain.gain.setTargetAtTime(target, gameEngine.audioCtx.currentTime, 0.05);
        } else {
            gameEngine.masterGain.gain.value = target;
        }
    }
    showInGameVolumeToast(mVol);
};

function showInGameVolumeToast(vol) {
    let toast = document.getElementById('volume-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'volume-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '30px';
        toast.style.right = '30px';
        toast.style.background = 'rgba(20, 20, 25, 0.9)';
        toast.style.border = '1px solid #3b82f6';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '8px';
        toast.style.color = '#fff';
        toast.style.fontWeight = '700';
        toast.style.fontSize = '16px';
        toast.style.zIndex = '99999';
        toast.style.pointerEvents = 'none';
        toast.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.4)';
        toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        document.body.appendChild(toast);
    }
    toast.innerText = `主音量: ${Math.round(vol)}%`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    clearTimeout(toast._fadeTimer);
    toast._fadeTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
    }, 1200);
}

window.addEventListener('click', (e) => {
    if (userSettings && userSettings.disableClick && gameEngine && gameEngine.isRunning && !gameEngine.isPaused) {
        const pauseScreen = document.getElementById('pause-screen');
        const failScreen = document.getElementById('fail-screen');
        const resultScreen = document.getElementById('result-screen');
        const isPaused = pauseScreen && (pauseScreen.classList.contains('active') || pauseScreen.style.display === 'flex');
        const isFailed = failScreen && (failScreen.classList.contains('active') || failScreen.style.display === 'flex');
        const isResult = resultScreen && (resultScreen.classList.contains('active') || resultScreen.style.display === 'flex');
        if (!isPaused && !isFailed && !isResult) {
            e.stopPropagation();
            e.preventDefault();
        }
    }
}, true);
