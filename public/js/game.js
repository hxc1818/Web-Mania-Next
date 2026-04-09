// /data/public/js/game.js
const SCORES = { max: 320, p300: 300, p200: 200, p100: 100, p50: 50, miss: 0 };
const HP_MOD = { max: 2, p300: 1, p200: 0.5, p100: -1, p50: -2, miss: -4 };

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
            if (specClientUid && specClientUid === data.uid && gameEngine) {
                gameEngine.queueSpectatorEvent({ eventType: 'judge', ...data });
            }
        });

        socket.on('room_key_event', data => {
            if (specClientUid && specClientUid === data.uid && gameEngine) {
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
            if (gameEngine) gameEngine.state.failed = true;
            quitGame();
        });
    }

    if (specClientUid) {
        document.getElementById('game-screen').classList.add('active');
        document.body.style.background = 'transparent';
        document.getElementById('game-screen').style.background = 'transparent';
        
        document.getElementById('hud-combo').style.display = 'block';
        document.querySelector('.hud-details').style.display = 'none'; 
        document.getElementById('multi-lb').style.display = 'none';
        
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
                if(!gameEngine || !gameEngine.isRunning || gameEngine.isPaused || isReplayMode || gameEngine.isSpectator) return;
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const touch = e.changedTouches[i];
                    const x = touch.clientX - rect.left;
                    const offsetX = (canvas.width - gameEngine.trackWidth) / 2;
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
                if(!gameEngine || !gameEngine.isRunning || gameEngine.isPaused || isReplayMode || gameEngine.isSpectator) return;
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
    if(data.failed && gameEngine && !gameEngine.state.failed) {
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

function getGrade(acc, failed) {
    if (failed) return 'F';
    if (acc === 100) return 'SS';
    if (acc >= 95) return 'S';
    if (acc >= 90) return 'A';
    if (acc >= 80) return 'B';
    if (acc >= 70) return 'C';
    if (acc > 0) return 'D';
    return 'F';
}

class GameEngine {
    constructor(canvas, beatmapData, audioBuffer, audioCtx, stars, onEnd, leaderboard, isSpectator = false, loadedHitSounds = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { desynchronized: userSettings.desync || false });
        this.notes = beatmapData.notes;
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

        this.od = beatmapData.od !== undefined ? beatmapData.od : 5;
        this.judge = {
            max: 16,
            p300: Math.max(16, 64 - 3 * this.od),
            p200: Math.max(16, 97 - 3 * this.od),
            p100: Math.max(16, 127 - 3 * this.od),
            p50:  Math.max(16, 151 - 3 * this.od)
        };

        this.scrollSpeed = userSettings.scrollSpeed || 1000;
        
        this.laneCount = beatmapData.cs || 4;
        
        let baseLaneWidth = 100;
        if(this.laneCount > 4) baseLaneWidth = 80;
        if(this.laneCount > 7) baseLaneWidth = 60;
        if(this.laneCount > 10) baseLaneWidth = 45;
        if(this.laneCount > 15) baseLaneWidth = 35;
        
        this.trackWidth = (this.laneCount * baseLaneWidth) * (userSettings.trackScale || 1.0);
        this.laneWidth = this.trackWidth / this.laneCount;
        this.hitLineY = this.canvas.height - 120;
        
        this.laneColors = userSettings.laneColors[this.laneCount] || [];

        this.keys = new Array(this.laneCount).fill(false);
        this.isRunning = false;
        this.isPaused = false;
        this.audioSource = null;
        this.startTime = 0;
        this.fallbackStartTime = 0;

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
        this.lastNoteTime = maxTime;
        this.totalLengthMs = maxTime;

        this.hudScore = document.getElementById('hud-score');
        this.hudAcc = document.getElementById('hud-acc');
        this.hudPP = document.getElementById('hud-pp');
        this.hudUR = document.getElementById('hud-ur');
        this.hudRank = document.getElementById('hud-rank');
        this.progressBar = document.getElementById('song-progress-bar');

        this.lastMultiSend = 0;

        if (this.hudScore) this.hudScore.innerText = '0000000';
        if (this.hudAcc) this.hudAcc.innerText = '100.00%';
        if (this.hudPP) this.hudPP.innerText = '0';
        if (this.hudUR) this.hudUR.innerText = '0.00';
        if (this.hudRank) this.hudRank.innerText = '';
        const hudCombo = document.getElementById('hud-combo');
        if (hudCombo) {
            hudCombo.style.display = 'none';
            hudCombo.innerText = '0x';
        }
        if (this.canvas) this.canvas.style.filter = 'none';
        if (this.progressBar) this.progressBar.style.width = '0%';

        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.fpsUpdateTime = 0;

        if (userSettings.uiScale) {
            const gameHud = document.querySelector('.game-hud');
            if (gameHud) {
                gameHud.style.transform = `scale(${userSettings.uiScale})`;
                gameHud.style.transformOrigin = 'top left';
            }
            if (this.hudRank) {
                this.hudRank.style.transform = `scale(${userSettings.uiScale})`;
                this.hudRank.style.transformOrigin = 'top right';
            }
        }

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

    queueSpectatorEvent(evt) {
        this.spectatorEvents.push(evt);
        this.spectatorEvents.sort((a, b) => a.time - b.time);
    }

    start() {
        this.audioSource = this.audioCtx.createBufferSource();
        this.audioSource.buffer = this.audioBuffer;
        if (this.musicGain) this.audioSource.connect(this.musicGain);
        else this.audioSource.connect(this.audioCtx.destination);
        
        const delaySeconds = this.spectatorDelay / 1000;
        this.fallbackStartTime = performance.now() + this.spectatorDelay;
        
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(e => console.warn("Audio autoplay prevented", e));
        }

        this.startTime = this.audioCtx.currentTime + delaySeconds; 
        this.audioSource.start(this.startTime, 0);
        this.isRunning = true;
        this.isPaused = false;

        if (window.videoPlayer) {
            if (this.spectatorDelay > 0) {
                setTimeout(() => { if (this.isRunning && !this.isPaused) window.videoPlayer.play(); }, this.spectatorDelay);
            } else {
                window.videoPlayer.play();
            }
        }

        requestAnimationFrame(this.loop.bind(this));
    }

    pause() {
        if (isMulti) return; 
        if (!this.isRunning || this.isPaused) return;
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
            failed: this.state.failed,
            acc: this.state.acc,
            score: this.state.scoreV2,
            pp: this.state.currentPP,
            combo: this.state.maxCombo,
            stats: this.state.stats,
            grade: getGrade(this.state.acc, this.state.failed)
        });
    }

    getTime() { 
        let t = 0;
        if (this.audioCtx.state === 'running') {
            t = (this.audioCtx.currentTime - this.startTime) * 1000;
        } else {
            t = performance.now() - this.fallbackStartTime;
        }
        return t - (userSettings.offset || 0); 
    }

    playHitSound(buffer, volumeScale = 1.0) {
        if (!this.audioCtx || !buffer) return;
        try {
            const source = this.audioCtx.createBufferSource();
            source.buffer = buffer;
            const gainNode = this.audioCtx.createGain();
            if (gainNode && gainNode.gain) gainNode.gain.value = volumeScale;
            source.connect(gainNode);
            if (this.sfxGain) gainNode.connect(this.sfxGain);
            else gainNode.connect(this.audioCtx.destination);
            source.start(0);
        } catch(e) {}
    }

    playDefaultHitSound() {
        if (!this.audioCtx) return;
        try {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, this.audioCtx.currentTime + 0.05);
            if (gain && gain.gain) {
                gain.gain.setValueAtTime(0.4, this.audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.05);
            }
            osc.connect(gain);
            if (this.sfxGain) gain.connect(this.sfxGain);
            else gain.connect(this.audioCtx.destination);
            osc.start(this.audioCtx.currentTime);
            osc.stop(this.audioCtx.currentTime + 0.05);
        } catch(e) {}
    }

    addJudge(type, diff = 0, lane = -1, isTail = false) {
        if(this.state.failed && type === 'miss') return; 
        
        this.state.stats[type]++;
        if (type !== 'miss') {
            this.state.hitErrors.push({ diff: diff, time: this.getTime() });
            if (this.state.hitErrors.length > 50) this.state.hitErrors.shift();
            this.state.allHitErrors.push(diff);
        }

        if (type === 'miss') this.state.combo = 0;
        else { this.state.combo++; if (this.state.combo > this.state.maxCombo) this.state.maxCombo = this.state.combo; }
        
        this.state.hp = Math.min(100, Math.max(0, this.state.hp + HP_MOD[type]));
        
        if (this.state.hp <= 0 && !this.state.failed) {
            this.state.failed = true;
            if (this.canvas) this.canvas.style.filter = 'grayscale(1)';
            if (!isMulti && !this.isReplay && !this.isSpectator) {
                this.endGame(); return; 
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
            this.state.scoreV2 = accScore + comboBonus;
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

        this.updateHUD();
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
            this.state.hitErrors.push({ diff: data.diff, time: this.getTime() });
            if (this.state.hitErrors.length > 50) this.state.hitErrors.shift();
        }

        this.addEffect(data.judgeType);
        this.updateHUD();

        if (data.lane >= 0) {
            let target = null, minDiff = Infinity;
            for (let i = 0; i < this.notes.length; i++) {
                const note = this.notes[i];
                if (note.column !== data.lane) continue;
                
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
                    if (target.type === 'hold' && data.judgeType !== 'miss') target.isHolding = true;
                } else {
                    target.tailJudged = true;
                    target.isHolding = false;
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
        if (this.hudScore) this.hudScore.innerText = this.state.scoreV2.toString().padStart(7, '0');
        if (this.hudAcc) this.hudAcc.innerText = this.state.acc.toFixed(2) + '%';
        if (this.hudPP) this.hudPP.innerText = this.state.currentPP;
        if (this.hudUR) this.hudUR.innerText = this.calculateUR().toFixed(2);
        
        const hudCombo = document.getElementById('hud-combo');
        if (hudCombo) hudCombo.innerText = this.state.combo + 'x';
        
        if (!isMulti && !this.isReplay && this.leaderboard.length > 0 && this.state.scoreV2 > 0) {
            let rank = 1; for (let s of this.leaderboard) { if (this.state.scoreV2 < s._realScore) rank++; }
            if (this.hudRank) this.hudRank.innerText = '#' + rank;
        } else {
            if (this.hudRank) this.hudRank.innerText = '';
        }
    }

    addEffect(type) {
        const colors = { max: '#ffffff', p300: '#fbbf24', p200: '#34d399', p100: '#60a5fa', p50: '#a78bfa', miss: '#ef4444' };
        const texts = { max: 'MAX', p300: '300', p200: '200', p100: '100', p50: '50', miss: 'MISS' };
        this.state.effect = { text: texts[type], color: colors[type], life: 1, scale: 0.5, type: type };
    }

    onKeyDown(lane, forcedTime = null) {
        if (!this.isRunning || this.isPaused || lane >= this.laneCount) return;
        
        this.keys[lane] = true;
        const now = forcedTime !== null ? forcedTime : this.getTime();

        if (!this.isSpectator && !this.isReplay && isMulti && socket) {
            socket.emit('key_event', { type: 'down', lane, time: now });
        }

        if (!this.isSpectator && !this.isReplay && forcedTime === null) {
            this.recordedEvents.push({ type: 'down', lane, time: now });
        }

        let target = null, minDiff = Infinity;
        for (let i = 0; i < this.notes.length; i++) {
            const note = this.notes[i];
            if (note.column !== lane || note.headJudged) continue;
            const diff = note.time - now;
            if (diff > this.judge.p50) break; 
            if (Math.abs(diff) <= this.judge.p50 && Math.abs(diff) < minDiff) { minDiff = Math.abs(diff); target = note; }
        }

        if (target && !this.isSpectator) { 
            const diff = now - target.time;
            const absDiff = Math.abs(diff);
            let j = 'miss';
            if (absDiff <= this.judge.max) j = 'max'; else if (absDiff <= this.judge.p300) j = 'p300'; else if (absDiff <= this.judge.p200) j = 'p200'; else if (absDiff <= this.judge.p100) j = 'p100'; else if (absDiff <= this.judge.p50) j = 'p50';
            target.headJudged = true;
            if (target.type === 'hold' && j !== 'miss') target.isHolding = true;
            this.addJudge(j, diff, lane, false); 
        }
    }

    onKeyUp(lane, forcedTime = null) {
        if (!this.isRunning || this.isPaused || lane >= this.laneCount || this.isSpectator) return;

        this.keys[lane] = false;
        const now = forcedTime !== null ? forcedTime : this.getTime();

        if (!this.isReplay && isMulti && socket) {
            socket.emit('key_event', { type: 'up', lane, time: now });
        }

        if (!this.isReplay && forcedTime === null) {
            this.recordedEvents.push({ type: 'up', lane, time: now });
        }

        for (let i = 0; i < this.notes.length; i++) {
            const note = this.notes[i];
            if (note.column === lane && note.type === 'hold' && note.isHolding && !note.tailJudged) {
                note.isHolding = false; note.tailJudged = true;
                const diff = now - note.endTime;
                if (diff < -this.judge.p50) this.addJudge('miss', diff, lane, true);
                else {
                    const absDiff = Math.abs(diff); let j = 'miss';
                    if (absDiff <= this.judge.max) j = 'max'; else if (absDiff <= this.judge.p300) j = 'p300'; else if (absDiff <= this.judge.p200) j = 'p200'; else if (absDiff <= this.judge.p100) j = 'p100'; else if (absDiff <= this.judge.p50) j = 'p50';
                    this.addJudge(j, diff, lane, true); 
                }
                break;
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
                requestAnimationFrame(this.loop.bind(this));
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
        
        if (this.totalLengthMs > 0 && this.progressBar) {
            let prog = (now / this.totalLengthMs) * 100;
            if (prog > 100) prog = 100;
            if (prog < 0) prog = 0;
            this.progressBar.style.width = prog + '%';
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
                        note.samples.forEach(s => {
                            const buffer = this.hitSounds[s.filename];
                            if (buffer) this.playHitSound(buffer, s.volume / 100);
                        });
                    } else {
                        this.playDefaultHitSound();
                    }
                }
                this.nextSoundNoteIndex++;
            }
        }

        const missThreshold = this.isReplay ? this.judge.p50 + 400 : this.judge.p50;

        if (!this.isSpectator) {
            for (let i = 0; i < this.notes.length; i++) {
                const note = this.notes[i];
                if (!note.headJudged && now > note.time + missThreshold) { 
                    note.headJudged = true; this.addJudge('miss', missThreshold, note.column, false); 
                }
                if (note.type === 'hold' && note.headJudged && note.isHolding && now > note.endTime + missThreshold && !note.tailJudged) {
                    note.tailJudged = true; note.isHolding = false; this.addJudge('miss', missThreshold, note.column, true);
                }
            }
        }

        this.draw(now);
        requestAnimationFrame(this.loop.bind(this));
    }

    draw(now) {
        const ctx = this.ctx, canvas = this.canvas;
        const offsetX = (canvas.width - this.trackWidth) / 2;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(10,10,15,0.85)';
        ctx.fillRect(offsetX, 0, this.trackWidth, canvas.height);

        ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
        for (let i = 1; i < this.laneCount; i++) {
            ctx.beginPath(); ctx.moveTo(offsetX + i * this.laneWidth, 0); ctx.lineTo(offsetX + i * this.laneWidth, canvas.height); ctx.stroke();
        }

        ctx.fillStyle = '#60a5fa'; ctx.fillRect(offsetX, this.hitLineY, this.trackWidth, 4);

        for (let i = 0; i < this.laneCount; i++) {
            if (this.keys[i]) { 
                ctx.fillStyle = this.laneColors[i]; 
                ctx.globalAlpha = 0.2;
                ctx.fillRect(offsetX + i * this.laneWidth, this.hitLineY, this.laneWidth, canvas.height - this.hitLineY); 
                ctx.globalAlpha = 1.0;
            }
        }

        for (let i = this.notes.length - 1; i >= 0; i--) {
            const note = this.notes[i]; const color = this.laneColors[note.column]; const x = offsetX + note.column * this.laneWidth;
            if (note.type === 'hold') {
                if (note.tailJudged) continue;
                let startY = this.hitLineY - ((note.time - now) / 1000) * this.scrollSpeed;
                let endY = this.hitLineY - ((note.endTime - now) / 1000) * this.scrollSpeed;
                if (note.isHolding) startY = this.hitLineY;
                if (startY > 0 && endY < canvas.height) {
                    ctx.globalAlpha = 0.5; ctx.fillStyle = color; ctx.fillRect(x + 2, endY, this.laneWidth - 4, startY - endY); ctx.globalAlpha = 1.0;
                    if (!note.headJudged) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 2, startY - 15, this.laneWidth - 4, 15); }
                    ctx.fillStyle = color; ctx.fillRect(x + 2, endY, this.laneWidth - 4, 15);
                }
            } else {
                if (note.headJudged) continue;
                const y = this.hitLineY - ((note.time - now) / 1000) * this.scrollSpeed;
                if (y > -20 && y < canvas.height + 20) {
                    ctx.fillStyle = color; ctx.fillRect(x + 2, y - 15, this.laneWidth - 4, 15);
                    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 8, y - 10, this.laneWidth - 16, 5);
                }
            }
        }

        ctx.textAlign = 'center';
        
        if (this.state.combo > 5) {
            ctx.font = '800 50px Segoe UI'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(this.state.combo, canvas.width / 2, canvas.height / 2 - 40);
            ctx.font = '600 20px Segoe UI'; ctx.fillText('COMBO', canvas.width / 2, canvas.height / 2 - 10);
        }

        if (this.state.effect) {
            const ef = this.state.effect;
            ctx.font = `800 ${30 * ef.scale}px Segoe UI`; ctx.fillStyle = ef.color; ctx.globalAlpha = ef.life;
            if(ef.type === 'max') { ctx.shadowBlur = 10; ctx.shadowColor = `hsl(${now % 360}, 100%, 50%)`; ctx.fillStyle = '#ffffff'; } else ctx.shadowBlur = 0;
            ctx.fillText(ef.text, canvas.width / 2, this.hitLineY - 100 - (1 - ef.life) * 30);
            ctx.globalAlpha = 1.0; ctx.shadowBlur = 0; ef.scale += 0.05; ef.life -= 0.04; if (ef.life <= 0) this.state.effect = null;
        }

        if (userSettings.hitErrorMeter !== false) {
            const meterY = this.hitLineY + 60; const xC = canvas.width / 2; const scale = 1.5; 
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(xC - (150 * scale), meterY - 5, 300 * scale, 10);
            ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(xC - 1, meterY - 8, 2, 16); 
            ctx.fillStyle = '#fbbf24'; ctx.fillRect(xC - (this.judge.p300 * scale), meterY - 5, 1, 10); ctx.fillRect(xC + (this.judge.p300 * scale), meterY - 5, 1, 10);
            ctx.fillStyle = '#60a5fa'; ctx.fillRect(xC - (this.judge.p100 * scale), meterY - 5, 1, 10); ctx.fillRect(xC + (this.judge.p100 * scale), meterY - 5, 1, 10);
            for (let i = 0; i < this.state.hitErrors.length; i++) {
                const err = this.state.hitErrors[i]; const age = now - err.time;
                if (age > 3000) continue; 
                let alpha = 1 - (age / 3000); let absErr = Math.abs(err.diff); let color = '#60a5fa';
                if (absErr <= this.judge.max) color = '#ffffff'; else if (absErr <= this.judge.p300) color = '#fbbf24'; else if (absErr <= this.judge.p200) color = '#34d399'; else if (absErr <= this.judge.p100) color = '#60a5fa'; else color = '#a78bfa';
                ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillRect(xC + (err.diff * scale) - 2, meterY - 8, 4, 16);
            }
            ctx.globalAlpha = 1.0;
        }

        ctx.fillStyle = '#111'; ctx.fillRect(offsetX, 0, this.trackWidth, 10);
        ctx.fillStyle = this.state.hp > 20 ? '#10b981' : '#ef4444'; ctx.fillRect(offsetX, 0, (this.state.hp / 100) * this.trackWidth, 10);

        const currentBreak = this.breaks.find(b => now >= b.startTime && now <= b.endTime);
        
        if (currentBreak) {
            if (!this.inBreak) {
                this.inBreak = true;
                const bgEl = document.getElementById('game-bg');
                const vidEl = document.getElementById('bg-video-canvas');
                if (bgEl) bgEl.style.filter = `brightness(0.05) blur(${userSettings.bgBlur || 8}px)`;
                if (vidEl && vidEl.style.display !== 'none') vidEl.style.filter = `brightness(0.05) blur(${userSettings.bgBlur || 8}px)`;
            }
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const progress = Math.min(1, Math.max(0, (now - currentBreak.startTime) / (currentBreak.endTime - currentBreak.startTime)));
            const barMaxWidth = Math.min(600, canvas.width * 0.75);
            const barWidth = barMaxWidth * (1 - progress);
            const barX = (canvas.width - barWidth) / 2;
            const barY = canvas.height / 2;
            
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
            ctx.fillText(timeLeft, canvas.width / 2, barY - 30);
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
            ctx.fillText(`ACC: ${this.state.acc.toFixed(2)}%`, canvas.width / 2, barY + 50);
            
            ctx.font = 'italic 800 36px Segoe UI';
            ctx.fillStyle = gradeColor;
            ctx.fillText(grade, canvas.width / 2, barY + 95);
            
        } else {
            if (this.inBreak) {
                this.inBreak = false;
                let filterStr = `brightness(${(100 - (userSettings.bgDim !== undefined ? userSettings.bgDim : 80)) / 100})`;
                if (userSettings.bgBlur > 0) filterStr += ` blur(${userSettings.bgBlur}px)`;
                const bgEl = document.getElementById('game-bg');
                const vidEl = document.getElementById('bg-video-canvas');
                if (bgEl) bgEl.style.filter = filterStr;
                if (vidEl) vidEl.style.filter = filterStr;
            }
        }

        if (typeof retryProgress !== 'undefined' && retryProgress > 0) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(offsetX, canvas.height / 2 - 50, this.trackWidth, 100);

            const barMaxWidth = this.trackWidth * 0.8;
            const barWidth = barMaxWidth * (retryProgress / 100);
            const barX = offsetX + (this.trackWidth - barMaxWidth) / 2;
            const barY = canvas.height / 2 + 10;
            
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
            ctx.fillRect(offsetX, canvas.height / 2 - 50, this.trackWidth, 100);

            const barMaxWidth = this.trackWidth * 0.8;
            const barWidth = barMaxWidth * (escProgress / 100);
            const barX = offsetX + (this.trackWidth - barMaxWidth) / 2;
            const barY = canvas.height / 2 + 10;
            
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
    }
}

