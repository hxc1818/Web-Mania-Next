// /public/js/index.js
class OsuSlider {
    constructor(containerId, options) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        this.labelKey = options.labelKey;
        this.defaultValue = options.defaultValue;
        this.min = options.min || 0;
        this.max = options.max || 100;
        this.value = options.value !== undefined ? options.value : this.defaultValue;
        this.onChange = options.onChange;
        this.formatter = options.formatter || (v => v);
        this.step = options.step || 1;

        this.typingStr = null;
        this.isDragging = false;

        this.buildDOM();
        this.attachEvents();
        this.updateVisuals();
    }

    buildDOM() {
        const lang = userSettings.language || 'zh';
        const translatedLabel = (i18nDict[lang] && i18nDict[lang][this.labelKey]) ? i18nDict[lang][this.labelKey] : this.labelKey;
        
        this.container.innerHTML = `
            <div class="osu-slider-wrapper" tabindex="0">
                <div class="osu-slider-main">
                    <div class="slider-left">
                        <span class="slider-label" data-i18n="${this.labelKey}">${translatedLabel}</span>
                        <div class="slider-value-container">
                            <span class="slider-value"></span>
                        </div>
                    </div>
                    <div class="slider-track">
                        <div class="slider-fill"></div>
                        <div class="slider-thumb"></div>
                    </div>
                </div>
                <div class="slider-reset">
                    <button class="slider-reset-btn" title="重置为默认值">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                </div>
            </div>
        `;
        this.wrapper = this.container.querySelector('.osu-slider-wrapper');
        this.valDisplay = this.container.querySelector('.slider-value');
        this.track = this.container.querySelector('.slider-track');
        this.fill = this.container.querySelector('.slider-fill');
        this.thumb = this.container.querySelector('.slider-thumb');
        this.resetContainer = this.container.querySelector('.slider-reset');
        this.resetBtn = this.container.querySelector('.slider-reset-btn');
    }

    setValue(val, triggerOnChange = true) {
        let newVal = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(newVal)) return;
        newVal = Math.max(this.min, Math.min(this.max, newVal));
        
        if (this.step && this.step !== 1) {
            const inv = 1.0 / this.step;
            newVal = Math.round(newVal * inv) / inv;
        } else {
            newVal = Math.round(newVal);
        }

        if (this.value !== newVal) {
            this.value = newVal;
            if (triggerOnChange) this.onChange(this.value);
        }
        this.updateVisuals();
    }

    updateVisuals() {
        let percent = ((this.value - this.min) / (this.max - this.min)) * 100;
        percent = Math.max(0, Math.min(100, percent));
        this.fill.style.width = `${percent}%`;
        this.thumb.style.left = `${percent}%`;
        this.thumb.style.opacity = percent > 0 ? '1' : '0.8';

        if (this.typingStr !== null) {
            this.valDisplay.innerHTML = `<span class="slider-typing">${this.typingStr}</span>`;
        } else {
            this.valDisplay.innerText = this.formatter(this.value);
        }

        if (this.value !== this.defaultValue) {
            this.resetContainer.classList.add('show');
        } else {
            this.resetContainer.classList.remove('show');
        }
    }

    updateFromEvent(e) {
        const rect = this.track.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        const val = percent * (this.max - this.min) + this.min;
        this.setValue(val);
        this.typingStr = null;
    }

    attachEvents() {
        this.track.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.track.setPointerCapture(e.pointerId);
            this.isDragging = true;
            this.updateFromEvent(e);
            this.wrapper.focus();
        });

        this.track.addEventListener('pointermove', (e) => {
            if (this.isDragging) this.updateFromEvent(e);
        });

        const endDrag = (e) => {
            this.isDragging = false;
            this.track.releasePointerCapture(e.pointerId);
        };
        this.track.addEventListener('pointerup', endDrag);
        this.track.addEventListener('pointercancel', endDrag);

        this.wrapper.addEventListener('blur', () => {
            this.typingStr = null;
            this.updateVisuals();
        });

        this.wrapper.addEventListener('keydown', (e) => {
            if ((e.key >= '0' && e.key <= '9') || e.key === '-' || e.key === '.') {
                e.preventDefault();
                this.typingStr = (this.typingStr === null ? '' : this.typingStr) + e.key;
                if(this.typingStr.length > 5) this.typingStr = this.typingStr.slice(0, 5);
                this.updateVisuals();
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                if (this.typingStr !== null) {
                    this.typingStr = this.typingStr.slice(0, -1);
                    if (this.typingStr.length === 0) this.typingStr = null;
                    this.updateVisuals();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (this.typingStr !== null) {
                    this.setValue(this.typingStr);
                    this.typingStr = null;
                    this.updateVisuals();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.typingStr = null;
                this.updateVisuals();
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                this.setValue(this.value + this.step);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                this.setValue(this.value - this.step);
            }
        });

        this.resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setValue(this.defaultValue);
            this.typingStr = null;
            this.updateVisuals();
        });
    }
}

class OsuToggle {
    constructor(containerId, options) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        this.labelKey = options.labelKey;
        this.defaultValue = options.defaultValue || false;
        this.value = options.value !== undefined ? options.value : this.defaultValue;
        this.onChange = options.onChange;

