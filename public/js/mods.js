/**
 * Web-Mania-Next osu! Official Game Modifiers (Mods) System
 * Faithful reproduction of osu! original gameplay modifiers for osu!standard and osu!mania
 * Based on official osu! wiki specifications: https://osu.ppy.sh/wiki/zh/Gameplay/Game_modifier/Summary
 */

(function (root) {
  'use strict';

  const MODS_METADATA = {
    // ---------------- Difficulty Reduction (难度降低) ----------------
    EZ: {
      id: 'EZ',
      name: 'Easy',
      nameZh: '简单',
      abbr: 'EZ',
      category: 'reduction',
      modes: [0, 3], // 0: std, 3: mania
      stdMultiplier: 0.50,
      maniaMultiplier: 0.50,
      key: 'Q',
      cycleGroup: null,
      desc: 'Reduces overall difficulty - larger circles, more forgiving HP drain, less accuracy required, and 2 extra lives.',
      descZh: '降低谱面难度——圆圈变大、掉血更慢、判定更宽松，并提供 2 次扣血复活机会。',
      colors: ['#84cc16', '#4d7c0f'], // Green
      conflictsWith: ['HR']
    },
    NF: {
      id: 'NF',
      name: 'No Fail',
      nameZh: '绝不失败',
      abbr: 'NF',
      category: 'reduction',
      modes: [0, 3],
      stdMultiplier: 0.50,
      maniaMultiplier: 0.50,
      key: 'W',
      cycleGroup: null,
      desc: "You can't fail. No matter what.",
      descZh: '无论发生什么都不会失败通关。',
      colors: ['#0284c7', '#0369a1'], // Blue
      conflictsWith: ['SD', 'PF', 'RL', 'AP']
    },
    HT: {
      id: 'HT',
      name: 'Half Time',
      nameZh: '半速',
      abbr: 'HT',
      category: 'reduction',
      modes: [0, 3],
      stdMultiplier: 0.30,
      maniaMultiplier: 0.50,
      key: 'E',
      cycleGroup: null,
      desc: 'Less zoom. Speed reduced to 75%.',
      descZh: '减慢歌曲播放速度（75%）。',
      colors: ['#a855f7', '#7e22ce'], // Purple
      conflictsWith: ['DT', 'NC']
    },

    // ---------------- Difficulty Increase (难度增加) ----------------
    HR: {
      id: 'HR',
      name: 'Hard Rock',
      nameZh: '极限',
      abbr: 'HR',
      category: 'increase',
      modes: [0, 3],
      stdMultiplier: 1.06,
      maniaMultiplier: 1.00,
      key: 'A',
      cycleGroup: null,
      desc: 'Everything just got a bit harder... Smaller circles, faster approach, tighter timing, and vertically flipped.',
      descZh: '一切都变得更加困难——圆圈更小、缩圈更快、判定更严、掉血更快，且谱面垂直颠倒。',
      colors: ['#e11d48', '#be123c'], // Red
      conflictsWith: ['EZ']
    },
    SD: {
      id: 'SD',
      name: 'Sudden Death',
      nameZh: '绝命',
      abbr: 'SD',
      category: 'increase',
      modes: [0, 3],
      stdMultiplier: 1.00,
      maniaMultiplier: 1.00,
      key: 'S',
      cycleGroup: 'death',
      cycleNext: 'PF',
      desc: 'Miss a note and fail.',
      descZh: '一旦断连或漏打立即失败。',
      colors: ['#f59e0b', '#b45309'], // Orange/Gold
      conflictsWith: ['NF', 'RL', 'AP', 'AT', 'CM']
    },
    PF: {
      id: 'PF',
      name: 'Perfect',
      nameZh: '完胜',
      abbr: 'PF',
      category: 'increase',
      modes: [0, 3],
      stdMultiplier: 1.00,
      maniaMultiplier: 1.00,
      key: 'S',
      cycleGroup: 'death',
      cycleNext: null,
      desc: 'SS or quit. Non-300 hits fail immediately.',
      descZh: '唯有保持全满分（SS）才能通过，一旦出现非最高判定立即失败。',
      colors: ['#eab308', '#ca8a04'], // Bright Gold
      conflictsWith: ['NF', 'RL', 'AP', 'AT', 'CM']
    },
    DT: {
      id: 'DT',
      name: 'Double Time',
      nameZh: '双倍加速',
      abbr: 'DT',
      category: 'increase',
      modes: [0, 3],
      stdMultiplier: 1.12,
      maniaMultiplier: 1.00,
      key: 'D',
      cycleGroup: 'speed',
      cycleNext: 'NC',
      desc: 'Zoooooooooom. Song speed increased to 150%.',
      descZh: '极速狂飙——歌曲速度提升至 150%。',
      colors: ['#8b5cf6', '#6d28d9'], // Violet
      conflictsWith: ['HT']
    },
    NC: {
      id: 'NC',
      name: 'Nightcore',
      nameZh: '夜核',
      abbr: 'NC',
      category: 'increase',
      modes: [0, 3],
      stdMultiplier: 1.12,
      maniaMultiplier: 1.00,
      key: 'D',
      cycleGroup: 'speed',
      cycleNext: null,
      desc: 'uguuuuuuuu. 150% speed with pitched vocals and drum beats.',
      descZh: '魔性升调——150% 速度且音调提升，附带动感鼓点。',
      colors: ['#ec4899', '#be185d'], // Pink
      conflictsWith: ['HT']
    },
    HD: {
      id: 'HD',
      name: 'Hidden',
      nameZh: '隐藏',
      abbr: 'HD',
      category: 'increase',
      modes: [0, 3],
      stdMultiplier: 1.06,
      maniaMultiplier: 1.00,
      key: 'F',
      cycleGroup: 'fade',
      cycleNext: 3, // In mania cycles to FI
      desc: 'Play with no approach circles and fading notes for a score advantage.',
      descZh: '无缩圈提示且圆圈在点击前隐匿；在 Mania 模式下音符向判定线移动时隐匿。',
      colors: ['#64748b', '#334155'], // Slate / Dark Grey
      conflictsWith: ['FL']
    },
    FI: {
      id: 'FI',
      name: 'Fade In',
      nameZh: '渐入',
      abbr: 'FI',
      category: 'increase',
      modes: [3], // Mania only
      stdMultiplier: 1.00,
      maniaMultiplier: 1.00,
      key: 'F',
      cycleGroup: 'fade',
      cycleNext: null,
      desc: 'Notes start invisible and fade in as they approach the judgement line.',
      descZh: '音符起始不可见，向判定线靠近时逐渐显现。',
      colors: ['#06b6d4', '#0e7490'], // Cyan
      conflictsWith: ['HD', 'FL']
    },
    FL: {
      id: 'FL',
      name: 'Flashlight',
      nameZh: '手电筒',
      abbr: 'FL',
      category: 'increase',
      modes: [0, 3],
      stdMultiplier: 1.12,
      maniaMultiplier: 1.00,
      key: 'G',
      cycleGroup: null,
      desc: 'Restricted view area around the cursor / hit zone.',
      descZh: '视野受限——仅光标周围或判定线附近可见。',
      colors: ['#facc15', '#a16207'], // Yellow/Amber
      conflictsWith: ['HD', 'FI'] // in mania FL conflicts with HD/FI
    },

    // ---------------- Special (特殊) ----------------
    RL: {
      id: 'RL',
      name: 'Relax',
      nameZh: '轻松',
      abbr: 'RL',
      category: 'special',
      modes: [0], // Std only
      stdMultiplier: 0.00,
      maniaMultiplier: 0.00,
      key: 'Z',
      cycleGroup: null,
      desc: "Automatic clicking - just move the cursor. ** UNRANKED **",
      descZh: '无需点击键盘，只需专注移动光标瞄准即可自动打击。【不计分】',
      colors: ['#06b6d4', '#0891b2'],
      conflictsWith: ['AP', 'SD', 'PF', 'NF', 'AT', 'CM']
    },
    AP: {
      id: 'AP',
      name: 'Autopilot',
      nameZh: '自动光标',
      abbr: 'AP',
      category: 'special',
      modes: [0], // Std only
      stdMultiplier: 0.00,
      maniaMultiplier: 0.00,
      key: 'X',
      cycleGroup: null,
      desc: "Automatic cursor movement - just tap to the rhythm. ** UNRANKED **",
      descZh: '光标全自动引导瞄准，只需跟随节拍点击按键。【不计分】',
      colors: ['#3b82f6', '#1d4ed8'],
      conflictsWith: ['RL', 'SD', 'PF', 'NF', 'SO', 'AT', 'CM']
    },
    SO: {
      id: 'SO',
      name: 'Spun Out',
      nameZh: '自动大转盘',
      abbr: 'SO',
      category: 'special',
      modes: [0], // Std only
      stdMultiplier: 0.90,
      maniaMultiplier: 1.00,
      key: 'C',
      cycleGroup: null,
      desc: 'Spinners will be automatically completed.',
      descZh: '大转盘（Spinner）将全自动完成旋转。',
      colors: ['#10b981', '#047857'],
      conflictsWith: ['AP', 'AT', 'CM']
    },
    MR: {
      id: 'MR',
      name: 'Mirror',
      nameZh: '镜像',
      abbr: 'MR',
      category: 'special',
      modes: [3], // Mania only
      stdMultiplier: 1.00,
      maniaMultiplier: 1.00,
      key: 'M',
      cycleGroup: null,
      desc: 'Horizontally flips the column layout.',
      descZh: '所有轨道按键左右完全镜像翻转。',
      colors: ['#6366f1', '#4338ca'],
      conflictsWith: ['RD']
    },
    RD: {
      id: 'RD',
      name: 'Random',
      nameZh: '随机轨道',
      abbr: 'RD',
      category: 'special',
      modes: [3], // Mania only
      stdMultiplier: 0.00,
      maniaMultiplier: 0.00,
      key: 'R',
      cycleGroup: null,
      desc: 'Shuffle around the notes and columns! ** UNRANKED **',
      descZh: '将谱面的各按键轨道位置随机重排打乱！【不计分】',
      colors: ['#14b8a6', '#0f766e'],
      conflictsWith: ['MR']
    },
    AT: {
      id: 'AT',
      name: 'Auto',
      nameZh: '全自动演示',
      abbr: 'AT',
      category: 'special',
      modes: [0, 3],
      stdMultiplier: 1.00,
      maniaMultiplier: 1.00,
      key: 'V',
      cycleGroup: 'auto',
      cycleNext: 'CM',
      desc: 'Watch a perfect automated play through the song.',
      descZh: '观看 100% 完美的自动演示游玩过程。',
      colors: ['#2563eb', '#1e40af'],
      conflictsWith: ['SD', 'PF', 'RL', 'AP', 'SO']
    },
    CM: {
      id: 'CM',
      name: 'Cinema',
      nameZh: '影院模式',
      abbr: 'CM',
      category: 'special',
      modes: [0, 3],
      stdMultiplier: 1.00,
      maniaMultiplier: 1.00,
      key: 'V',
      cycleGroup: 'auto',
      cycleNext: null,
      desc: 'Relax and watch the video/storyboard with hitsounds.',
      descZh: '影院级纯净视听体验，隐藏游玩界面，沉浸欣赏背景与音效。',
      colors: ['#475569', '#1e293b'],
      conflictsWith: ['SD', 'PF', 'RL', 'AP', 'SO']
    },
    SV2: {
      id: 'SV2',
      name: 'ScoreV2',
      nameZh: '第二代计分',
      abbr: 'SV2',
      category: 'special',
      modes: [0, 3],
      stdMultiplier: 1.00,
      maniaMultiplier: 1.00,
      key: 'B',
      cycleGroup: null,
      desc: 'Standardised 1,000,000 max score algorithm. ** UNRANKED **',
      descZh: '采用以一百万分为基准的精确计分算法，滑条头带有严格判定。【不计分】',
      colors: ['#64748b', '#475569'],
      conflictsWith: []
    }
  };

  function playModSound(isEnable) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const f1 = isEnable ? 520 : 330;
      const f2 = isEnable ? 880 : 220;
      osc.frequency.setValueAtTime(f1, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(f2, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch(e) {}
  }

  // ---------------- Nightcore Drum Synthesis ----------------
  function playNightcoreBeat(ctx, destGain, beatIndex) {
    if (!ctx) return;
    try {
      const b = ((beatIndex % 4) + 4) % 4;
      const t = ctx.currentTime;
      const dest = destGain || ctx.destination;

      // Beats 0 and 2: Bass Drum (Kick)
      if (b === 0 || b === 2) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.09);
        g.gain.setValueAtTime(0.45, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.12);
      }

      // Beats 1 and 3: Clap
      if (b === 1 || b === 3) {
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, Math.floor(sr * 0.15), sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          const ti = i / sr;
          let env = 0;
          for (const o of [0, 0.012, 0.024]) {
            if (ti >= o) env += Math.exp(-(ti - o) * 70);
          }
          data[i] = (Math.random() * 2 - 1) * env * 0.4;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = 0.4;
        src.connect(g);
        g.connect(dest);
        src.start(t);
      }

      // Every 16 beats (4 bars): Crash Cymbal
      if (beatIndex % 16 === 0) {
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, Math.floor(sr * 0.5), sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          const ti = i / sr;
          data[i] = (Math.random() * 2 - 1) * Math.exp(-ti * 6) * 0.35;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = 0.35;
        src.connect(g);
        g.connect(dest);
        src.start(t);
      }
    } catch(e) {}
  }

  class OsuModsManager {
    constructor() {
      this.selectedMods = [];
      this.currentMode = 3; // 0: std, 3: mania
      this.isModalOpen = false;
      this.loadStoredMods();
    }

    loadStoredMods() {
      try {
        const stored = localStorage.getItem('webmania_selected_mods');
        if (stored) {
          this.selectedMods = JSON.parse(stored);
          this.sanitizeForMode(this.currentMode);
        }
      } catch (e) {
        this.selectedMods = [];
      }
    }

    saveStoredMods() {
      try {
        localStorage.setItem('webmania_selected_mods', JSON.stringify(this.selectedMods));
      } catch (e) {}
    }

    setMode(mode) {
      const newMode = Number(mode) === 0 ? 0 : 3;
      if (this.currentMode !== newMode) {
        this.currentMode = newMode;
        this.sanitizeForMode(this.currentMode);
        this.saveStoredMods();
        this.updateUI();
      }
    }

    getMode() {
      return this.currentMode;
    }

    getMods() {
      return [...this.selectedMods];
    }

    has(modId) {
      return this.selectedMods.includes(modId);
    }

    sanitizeForMode(mode) {
      const modeNum = Number(mode) === 0 ? 0 : 3;
      this.selectedMods = this.selectedMods.filter(id => {
        const def = MODS_METADATA[id];
        return def && def.modes.includes(modeNum);
      });
      this._resolveConflicts();
    }

    _resolveConflicts() {
      const active = new Set(this.selectedMods);
      for (const id of active) {
        const def = MODS_METADATA[id];
        if (!def) continue;
        if (def.conflictsWith) {
          for (const conflict of def.conflictsWith) {
            if (active.has(conflict)) {
              active.delete(conflict);
            }
          }
        }
        if (this.currentMode === 3) {
          if (id === 'FL' && (active.has('HD') || active.has('FI'))) {
            active.delete('HD');
            active.delete('FI');
          }
          if ((id === 'HD' || id === 'FI') && active.has('FL')) {
            active.delete('FL');
          }
        }
      }
      this.selectedMods = Array.from(active);
    }

    toggle(modId) {
      const def = MODS_METADATA[modId];
      if (!def || !def.modes.includes(this.currentMode)) return this.getMods();

      const idx = this.selectedMods.indexOf(modId);
      let wasEnabled = false;

      if (idx !== -1) {
        // Already active
        if (def.cycleGroup) {
          let nextMod = def.cycleNext;
          if (def.cycleGroup === 'fade' && this.currentMode === 3 && modId === 'HD') {
            nextMod = 'FI';
          }
          if (nextMod && MODS_METADATA[nextMod] && MODS_METADATA[nextMod].modes.includes(this.currentMode)) {
            this.selectedMods.splice(idx, 1, nextMod);
            this._resolveConflicts();
            this.saveStoredMods();
            playModSound(true);
            this.updateUI();
            return this.getMods();
          }
        }
        this.selectedMods.splice(idx, 1);
        wasEnabled = false;
      } else {
        // Not active -> activate
        if (def.cycleGroup) {
          this.selectedMods = this.selectedMods.filter(m => {
            const mDef = MODS_METADATA[m];
            return !mDef || mDef.cycleGroup !== def.cycleGroup;
          });
        }
        this.selectedMods.push(modId);

        if (def.conflictsWith) {
          this.selectedMods = this.selectedMods.filter(m => !def.conflictsWith.includes(m));
        }
        if (this.currentMode === 3) {
          if (modId === 'FL') {
            this.selectedMods = this.selectedMods.filter(m => m !== 'HD' && m !== 'FI');
          } else if (modId === 'HD' || modId === 'FI') {
            this.selectedMods = this.selectedMods.filter(m => m !== 'FL');
          }
        }
        wasEnabled = true;
      }

      this._resolveConflicts();
      this.saveStoredMods();
      playModSound(wasEnabled);
      this.updateUI();
      return this.getMods();
    }

    clear() {
      this.selectedMods = [];
      this.saveStoredMods();
      playModSound(false);
      this.updateUI();
      return this.selectedMods;
    }

    getMultiplier() {
      return OsuModsManager.calculateMultiplier(this.currentMode, this.selectedMods);
    }

    static getAvailableMods(mode) {
      const modeNum = Number(mode) === 0 ? 0 : 3;
      return Object.values(MODS_METADATA).filter(m => m.modes.includes(modeNum));
    }

    getAvailableMods(mode = this.currentMode) {
      return OsuModsManager.getAvailableMods(mode);
    }

    static calculateMultiplier(arg1, arg2) {
      let modeNum = 3;
      let modsList = [];
      if (Array.isArray(arg1)) {
        modsList = arg1;
        modeNum = Number(arg2) === 0 ? 0 : 3;
      } else if (Array.isArray(arg2)) {
        modeNum = Number(arg1) === 0 ? 0 : 3;
        modsList = arg2;
      } else {
        modeNum = Number(arg1) === 0 ? 0 : 3;
        modsList = [];
      }

      if (!modsList || modsList.length === 0) return 1.0;

      if (modsList.includes('RL') || modsList.includes('AP') || modsList.includes('RD') || modsList.includes('AT') || modsList.includes('CM')) {
        return 0.0;
      }

      let mult = 1.0;
      for (const id of modsList) {
        const def = MODS_METADATA[id];
        if (!def) continue;
        const m = modeNum === 0 ? def.stdMultiplier : def.maniaMultiplier;
        mult *= m;
      }

      if (modeNum === 3 && mult > 1.0) {
        mult = 1.0;
      }

      return Math.round(mult * 100) / 100;
    }

    static renderBadge(modId, size = 'normal') {
      const def = MODS_METADATA[modId];
      if (!def) return '';
      const c1 = def.colors[0], c2 = def.colors[1];
      const isSmall = size === 'small';
      const isMini = size === 'mini';
      const w = isMini ? 32 : isSmall ? 40 : 54;
      const h = isMini ? 20 : isSmall ? 25 : 34;
      const fs = isMini ? 10 : isSmall ? 12 : 16;

      return `
        <div class="osu-mod-badge mod-${modId.toLowerCase()} ${size}" 
             data-mod="${modId}" 
             title="${def.name} (${def.abbr}): ${def.descZh}"
             style="--c1: ${c1}; --c2: ${c2}; width: ${w}px; height: ${h}px; font-size: ${fs}px;">
          <span class="mod-abbr">${def.abbr}</span>
        </div>
      `;
    }

    static renderBadgeList(modsList, size = 'normal') {
      if (!modsList || modsList.length === 0) return '';
      return modsList.map(id => OsuModsManager.renderBadge(id, size)).join('');
    }

    // ---------------- UI Management ----------------
    initUI() {
      const btnMods = document.getElementById('btn-mods');
      if (btnMods) {
        btnMods.onclick = () => this.toggleModal();
      }

      const overlay = document.getElementById('mod-select-overlay');
      if (overlay) {
        overlay.onclick = (e) => {
          if (e.target === overlay) this.closeModal();
        };
      }

      window.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

        if (e.key === 'F1') {
          e.preventDefault();
          this.toggleModal();
          return;
        }

        if (this.isModalOpen && (e.key === 'Escape' || e.key === 'Esc')) {
          e.preventDefault();
          this.closeModal();
          return;
        }

        if (this.isModalOpen || document.getElementById('select-screen')?.classList.contains('active')) {
          const k = e.key.toUpperCase();
          if (k === '1') {
            e.preventDefault();
            this.clear();
            return;
          }
          for (const [id, def] of Object.entries(MODS_METADATA)) {
            if (def.key === k && def.modes.includes(this.currentMode)) {
              e.preventDefault();
              this.toggle(id);
              return;
            }
          }
        }
      });

      this.updateUI();
    }

    openModal() {
      const overlay = document.getElementById('mod-select-overlay');
      if (overlay) {
        this.isModalOpen = true;
        overlay.classList.add('active');
        this.renderModalCards();
        this.updateMultiplierDisplay();
      }
    }

    closeModal() {
      const overlay = document.getElementById('mod-select-overlay');
      if (overlay) {
        this.isModalOpen = false;
        overlay.classList.remove('active');
      }
    }

    toggleModal() {
      if (this.isModalOpen) this.closeModal();
      else this.openModal();
    }

    updateUI() {
      this.updateActiveBadgesBar();
      if (this.isModalOpen) {
        this.renderModalCards();
        this.updateMultiplierDisplay();
      }
    }

    updateActiveBadgesBar() {
      const bar = document.getElementById('active-mods-badges');
      if (bar) {
        bar.innerHTML = OsuModsManager.renderBadgeList(this.selectedMods, 'small');
      }
      const btnMods = document.getElementById('btn-mods');
      if (btnMods) {
        if (this.selectedMods.length > 0) {
          btnMods.classList.remove('secondary');
          btnMods.style.backgroundColor = '#6366f1';
          btnMods.style.boxShadow = '0 0 15px rgba(99, 102, 241, 0.5)';
        } else {
          btnMods.classList.add('secondary');
          btnMods.style.backgroundColor = '';
          btnMods.style.boxShadow = '';
        }
      }
    }

    updateMultiplierDisplay() {
      const valEl = document.getElementById('modal-multiplier-val');
      const pillEl = document.getElementById('modal-multiplier-pill');
      const modeBadge = document.getElementById('modal-mode-badge');
      if (modeBadge) {
        const isStd = this.currentMode === 0;
        modeBadge.innerText = isStd ? 'OSU!STANDARD' : 'OSU!MANIA';
        modeBadge.style.background = isStd ? 'rgba(236, 72, 153, 0.2)' : 'rgba(59, 130, 246, 0.2)';
        modeBadge.style.color = isStd ? '#f472b6' : '#60a5fa';
        modeBadge.style.borderColor = isStd ? 'rgba(236, 72, 153, 0.4)' : 'rgba(59, 130, 246, 0.4)';
      }

      const mult = this.getMultiplier();
      if (valEl) {
        valEl.innerText = mult.toFixed(2) + 'x';
      }
      if (pillEl) {
        pillEl.classList.remove('unranked', 'boosted', 'reduced');
        if (mult === 0 || this.has('RL') || this.has('AP') || this.has('RD')) {
          pillEl.classList.add('unranked');
          if (valEl) valEl.innerText = 'Unranked (0.00x)';
        } else if (mult > 1.0) {
          pillEl.classList.add('boosted');
        } else if (mult < 1.0) {
          pillEl.classList.add('reduced');
        }
      }
    }

    renderModalCards() {
      const reductionList = document.getElementById('mod-list-reduction');
      const increaseList = document.getElementById('mod-list-increase');
      const specialList = document.getElementById('mod-list-special');

      if (!reductionList || !increaseList || !specialList) return;

      const buildCards = (cat) => {
        const mods = Object.values(MODS_METADATA).filter(
          m => m.category === cat && m.modes.includes(this.currentMode)
        );

        return mods.map(m => {
          const isActive = this.has(m.id);
          let isConflicted = false;
          if (!isActive) {
            if (m.conflictsWith && m.conflictsWith.some(c => this.has(c))) {
              isConflicted = true;
            }
            if (this.currentMode === 3) {
              if (m.id === 'FL' && (this.has('HD') || this.has('FI'))) isConflicted = true;
              if ((m.id === 'HD' || m.id === 'FI') && this.has('FL')) isConflicted = true;
            }
          }

          const multiplier = this.currentMode === 0 ? m.stdMultiplier : m.maniaMultiplier;
          let tagText = `${multiplier.toFixed(2)}x`;
          if (multiplier === 0) tagText = 'Unranked';
          else if (multiplier > 1.0) tagText = `+${Math.round((multiplier - 1) * 100)}%`;
          else if (multiplier < 1.0) tagText = `-${Math.round((1 - multiplier) * 100)}%`;

          const keyBadge = m.key ? `<span class="mod-card-key">[${m.key}]</span>` : '';
          const activeClass = isActive ? 'active' : '';
          const disabledClass = isConflicted ? 'disabled' : '';

          return `
            <div class="mod-card ${activeClass} ${disabledClass}" 
                 onclick="window.osuMods.toggle('${m.id}')"
                 title="${m.descZh}">
              ${OsuModsManager.renderBadge(m.id, 'small')}
              <div class="mod-card-info">
                <div class="mod-card-name-row">
                  <span class="mod-card-name">${m.nameZh} (${m.name})</span>
                  <span class="mod-card-tag">${tagText}</span>
                </div>
                <div class="mod-card-desc">${m.descZh}</div>
              </div>
              ${keyBadge}
            </div>
          `;
        }).join('');
      };

      reductionList.innerHTML = buildCards('reduction');
      increaseList.innerHTML = buildCards('increase');
      specialList.innerHTML = buildCards('special');
    }
  }

  // Global helper functions
  root.openModsModal = function () { root.osuMods.openModal(); };
  root.closeModsModal = function () { root.osuMods.closeModal(); };
  root.toggleModsModal = function () { root.osuMods.toggleModal(); };
  root.resetMods = function () { root.osuMods.clear(); };
  root.updateModsUI = function () { root.osuMods.updateUI(); };
  root.playNightcoreBeat = playNightcoreBeat;

  // Export
  root.MODS_METADATA = MODS_METADATA;
  root.OsuModsManager = OsuModsManager;
  root.osuMods = new OsuModsManager();

  // Auto-init on DOMContentLoaded if in browser
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      root.osuMods.initUI();
    });
  }

})(typeof window !== 'undefined' ? window : global);