async function initGame(isSpectating) {
    const initId = ++currentInitId; 

    try {
        const gameBgEl = document.getElementById('game-bg');
        const videoCanvas = document.getElementById('bg-video-canvas');

        let filterStr = `brightness(${(100 - (userSettings.bgDim !== undefined ? userSettings.bgDim : 80)) / 100})`;
        if (userSettings.bgBlur > 0) filterStr += ` blur(${userSettings.bgBlur}px)`;

        if (selectedMap.bgPath && gameBgEl) {
            const bgUrl = `${LOCAL_API_URL}/file?path=${encodeURIComponent(selectedMap.bgPath)}`;
            gameBgEl.style.backgroundImage = `url("${bgUrl}")`;
            gameBgEl.style.filter = filterStr;
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

        KEY_MAP = {};
        const currentCS = parsed.cs || selectedMap.cs || 4;
        let currentBinds = userSettings.keyBinds[currentCS];
        if (!currentBinds) currentBinds = [];
        currentBinds.forEach((binds, laneIndex) => {
            binds.forEach(key => {
                if (key) KEY_MAP[key] = laneIndex;
            });
        });

        if (parsed.videoPath && userSettings.noStoryboard !== true) {
            const cleanVideoPath = parsed.videoPath.trim();
            const fullVideoPath = selectedMap.dirPath + '/' + cleanVideoPath;
            const cachedVideo = sessionStorage.getItem('webmania_cached_video');
            
            if (gameBgEl) gameBgEl.style.display = 'none';
            if (videoCanvas) {
                videoCanvas.style.display = 'block';
                videoCanvas.style.filter = filterStr;
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
                        if (window.videoRenderLoopId) cancelAnimationFrame(window.videoRenderLoopId);
                        const ctx = videoCanvas ? videoCanvas.getContext('2d') : null;
                        function renderVideoLoop() {
                            if (!decoderVideo.paused && !decoderVideo.ended && ctx && videoCanvas) {
                                ctx.drawImage(decoderVideo, 0, 0, videoCanvas.width, videoCanvas.height);
                            }
                            window.videoRenderLoopId = requestAnimationFrame(renderVideoLoop);
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

        const canvas = document.getElementById('game-canvas');

        if (gameEngine) gameEngine.quit();

        gameEngine = new GameEngine(
            canvas, parsed, audioBuffer, audioCtx, 
            selectedMap.stars || getFakeStars(selectedMap.version), 
            onGameEnd, currentLeaderboard, isSpectating, loadedHitSounds 
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
    let section = '', bpm = 0, hp = 0, od = 5, cs = 4, previewTime = -1, noteCount = 0, holdCount = 0, videoPath = null, beatLengths = [];
    const notes = [];
    const samples = []; 
    const breaks = []; 
    
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('[')) { section = line; continue; }
        if (!line) continue;
        
        if (section === '[General]') { if (line.startsWith('PreviewTime:')) previewTime = parseInt(line.split(':')[1].trim()); } 
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
            } else if (parts[0] === 'Sample') {
                if (parts.length >= 4) {
                    const sTime = parseInt(parts[1]);
                    const sFilename = parts[3].replace(/"/g, '').trim();
                    const sVol = parts.length >= 5 ? parseInt(parts[4]) : 100;
                    samples.push({ time: sTime, filename: sFilename, volume: sVol });
                }
            }
        } 
        else if (section === '[TimingPoints]') { let parts = line.split(','); if (parts.length >= 2) { let bl = parseFloat(parts[1]); if (bl > 0) beatLengths.push(bl); } } 
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
    
    for (let note of notes) {
        note.samples = [];
        if (note.filename) note.samples.push({ filename: note.filename, volume: 100 });
        for (let s of samples) {
            if (Math.abs(s.time - note.time) <= 5) {
                note.samples.push({ filename: s.filename, volume: s.volume });
            }
        }
    }

    if (beatLengths.length > 0) bpm = Math.round(60000 / beatLengths.sort((a,b) => beatLengths.filter(v => v===a).length - beatLengths.filter(v => v===b).length).pop());
    return { 
        notes: notes.sort((a,b) => a.time - b.time), 
        breaks: breaks.sort((a,b) => a.startTime - b.startTime),
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
    if (window.videoPlayer) {
        if (typeof window.videoPlayer.destroy === 'function') window.videoPlayer.destroy();
        window.videoPlayer = null;
    }

    if (!isMulti && !isReplayMode && gameEngine && gameEngine.recordedEvents.length > 0) {
        const folderPath = localStorage.getItem('wm_folderPath');
        const scorePayload = {
            folderPath: folderPath,
            mapId: selectedMap.id,
            scoreData: {
                player: localStorage.getItem('wm_username') || 'Unknown Player',
                score: result.score,
                combo: result.combo,
                acc: result.acc,
                grade: result.grade,
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
            isResuming = false;
            const pauseScreen = document.getElementById('pause-screen');
            if (pauseScreen) pauseScreen.classList.remove('active');
            if (gameEngine) {
                gameEngine.isPaused = false;
                if (gameEngine.audioCtx.state === 'suspended') gameEngine.audioCtx.resume();
                if (window.videoPlayer) {
                    if (typeof window.videoPlayer.play === 'function') window.videoPlayer.play();
                }
                requestAnimationFrame(gameEngine.loop.bind(gameEngine));
            }
        }
    }, 1000);
}

function retryGame() { 
    if(isResuming) clearInterval(resumeInterval);
    isResuming = false;
    const pauseScreen = document.getElementById('pause-screen');
    if (pauseScreen) pauseScreen.classList.remove('active'); 
    
    if (window.videoPlayer) { 
        if (typeof window.videoPlayer.destroy === 'function') window.videoPlayer.destroy();
        window.videoPlayer = null; 
    }
    
    if (gameEngine) {
        gameEngine.quit();
        gameEngine = null; 
    }
    
    const hudScore = document.getElementById('hud-score');
    if (hudScore) hudScore.innerText = '0000000';
    const hudAcc = document.getElementById('hud-acc');
    if (hudAcc) hudAcc.innerText = '100.00%';
    const hudPP = document.getElementById('hud-pp');
    if (hudPP) hudPP.innerText = '0';
    const hudUR = document.getElementById('hud-ur');
    if (hudUR) hudUR.innerText = '0.00';
    const hudRank = document.getElementById('hud-rank');
    if (hudRank) hudRank.innerText = '';
    const hudCombo = document.getElementById('hud-combo');
    if (hudCombo) {
        hudCombo.style.display = 'none';
        hudCombo.innerText = '0x';
    }
    const gameCanvas = document.getElementById('game-canvas');
    if (gameCanvas) gameCanvas.style.filter = 'none';
    const progressBar = document.getElementById('song-progress-bar');
    if (progressBar) progressBar.style.width = '0%';

    initGame(false); 
}

function quitGame() { 
    if(isResuming) clearInterval(resumeInterval);
    isResuming = false;
    const pauseScreen = document.getElementById('pause-screen');
    if (pauseScreen) pauseScreen.classList.remove('active'); 
    
    if (window.videoPlayer) { 
        if (typeof window.videoPlayer.destroy === 'function') window.videoPlayer.destroy();
        window.videoPlayer = null; 
    }
    
    if (isMulti && socket && gameEngine && gameEngine.isRunning && !gameEngine.state.failed) {
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
        if (gameEngine && gameEngine.isRunning) {
            if (isMulti) {
                if (!escHoldTimer) {
                    escHoldTimer = setInterval(() => {
                        escProgress += 5; 
                        if (gameEngine && gameEngine.isPaused) gameEngine.draw(gameEngine.getTime());
                        if (escProgress >= 100) { quitGame(); clearInterval(escHoldTimer); }
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

    if (KEY_MAP.hasOwnProperty(e.code) && gameEngine && gameEngine.isRunning) { 
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
    if (KEY_MAP.hasOwnProperty(e.code) && gameEngine && gameEngine.isRunning && !isReplayMode && !gameEngine.isSpectator) {
        gameEngine.onKeyUp(KEY_MAP[e.code]); 
    }
});