        this.buildDOM();
        this.attachEvents();
        this.updateVisuals();
    }

    buildDOM() {
        const lang = userSettings.language || 'zh';
        const translatedLabel = (i18nDict[lang] && i18nDict[lang][this.labelKey]) ? i18nDict[lang][this.labelKey] : this.labelKey;
        
        this.container.innerHTML = `
            <div class="osu-toggle-wrapper" tabindex="0">
                <div class="osu-toggle-main">
                    <div class="toggle-left">
                        <span class="toggle-label" data-i18n="${this.labelKey}">${translatedLabel}</span>
                    </div>
                    <div class="toggle-right">
                        <div class="toggle-graphic"></div>
                    </div>
                </div>
                <div class="toggle-reset slider-reset">
                    <button class="slider-reset-btn" title="重置为默认值">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                </div>
            </div>
        `;
        this.wrapper = this.container.querySelector('.osu-toggle-wrapper');
        this.main = this.container.querySelector('.osu-toggle-main');
        this.graphic = this.container.querySelector('.toggle-graphic');
        this.resetContainer = this.container.querySelector('.toggle-reset');
        this.resetBtn = this.container.querySelector('.slider-reset-btn');
    }

    setValue(val, triggerOnChange = true) {
        if (this.value !== val) {
            this.value = val;
            if (triggerOnChange) this.onChange(this.value);
        }
        this.updateVisuals();
    }

    updateVisuals() {
        if (this.value) {
            this.graphic.classList.add('on');
            this.graphic.classList.remove('off');
        } else {
            this.graphic.classList.add('off');
            this.graphic.classList.remove('on');
        }

        if (this.value !== this.defaultValue) {
            this.resetContainer.classList.add('show');
        } else {
            this.resetContainer.classList.remove('show');
        }
    }

    attachEvents() {
        this.main.addEventListener('click', () => {
            this.setValue(!this.value);
        });

        this.wrapper.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.setValue(!this.value);
            }
        });

        this.resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setValue(this.defaultValue);
        });
    }
}


let beatmaps = [];
let mapGroups = {};
let selectedMap = null;
let previewAudio = new Audio();
let favorites = JSON.parse(localStorage.getItem('webmania_favorites') || '[]');
let parsedMapCache = {}; 
let currentPreviewAudioPath = "";
let contextTarget = null;
let currentLeaderboard = [];
let currentLocalScores = [];
let searchDebounceTimer = null; 

const isSelector = new URLSearchParams(window.location.search).get('selector') === 'true';
const filterDir = new URLSearchParams(window.location.search).get('filterDir');

const bgObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
        const target = entry.target;
        if (entry.isIntersecting) {
            target.bgTimeout = setTimeout(() => {
                const bg = target.getAttribute('data-bg');
                if (bg) {
                    target.style.backgroundImage = `url("${bg}")`;
                    target.removeAttribute('data-bg'); 
                }
                obs.unobserve(target); 
            }, 150);
        } else {
            if (target.bgTimeout) {
                clearTimeout(target.bgTimeout);
                target.bgTimeout = null;
            }
        }
    });
}, { rootMargin: '200px 0px' });

function setAudioVolumeSmoothly(audioElem, targetVol, duration = 300) {
    if(!audioElem) return;
    if (audioElem.fadeInterval) clearInterval(audioElem.fadeInterval);
    const startVol = audioElem.volume;
    const diff = targetVol - startVol;
    const steps = 15;
    const stepTime = duration / steps;
    let step = 0;
    audioElem.fadeInterval = setInterval(() => {
        step++;
        let v = startVol + (diff * (step / steps));
        if (v < 0) v = 0; if (v > 1) v = 1;
        audioElem.volume = v;
        if (step >= steps) {
            clearInterval(audioElem.fadeInterval);
            audioElem.volume = targetVol;
        }
    }, stepTime);
}

let volTimeout;
function updatePreviewVolume() {
    clearTimeout(volTimeout);
    volTimeout = setTimeout(() => {
        if (previewAudio) {
            const mVol = (userSettings.masterVol !== undefined ? userSettings.masterVol : 100) / 100;
            const bgVol = (userSettings.bgVol !== undefined ? userSettings.bgVol : 50) / 100;
            const musicVol = (userSettings.musicVol !== undefined ? userSettings.musicVol : 100) / 100;
            
            const currentMaster = document.hasFocus() ? mVol : bgVol;
            let targetVol = currentMaster * musicVol * 0.5;
            if (targetVol < 0) targetVol = 0;
            if (targetVol > 1) targetVol = 1;
            
            if (previewAudio.paused || previewAudio.currentTime === 0) {
                previewAudio.volume = targetVol;
            } else {
                setAudioVolumeSmoothly(previewAudio, targetVol);
            }
        }
    }, 150); 
}

window.addEventListener('blur', updatePreviewVolume);
window.addEventListener('focus', updatePreviewVolume);

function applyUIScale() {
    const scale = userSettings.uiScale || 1.0;
    const selectScreen = document.getElementById('select-screen');
    if (selectScreen) {
        selectScreen.style.zoom = scale;
    }
}

function handleSearchInput() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        renderMapList();
    }, 250); 
}

window.addEventListener('DOMContentLoaded', () => {
    applyTranslations();
    applyUIScale(); 

    if (isSelector) {
        document.querySelector('.mode-switcher').style.display = 'none';
        document.getElementById('settings-btn').style.display = 'none';
        if (filterDir) {
            const searchBar = document.getElementById('search-bar-container');
            if (searchBar) searchBar.style.display = 'none';
        }
    }

    sessionStorage.setItem('webmania_multi', 'false');
    sessionStorage.removeItem('webmania_multi_role');
    sessionStorage.removeItem('webmania_replay_data');

    const savedPath = localStorage.getItem('wm_folderPath') || '';
    document.getElementById('folder-input').value = savedPath;
    if(savedPath) document.getElementById('path-display').innerText = savedPath;

    const skipSetup = localStorage.getItem('wm_skip_setup') === 'true';

    if (savedPath) {
        if (skipSetup) {
            document.getElementById('setup-screen').classList.remove('active');
            document.getElementById('select-screen').classList.add('active');
            document.getElementById('map-list').innerHTML = '<div style="color:#60a5fa; text-align:center; padding: 50px; font-weight: 600;">正在加载缓存数据...</div>';
        }
        const status = document.getElementById('scan-status');
        if (status) status.innerText = '正在初始化扫描...';
        doScan(false); 
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.addEventListener('input', handleSearchInput);
    const sortField = document.getElementById('sort-field');
    if (sortField) sortField.addEventListener('change', renderMapList);
    const sortDir = document.getElementById('sort-dir');
    if (sortDir) sortDir.addEventListener('change', renderMapList);

    initSettingsUI();
    populateAudioDevices();
});

function initSettingsUI() {
    const bindEl = (id, prop, type = 'value', onChange = null) => {
        const el = document.getElementById(id);
        if(!el) return;
        if(type === 'value') {
            el.value = userSettings[prop];
            el.addEventListener('change', (e) => {
                let v = e.target.value;
                userSettings[prop] = v;
                saveSettings();
                
                if (prop === 'renderer' || prop === 'fpsLimit' || prop === 'threadMode') saveSysConfig();
                if (prop === 'language') applyTranslations();
                if (onChange) onChange();
            });
        }
    };

    bindEl('st-language', 'language');
    bindEl('st-renderer', 'renderer');
    bindEl('st-fpsLimit', 'fpsLimit');
    bindEl('st-threadMode', 'threadMode');
    bindEl('st-audioDevice', 'audioDevice');

    // 初始化全局滑块映射，用于被动式数值修改
    window.osuSliders = {};
    const initSlider = (id, prop, labelKey, min, max, step, defVal, formatStr, onChangeExtra) => {
        if(!document.getElementById(id)) return;
        window.osuSliders[prop] = new OsuSlider(id, {
            labelKey: labelKey,
            min: min,
            max: max,
            step: step,
            defaultValue: defVal,
            value: userSettings[prop] !== undefined ? userSettings[prop] : defVal,
            formatter: formatStr,
            onChange: (val) => {
                userSettings[prop] = val;
                saveSettings();
                if (onChangeExtra) onChangeExtra(val);
            }
        });
    };

    initSlider('slider-bgBlur', 'bgBlur', 'bg_blur', 0, 50, 1, 8, v => v + 'px');
    initSlider('slider-bgDim', 'bgDim', 'bg_dim', 0, 100, 1, 80, v => v + '%');
    initSlider('slider-scrollSpeed', 'scrollSpeed', 'speed', 100, 4000, 10, 1000, v => v);
    initSlider('slider-trackScale', 'trackScale', 'scale', 0.1, 4, 0.1, 1.0, v => v.toFixed(1) + 'x');
    initSlider('slider-masterVol', 'masterVol', 'master_vol', 0, 100, 1, 100, v => v + '%', updatePreviewVolume);
    initSlider('slider-bgVol', 'bgVol', 'bg_vol', 0, 100, 1, 50, v => v + '%', updatePreviewVolume);
    initSlider('slider-sfxVol', 'sfxVol', 'sfx_vol', 0, 100, 1, 100, v => v + '%');
    initSlider('slider-musicVol', 'musicVol', 'music_vol', 0, 100, 1, 100, v => v + '%', updatePreviewVolume);
    initSlider('slider-offset', 'offset', 'audio_offset', -1000, 1000, 1, 0, v => v + 'ms');
    initSlider('slider-uiScale', 'uiScale', 'ui_scale', 0.1, 4.0, 0.1, 1.0, v => v.toFixed(1) + 'x', () => applyUIScale());

    // 初始化全局开关映射
    window.osuToggles = {};
    const initToggle = (id, prop, labelKey, defVal, onChangeExtra) => {
        if(!document.getElementById(id)) return;
        window.osuToggles[prop] = new OsuToggle(id, {
            labelKey: labelKey,
            defaultValue: defVal,
            value: userSettings[prop] !== undefined ? userSettings[prop] : defVal,
            onChange: (val) => {
                userSettings[prop] = val;
                saveSettings();
                if (onChangeExtra) onChangeExtra(val);
            }
        });
    };

    initToggle('toggle-touchClick', 'touchClick', 'touch_click', false);
    initToggle('toggle-hitErrorMeter', 'hitErrorMeter', 'hit_error', true);
    initToggle('toggle-noStoryboard', 'noStoryboard', 'no_sb', false);
    initToggle('toggle-autoOffset', 'autoOffset', 'auto_offset', false);
    initToggle('toggle-autoKiosk', 'autoKiosk', 'auto_kiosk', false);
    initToggle('toggle-desync', 'desync', 'desync', false);
    initToggle('toggle-showFps', 'showFps', 'show_fps', true);
    initToggle('toggle-hwAccel', 'hwAccel', 'hw_accel', false);
    initToggle('toggle-enableHitSounds', 'enableHitSounds', 'enable_hitsounds', true);

    document.getElementById('st-folder').value = localStorage.getItem('wm_folderPath') || '';
    document.getElementById('st-folder').addEventListener('change', (e) => {
        localStorage.setItem('wm_folderPath', e.target.value);
    });

    document.getElementById('st-multiId').value = localStorage.getItem('wm_username') || '';
    userSettings.multiId = localStorage.getItem('wm_username') || '';
    document.getElementById('st-multiId').addEventListener('input', (e) => {
        userSettings.multiId = e.target.value;
        saveSettings();
    });

    const kSel = document.getElementById('st-skin-keys');
    kSel.value = '4';
    renderSkinColors(4);
    kSel.addEventListener('change', (e) => {
        renderSkinColors(parseInt(e.target.value));
    });

    const errStr = localStorage.getItem('webmania_last_error');
    if (errStr && parseInt(errStr) !== 0) {
        const btn = document.getElementById('btn-use-rec');
        btn.style.display = 'block';
        btn.innerText = (userSettings.language === 'en' ? 'Use Rec: ' : '使用推荐延迟: ') + parseInt(errStr) + 'ms';
    }
}

function renderSkinColors(k) {
    const cont = document.getElementById('st-skin-colors');
    cont.innerHTML = '';
    const colors = userSettings.laneColors[k];
    for(let i = 0; i < k; i++) {
        const div = document.createElement('div');
        div.style.display = 'flex'; div.style.flexDirection = 'column';
        div.innerHTML = `<label style="font-size:12px; color:#aaa; margin-bottom:5px;">K${i+1}</label>
                         <input type="color" class="color-picker" value="${colors[i]}">`;
        const cp = div.querySelector('.color-picker');
        cp.addEventListener('input', (e) => {
            userSettings.laneColors[k][i] = e.target.value;
            saveSettings();
        });
        cont.appendChild(div);
    }
}

document.getElementById('settings-btn').onclick = () => {
    document.getElementById('settings-sidebar').classList.add('show');
    document.getElementById('sidebar-close-zone').classList.add('show');
};

function closeSettings() {
    document.getElementById('settings-sidebar').classList.remove('show');
    document.getElementById('sidebar-close-zone').classList.remove('show');
}

window.triggerRebuildCache = function() {
    closeSettings();
    const list = document.getElementById('map-list');
    if (list) {
        list.innerHTML = '<div style="color:#ef4444; text-align:center; padding: 50px; font-weight: 600;" data-i18n="rebuilding_cache">正在深度扫描并重建缓存...</div>';
        applyTranslations();
    }
    doScan(true);
};

async function populateAudioDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        const sel = document.getElementById('st-audioDevice');
        sel.innerHTML = '<option value="default">Default / 默认</option>' + outputs.map(d => `<option value="${d.deviceId}">${d.label || 'Unknown Device'}</option>`).join('');
        sel.value = userSettings.audioDevice || 'default';
    } catch(e) {}
}

async function openSongsFolder() {
    const p = localStorage.getItem('wm_folderPath');
    if(p) fetch(`${LOCAL_API_URL}/open_folder?path=${encodeURIComponent(p)}`);
}

async function browseFolder() {
    try {
        const res = await fetch(`${LOCAL_API_URL}/select_folder`);
        const data = await res.json();
        if (data.path) {
            document.getElementById('st-folder').value = data.path;
            localStorage.setItem('wm_folderPath', data.path);
            doScan(false);
        }
    } catch (err) {}
}

document.getElementById('select-folder-btn').onclick = async () => {
    const statusEl = document.getElementById('scan-status');
    if (statusEl) statusEl.innerText = '正在打开目录选择器...';
    try {
        const res = await fetch(`${LOCAL_API_URL}/select_folder`);
        const data = await res.json();
        if (data.path) {
            document.getElementById('folder-input').value = data.path;
            document.getElementById('path-display').innerText = data.path;
            localStorage.setItem('wm_folderPath', data.path);
            if (statusEl) statusEl.innerText = '路径已确认。';
        } else {
            throw new Error(data.error || '请求被拒绝');
        }
    } catch (err) {
        const manual = prompt('无法打开文件夹对话框。请输入完整的绝对路径：');
        if (manual) {
            document.getElementById('folder-input').value = manual;
            document.getElementById('path-display').innerText = manual;
            localStorage.setItem('wm_folderPath', manual);
            if (statusEl) statusEl.innerText = '手动路径已保存。';
        } else {
            if (statusEl) statusEl.innerText = '操作已取消。';
        }
    }
};

function applyRecommendedOffset() {
    const errStr = localStorage.getItem('webmania_last_error');
    if (errStr && parseInt(errStr) !== 0) {
        userSettings.offset += parseInt(errStr);
        localStorage.setItem('webmania_last_error', '0');
        if(window.osuSliders && window.osuSliders['offset']) {
            window.osuSliders['offset'].setValue(userSettings.offset, false);
        }
        saveSettings();
        document.getElementById('btn-use-rec').style.display = 'none';
    }
}

function openKeybinds() {
    window.open('keybinds.html', 'Web Mania Next Keybinds', 'width=800,height=600,autoHideMenuBar=true');
}

window.addEventListener('storage', (e) => {
    if(e.key === 'webmania_settings') {
        userSettings = JSON.parse(e.newValue);
    }
});

async function doScan(forceRescan = false) {
    const path = document.getElementById('folder-input').value || localStorage.getItem('wm_folderPath');
    const status = document.getElementById('scan-status');
    if (!path.trim()) { if (status) status.innerText = '错误：路径为空'; return; }
    if (status) status.innerText = forceRescan ? '深度扫描中...' : '正在读取缓存...';
    
    try {
        const res = await fetch(`${LOCAL_API_URL}/scan`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ folderPath: path, forceRescan }) 
        });
        const data = await res.json();
        
        if (data.success) { 
            beatmaps = data.beatmaps || [];
            localStorage.setItem('wm_folderPath', path);
            localStorage.setItem('wm_skip_setup', 'true');
            
            mapGroups = {};
            beatmaps.forEach(bm => {
                const key = bm.dirPath;
                if (!mapGroups[key]) mapGroups[key] = [];
                mapGroups[key].push(bm);
            });

            renderMapList();
            
            const activeScreenId = document.querySelector('.screen.active')?.id;
            if (activeScreenId === 'setup-screen' || activeScreenId === 'select-screen') {
                if (activeScreenId === 'setup-screen') showScreen('select-screen');
                
                const lastMapStr = sessionStorage.getItem('webmania_current_map');
                let restored = false;
                if (lastMapStr && beatmaps.length > 0 && !filterDir) {
                    const lastMap = JSON.parse(lastMapStr);
                    const targetMap = beatmaps.find(b => b.id === lastMap.id);
                    if (targetMap) {
                        restored = true;
                        setTimeout(() => {
                            const keys = Object.keys(mapGroups);
                            for (let key of keys) {
                                if (mapGroups[key].find(m => m.id === targetMap.id)) {
                                    const header = document.querySelector(`.map-group-header[data-key="${key.replace(/"/g, '&quot;')}"]`);
                                    if (header) {
                                        const groupEl = header.parentElement;
                                        if (!groupEl.classList.contains('expanded')) {
                                            header.click(); 
                                        }
                                        setTimeout(() => {
                                            const diffItem = document.querySelector(`.map-diff-item[data-id="${targetMap.id}"]`);
                                            if (diffItem) {
                                                selectedMap = null; 
                                                selectMap(targetMap, diffItem);
                                                diffItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            }
                                        }, 100);
                                    }
                                    break;
                                }
                            }
                        }, 100);
                    }
                }
                
                if (!restored) {
                    const firstGroupEl = document.querySelector('.map-group-header');
                    if (firstGroupEl) firstGroupEl.click();
                }
            }
            if (status) {
                status.innerText = `已加载 ${beatmaps.length} 张谱面。`;
                status.style.color = '#34d399';
            }
        } else { 
            if (status) { status.style.color = '#ef4444'; status.innerText = '错误：扫描失败。'; }
        }
    } catch (e) { 
        if (status) { status.style.color = '#ef4444'; status.innerText = `错误：${e.message}`; }
    }
}

document.getElementById('scan-btn').onclick = () => doScan(false);

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if(isSelector) return;

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.endsWith('.osz')) {
        const folderPath = document.getElementById('folder-input').value || localStorage.getItem('wm_folderPath');
        if (!folderPath) return alert('未配置路径。');
        
        const sts = document.getElementById('scan-status');
        if (sts) { sts.style.color = '#60a5fa'; sts.innerText = '正在处理 OSZ...'; }
        
        const fd = new FormData();
        fd.append('file', files[0]);
        fd.append('folderPath', folderPath);
        
        try {
            const res = await fetch(`${LOCAL_API_URL}/upload`, { method: 'POST', body: fd });
            const data = await res.json();
            if (data.success) { 
                if (sts) sts.innerText = '安装完成。正在重建缓存...'; 
                doScan(true); 
            } 
            else throw new Error(data.error);
        } catch (err) { 
            if (sts) { sts.style.color = '#ef4444'; sts.innerText = '导入失败：' + err.message; }
        }
    }
});

document.addEventListener('click', () => { document.getElementById('context-menu').style.display = 'none'; });

document.getElementById('cm-fav').onclick = () => {
    if (!contextTarget) return;
    const dir = contextTarget.getAttribute('data-dir');
    const idx = favorites.indexOf(dir);
    if (idx === -1) { favorites.push(dir); } else { favorites.splice(idx, 1); }
    localStorage.setItem('webmania_favorites', JSON.stringify(favorites));
    renderMapList();
};

document.getElementById('cm-rename').onclick = async () => {
    if (!contextTarget) return;
    const dir = contextTarget.getAttribute('data-dir');
    const newName = prompt("请输入新文件夹名称（仅限字母/数字/空格）：", dir.split('/').pop());
    if (newName && newName.trim()) {
        try {
            const res = await fetch(`${LOCAL_API_URL}/rename_map`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ dirPath: dir, newName })
            });
            const data = await res.json();
            if (data.success) { doScan(true); } else alert("重命名失败: " + data.error);
        } catch(e) { alert("错误: " + e.message); }
    }
};

document.getElementById('cm-delete').onclick = async () => {
    if (!contextTarget) return;
    const dir = contextTarget.getAttribute('data-dir');
    if (confirm("您确定要永久删除此谱面吗？")) {
        try {
            const res = await fetch(`${LOCAL_API_URL}/delete_map`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ dirPath: dir })
            });
            const data = await res.json();
            if (data.success) { doScan(true); } else alert("删除失败: " + data.error);
        } catch(e) { alert("错误: " + e.message); }
    }
};

function showContextMenu(e, dirPath) {
    e.preventDefault();
    contextTarget = e.currentTarget;
    contextTarget.setAttribute('data-dir', dirPath);
    const cm = document.getElementById('context-menu');
    cm.style.display = 'block';
    cm.style.left = e.pageX + 'px';
    cm.style.top = e.pageY + 'px';
    if (favorites.includes(dirPath)) { document.getElementById('cm-fav').innerText = "取消收藏"; } else { document.getElementById('cm-fav').innerText = "加入收藏"; }
}

document.getElementById('btn-random-map').onclick = () => {
    if (beatmaps.length === 0) return;
    let availableMaps = beatmaps;
    if (filterDir) availableMaps = beatmaps.filter(b => b.dirPath.includes(filterDir));
    if (availableMaps.length === 0) return;

    const rndMap = availableMaps[Math.floor(Math.random() * availableMaps.length)];
    const key = rndMap.dirPath;
    const header = document.querySelector(`.map-group-header[data-key="${key.replace(/"/g, '&quot;')}"]`);
    if (header) {
        if (!header.parentElement.classList.contains('expanded')) {
            header.click(); 
        }
        setTimeout(() => {
            const diffItem = document.querySelector(`.map-diff-item[data-id="${rndMap.id}"]`);
            if (diffItem) {
                selectedMap = null; 
                selectMap(rndMap, diffItem);
                diffItem.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
            }
        }, 100); 
    }
};

function renderMapList() {
    const list = document.getElementById('map-list');
    list.innerHTML = '';
    bgObserver.disconnect(); 
    mapGroups = {};
    beatmaps.forEach(bm => {
        const key = bm.dirPath; 
        if (!mapGroups[key]) mapGroups[key] = [];
        mapGroups[key].push(bm);
    });

    const searchTerm = (document.getElementById('search-input')?.value || '').toLowerCase();
    const sortField = document.getElementById('sort-field')?.value || 'title';
    const sortDir = document.getElementById('sort-dir')?.value || 'asc';

    let groupArray = Object.keys(mapGroups).map(key => {
        const maps = mapGroups[key];
        return {
            key: key, maps: maps, title: maps[0].title.toLowerCase(), artist: maps[0].artist.toLowerCase(),
            maxStars: Math.max(...maps.map(m => m.stars || getFakeStars(m.version))),
            avgBpm: maps.reduce((sum, m) => sum + (m.bpm || 0), 0) / maps.length,
            dirPath: maps[0].dirPath
        };
    });

    if (filterDir) {
        groupArray = groupArray.filter(g => g.dirPath.includes(filterDir));
    }

    if (searchTerm) {
        groupArray = groupArray.filter(g => g.title.includes(searchTerm) || g.artist.includes(searchTerm) || g.maps.some(m => m.version.toLowerCase().includes(searchTerm)));
    }

    groupArray.sort((a, b) => {
        let valA = a[sortField] !== undefined ? a[sortField] : a.maxStars;
        let valB = b[sortField] !== undefined ? b[sortField] : b.maxStars;
        if (sortField === 'bpm') { valA = a.avgBpm; valB = b.avgBpm; }
        const favA = favorites.includes(a.dirPath) ? 1 : 0;
        const favB = favorites.includes(b.dirPath) ? 1 : 0;
        if (favA !== favB) return favB - favA; 
        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    if (!isSelector && !searchTerm && !filterDir) {
        const randomGroupEl = document.createElement('div');
        randomGroupEl.className = 'map-group';
        randomGroupEl.id = 'sayobot-group';
        randomGroupEl.innerHTML = `
            <div class="map-group-header" onclick="loadSayobotRandom()" style="border-left-color: #3b82f6;">
                <div class="map-group-header-content">
                    <div style="font-weight:700; font-size:18px; color:#fff;">获取 Sayobot 谱面</div>
                    <div style="font-size:12px; color:#aaa; margin-top:2px;">从网络获取10张随机谱面</div>
                </div>
            </div>
            <div class="map-diff-list" id="sayobot-diff-list" style="grid-template-rows: 0fr;">
                <div class="map-diff-list-inner" id="sayobot-list-inner"></div>
            </div>
        `;
        list.appendChild(randomGroupEl);
    }

    if (groupArray.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = "color:#aaa; text-align:center; padding: 50px;";
        emptyMsg.innerHTML = filterDir ? '已过滤指定目录谱面，但未找到匹配项。' : '未找到匹配项。<br>请调整搜索条件或拖拽 .OSZ 文件导入。';
        list.appendChild(emptyMsg);
        return;
    }

    groupArray.forEach(g => {
        const key = g.key;
        const group = g.maps;
        group.sort((a,b) => (a.stars || getFakeStars(a.version)) - (b.stars || getFakeStars(b.version)));

        const groupEl = document.createElement('div');
        groupEl.className = 'map-group';
        
        const minStar = group[0].stars || getFakeStars(group[0].version);
        const maxStar = group[group.length - 1].stars || getFakeStars(group[group.length - 1].version);
        const starRangeText = minStar.toFixed(2) === maxStar.toFixed(2) ? `${minStar.toFixed(2)} ★` : `${minStar.toFixed(2)} ★ - ${maxStar.toFixed(2)} ★`;
        const isFav = favorites.includes(g.dirPath);

        const header = document.createElement('div');
        header.className = 'map-group-header';
        header.setAttribute('data-key', key); 
        
        if(group[0].bgPath) { header.setAttribute('data-bg', `${LOCAL_API_URL}/file?path=${encodeURIComponent(group[0].bgPath)}`); bgObserver.observe(header); }

        header.innerHTML = `
            <div class="map-group-header-content">
                <div style="font-weight:700; font-size:18px; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">${isFav ? '<span class="fav-indicator">[收藏]</span> ' : ''}${group[0].title}</div>
                <div style="font-size:12px; color:#ccc; margin-top:2px; text-transform:uppercase;">${group[0].artist} // ${group.length} 个难度</div>
                <div style="font-size:13px; font-weight:700; margin-top:4px; color:${getStarColor(maxStar)};">${starRangeText} ${g.avgBpm > 0 ? ' // BPM: ' + Math.round(g.avgBpm) : ''}</div>
            </div>
        `;
        header.oncontextmenu = (e) => showContextMenu(e, g.dirPath);
        
        const diffList = document.createElement('div');
        diffList.className = 'map-diff-list';
        const diffListInner = document.createElement('div');
        diffListInner.className = 'map-diff-list-inner';

        group.forEach(bm => {
            const stars = bm.stars || getFakeStars(bm.version);
            const starColor = getStarColor(stars);
            const cs = bm.cs || 4;
            const diffItem = document.createElement('div');
            diffItem.className = 'map-diff-item';
            diffItem.setAttribute('data-id', bm.id);
            const grade = history[bm.id] || '';
            
            diffItem.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:12px; height:12px; border-radius:3px; background:${starColor}; box-shadow: 0 0 10px ${starColor};"></div>
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <div style="font-weight:600; color:#eee; font-size: 15px;"><span style="color:#fbbf24; font-weight:800; font-size:12px; margin-right:4px;">[${cs}K]</span>${bm.version}</div>
                        <div style="font-size:12px; color:${starColor}; font-weight:700;">${stars.toFixed(2)} ★</div>
                    </div>
                </div>
                <div class="map-grade ${grade ? 'color-'+grade.toLowerCase() : ''}">${grade}</div>
            `;
            diffItem.onclick = (e) => { e.stopPropagation(); selectMap(bm, diffItem); };
            diffItem.oncontextmenu = (e) => showContextMenu(e, g.dirPath);
            diffListInner.appendChild(diffItem);
        });

        diffList.appendChild(diffListInner);

        header.onclick = () => {
            const isExpanded = groupEl.classList.contains('expanded');
            document.querySelectorAll('.map-group').forEach(el => {
                el.classList.remove('expanded');
                if (el.querySelector('.map-diff-list')) el.querySelector('.map-diff-list').style.gridTemplateRows = '0fr';
            });
            if (!isExpanded) {
                groupEl.classList.add('expanded');
                diffList.style.gridTemplateRows = '1fr';
                const firstItem = diffListInner.querySelector('.map-diff-item');
                if (firstItem) { 
                    selectMap(group[0], firstItem); 
                    setTimeout(() => { firstItem.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 150); 
                }
            }
        };
        groupEl.appendChild(header); groupEl.appendChild(diffList); list.appendChild(groupEl);
    });
}

async function fetchLeaderboard(beatmapId) {
    const panel = document.getElementById('leaderboard-panel');
    const list = document.getElementById('leaderboard-list');
    if (!beatmapId) { panel.style.display = 'none'; currentLeaderboard = []; return; }
    list.innerHTML = '连接中...';
    panel.style.display = 'flex';
    try {
        const res = await fetch(`${REMOTE_API_URL}/scores/${beatmapId}`);
        const data = await res.json();
        currentLeaderboard = data.scores || [];
        currentLeaderboard.forEach(s => s._realScore = Math.max(Number(s.classic_total_score) || 0, Number(s.total_score) || 0, Number(s.score) || 0));
        currentLeaderboard.sort((a, b) => b._realScore - a._realScore);
        currentLeaderboard = currentLeaderboard.filter(s => s._realScore > 0);

        if (currentLeaderboard.length === 0) list.innerHTML = '<div style="color:#aaa">未找到记录。</div>';
        else {
            list.innerHTML = currentLeaderboard.slice(0, 50).map((s, i) => {
                return `<div class="leaderboard-item"><span>#${i+1} <b style="color:#60a5fa;">${s.user?.username || s.username || 'Unknown'}</b></span><span style="color:#fbbf24; font-weight:600;">${s._realScore.toLocaleString()}</span></div>`;
            }).join('');
        }
    } catch (e) { list.innerHTML = '<div style="color:#ef4444">连接失败</div>'; currentLeaderboard = []; }
}

async function fetchLocalLeaderboard(mapId) {
    const panel = document.getElementById('local-leaderboard-panel');
    const list = document.getElementById('local-leaderboard-list');
    if (!mapId) { panel.style.display = 'none'; currentLocalScores = []; return; }
    list.innerHTML = '正在读取本地数据...';
    panel.style.display = 'flex';
    try {
        const folderPath = localStorage.getItem('wm_folderPath');
        const res = await fetch(`${LOCAL_API_URL}/local_scores?folderPath=${encodeURIComponent(folderPath)}&mapId=${encodeURIComponent(mapId)}`);
        const data = await res.json();
        currentLocalScores = data.scores || [];
        if (currentLocalScores.length === 0) { list.innerHTML = '<div style="color:#aaa">暂无记录</div>'; } 
        else {
            list.innerHTML = currentLocalScores.map((s, i) => {
                const dateObj = new Date(s.date);
                const dateStr = `${dateObj.getMonth()+1}/${dateObj.getDate()} ${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
                return `
                <div class="leaderboard-item local-lb-item" style="cursor: pointer; transition: 0.2s;" onclick="playReplay('${s.id}')">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                        <span><span style="color:#aaa;font-size:12px;">#${i+1}</span> <b style="color:#34d399;">${s.player}</b> <span class="color-${s.grade.toLowerCase()}" style="margin-left:5px; font-weight:800; font-style:italic;">${s.grade}</span></span>
                        <span style="color:#aaa; font-size:11px;">${dateStr} | ACC: ${s.acc.toFixed(2)}% | 连击: ${s.combo}x</span>
                    </div>
                    <span style="color:#fbbf24; font-weight:700; font-size:15px;">${s.score.toLocaleString()}</span>
                </div>`;
            }).join('');
        }
    } catch (e) { list.innerHTML = '<div style="color:#ef4444">读取记录失败。</div>'; currentLocalScores = []; }
}

function playReplay(scoreId) {
    const scoreData = currentLocalScores.find(s => s.id === scoreId);
    if (!scoreData || !selectedMap) return;
    const screen = document.getElementById('select-screen');
    screen.classList.add('transitioning');
    let vol = previewAudio.volume;
    const fadeOut = setInterval(() => {
        if(vol > 0.05) { vol -= 0.05; previewAudio.volume = vol; }
        else { clearInterval(fadeOut); previewAudio.pause(); }
    }, 50);

    sessionStorage.setItem('webmania_multi', 'false');
    sessionStorage.setItem('webmania_current_map', JSON.stringify(selectedMap));
    sessionStorage.setItem('webmania_replay_data', JSON.stringify({ player: scoreData.player, events: scoreData.replay }));
    setTimeout(() => { window.location.href = 'game.html'; }, 1000);
}

async function selectMap(bm, element) {
    if (selectedMap && selectedMap.id === bm.id) { return startGame(); }
    document.querySelectorAll('.map-diff-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    selectedMap = bm;

    const csDisplay = bm.cs || 4;
    document.getElementById('info-title').innerText = bm.title;
    document.getElementById('info-artist').innerText = bm.artist;
    document.getElementById('info-version').innerText = `[${csDisplay}K] ${bm.version}`;
    const stars = bm.stars || getFakeStars(bm.version);
    document.getElementById('info-stars').innerText = `${stars.toFixed(2)} ★`;
    document.getElementById('info-stars').style.color = getStarColor(stars);

    if (bm.bgPath) {
        const newBgUrl = `url("${LOCAL_API_URL}/file?path=${encodeURIComponent(bm.bgPath)}")`;
        const oldBg = document.getElementById('select-bg');
        
        const currentBgStyle = oldBg ? oldBg.style.backgroundImage : '';
        if (!currentBgStyle.includes(encodeURIComponent(bm.bgPath))) {
            const selectScreen = document.getElementById('select-screen');
            
            const newBg = document.createElement('div');
            newBg.className = 'select-bg';
            newBg.style.backgroundImage = newBgUrl;
            newBg.style.opacity = 0;
            newBg.id = 'select-bg'; 
            
            if (oldBg) {
                oldBg.removeAttribute('id'); 
                selectScreen.insertBefore(newBg, oldBg.nextSibling);
            } else {
                selectScreen.insertBefore(newBg, selectScreen.firstChild);
            }
            
            void newBg.offsetWidth;
            newBg.style.opacity = 1;
            
            if (oldBg) {
                oldBg.style.opacity = 0;
                setTimeout(() => {
                    if (oldBg && oldBg.parentNode) {
                        oldBg.parentNode.removeChild(oldBg);
                    }
                }, 300);
            }
        }
    }

    fetchLeaderboard(bm.beatmapId);
    fetchLocalLeaderboard(bm.id);

    try {
        let osuText = parsedMapCache[bm.osuPath];
        if (!osuText) {
            const osuRes = await fetch(`${LOCAL_API_URL}/file?path=${encodeURIComponent(bm.osuPath)}`);
            osuText = await osuRes.text();
            parsedMapCache[bm.osuPath] = osuText;
        }
        const parsed = parseOsuFileLite(osuText);
        document.getElementById('stat-bpm').innerText = parsed.bpm;
        document.getElementById('stat-hp').innerText = parsed.hp;
        document.getElementById('stat-od').innerText = parsed.od; 
        document.getElementById('stat-notes').innerText = parsed.noteCount;
        document.getElementById('stat-holds').innerText = parsed.holdsCount || parsed.holdCount;
        document.getElementById('stat-keys').innerText = (parsed.cs || bm.cs || 4) + 'K';

        if (currentPreviewAudioPath !== bm.audioPath) {
            currentPreviewAudioPath = bm.audioPath;
            if (bm.audioPath) {
                previewAudio.pause();
                previewAudio.src = `${LOCAL_API_URL}/file?path=${encodeURIComponent(bm.audioPath)}`;
                previewAudio.loop = true; 
                if (userSettings.audioDevice && userSettings.audioDevice !== 'default') {
                    if (previewAudio.setSinkId) previewAudio.setSinkId(userSettings.audioDevice).catch(()=>{});
                }
                previewAudio.onloadedmetadata = () => {
                    if (parsed.previewTime > 0) previewAudio.currentTime = parsed.previewTime / 1000;
                    else if (previewAudio.duration) previewAudio.currentTime = previewAudio.duration / 3;
                };
                previewAudio.oncanplay = () => {
                    updatePreviewVolume(); 
                    const playPromise = previewAudio.play();
                    if (playPromise !== undefined) { playPromise.catch(e => {}); }
                    previewAudio.oncanplay = null;
                };
            } else previewAudio.pause();
        } else if (previewAudio.paused && bm.audioPath) {
            previewAudio.play().catch(e=>{});
        }
    } catch(e) {}
}

function parseOsuFileLite(osuText) {
    const lines = osuText.split(/\r?\n/);
    let section = '', bpm = 0, hp = 0, od = 5, cs = 4, previewTime = -1, noteCount = 0, holdCount = 0, beatLengths = [];
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('[')) { section = line; continue; }
        if (!line) continue;
        if (section === '[General]' && line.startsWith('PreviewTime:')) previewTime = parseInt(line.split(':')[1].trim());
        else if (section === '[Difficulty]') {
            if (line.startsWith('HPDrainRate:')) hp = parseFloat(line.split(':')[1].trim());
            if (line.startsWith('OverallDifficulty:')) od = parseFloat(line.split(':')[1].trim()); 
            if (line.startsWith('CircleSize:')) cs = parseFloat(line.split(':')[1].trim()); 
        }
        else if (section === '[TimingPoints]') { let parts = line.split(','); if (parts.length >= 2 && parseFloat(parts[1]) > 0) beatLengths.push(parseFloat(parts[1])); } 
        else if (section === '[HitObjects]') {
            const parts = line.split(',');
            if (parts.length >= 5) {
                const column = Math.floor(parseInt(parts[0]) * cs / 512);
                if (column >= 0 && column < cs) { if ((parseInt(parts[3]) & 128) !== 0) holdCount++; else noteCount++; }
            }
        }
    }
    if (beatLengths.length > 0) {
        let mainBL = beatLengths.sort((a,b) => beatLengths.filter(v => v===a).length - beatLengths.filter(v => v===b).length).pop();
        bpm = Math.round(60000 / mainBL);
    }
    return { bpm, hp, od, cs, previewTime, noteCount, holdCount };
}

function startGame() {
    if (!selectedMap) return; 
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('selector') === 'true') {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'select_map', map: selectedMap }, '*');
        }
        return;
    }
    const screen = document.getElementById('select-screen');
    screen.classList.add('transitioning');
    let vol = previewAudio.volume;
    const fadeOut = setInterval(() => {
        if(vol > 0.05) { vol -= 0.05; previewAudio.volume = vol; }
        else { clearInterval(fadeOut); previewAudio.pause(); }
    }, 50);

    sessionStorage.setItem('webmania_multi', 'false');
    sessionStorage.setItem('webmania_current_map', JSON.stringify(selectedMap));
    sessionStorage.setItem('webmania_current_leaderboard', JSON.stringify(currentLeaderboard));
    
    setTimeout(() => { window.location.href = 'game.html'; }, 1000); 
}