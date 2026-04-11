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

class OsuRangeSlider {
    constructor(containerId, options) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        this.labelKey = options.labelKey;
        this.min = options.min || 0;
        this.max = options.max || 10;
        this.minValue = options.minValue !== undefined ? options.minValue : this.min;
        this.maxValue = options.maxValue !== undefined ? options.maxValue : this.max;
        this.onChange = options.onChange;
        this.formatter = options.formatter || ((min, max) => `${min} - ${max}`);
        this.step = options.step || 0.1;

        this.activeThumb = null;

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
                        <div class="slider-fill" style="border-radius: 0;"></div>
                        <div class="slider-thumb thumb-left"></div>
                        <div class="slider-thumb thumb-right"></div>
                    </div>
                </div>
            </div>
        `;
        this.wrapper = this.container.querySelector('.osu-slider-wrapper');
        this.valDisplay = this.container.querySelector('.slider-value');
        this.track = this.container.querySelector('.slider-track');
        this.fill = this.container.querySelector('.slider-fill');
        this.thumbLeft = this.container.querySelector('.thumb-left');
        this.thumbRight = this.container.querySelector('.thumb-right');
    }

    setValues(minVal, maxVal, triggerOnChange = true) {
        let newMin = Math.max(this.min, Math.min(this.max, minVal));
        let newMax = Math.max(this.min, Math.min(this.max, maxVal));
        
        if (newMin > newMax) {
            if (this.activeThumb === 'left') newMin = newMax;
            else newMax = newMin;
        }

        if (this.step && this.step !== 1) {
            const inv = 1.0 / this.step;
            newMin = Math.round(newMin * inv) / inv;
            newMax = Math.round(newMax * inv) / inv;
        } else {
            newMin = Math.round(newMin);
            newMax = Math.round(newMax);
        }

        const changed = (this.minValue !== newMin || this.maxValue !== newMax);

        if (changed) {
            this.minValue = newMin;
            this.maxValue = newMax;
            if (triggerOnChange && this.onChange) this.onChange(this.minValue, this.maxValue);
        }
        this.updateVisuals();
    }

    updateVisuals() {
        let leftPercent = ((this.minValue - this.min) / (this.max - this.min)) * 100;
        let rightPercent = ((this.maxValue - this.min) / (this.max - this.min)) * 100;
        
        leftPercent = Math.max(0, Math.min(100, leftPercent));
        rightPercent = Math.max(0, Math.min(100, rightPercent));

        this.fill.style.left = `${leftPercent}%`;
        this.fill.style.width = `${rightPercent - leftPercent}%`;
        
        this.thumbLeft.style.left = `${leftPercent}%`;
        this.thumbRight.style.left = `${rightPercent}%`;

        this.valDisplay.innerText = this.formatter(this.minValue, this.maxValue);
    }

    updateFromEvent(e) {
        const rect = this.track.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        const val = percent * (this.max - this.min) + this.min;

        if (this.activeThumb === 'left') {
            this.setValues(val, this.maxValue, false);
        } else if (this.activeThumb === 'right') {
            this.setValues(this.minValue, val, false);
        } else {
            const distLeft = Math.abs(val - this.minValue);
            const distRight = Math.abs(val - this.maxValue);
            if (distLeft < distRight) {
                this.activeThumb = 'left';
                this.setValues(val, this.maxValue, false);
            } else {
                this.activeThumb = 'right';
                this.setValues(this.minValue, val, false);
            }
        }
    }

    attachEvents() {
        this.track.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.track.setPointerCapture(e.pointerId);
            
            const rect = this.track.getBoundingClientRect();
            let percent = (e.clientX - rect.left) / rect.width;
            const val = percent * (this.max - this.min) + this.min;

            const distLeft = Math.abs(val - this.minValue);
            const distRight = Math.abs(val - this.maxValue);
            
            if (distLeft <= distRight) {
                this.activeThumb = 'left';
            } else {
                this.activeThumb = 'right';
            }

            this.updateFromEvent(e);
            this.wrapper.focus();
        });

        this.track.addEventListener('pointermove', (e) => {
            if (this.activeThumb) this.updateFromEvent(e);
        });

        const endDrag = (e) => {
            if (this.activeThumb) {
                this.activeThumb = null;
                this.track.releasePointerCapture(e.pointerId);
                if (this.onChange) this.onChange(this.minValue, this.maxValue);
            }
        };
        this.track.addEventListener('pointerup', endDrag);
        this.track.addEventListener('pointercancel', endDrag);
    }
    
    getValues() {
        return { min: this.minValue, max: this.maxValue };
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

class OsuDropdown {
    constructor(containerId, options) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        this.labelKey = options.labelKey;
        this.optionsData = options.options || []; 
        this.defaultValue = options.defaultValue;
        this.value = options.value !== undefined ? options.value : this.defaultValue;
        this.onChange = options.onChange;
        this.isOpen = false;

        this.buildDOM();
        this.attachEvents();
        this.updateVisuals();
    }

    buildDOM() {
        const lang = userSettings.language || 'zh';
        const translatedLabel = (i18nDict[lang] && i18nDict[lang][this.labelKey]) ? i18nDict[lang][this.labelKey] : this.labelKey;
        
        this.container.innerHTML = `
            <div class="osu-dropdown-wrapper" tabindex="0">
                <div class="osu-dropdown-container">
                    <div class="osu-dropdown-main">
                        <div class="dropdown-left">
                            <span class="dropdown-label" data-i18n="${this.labelKey}">${translatedLabel}</span>
                            <span class="dropdown-value" id="${this.container.id}-val-disp"></span>
                        </div>
                        <div class="dropdown-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                        </div>
                    </div>
                    <div class="dropdown-list-wrapper">
                        <div class="dropdown-list-inner"></div>
                    </div>
                </div>
                <div class="dropdown-reset slider-reset">
                    <button class="slider-reset-btn" title="重置为默认值">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                </div>
            </div>
        `;
        this.wrapper = this.container.querySelector('.osu-dropdown-wrapper');
        this.main = this.container.querySelector('.osu-dropdown-main');
        this.listWrapper = this.container.querySelector('.dropdown-list-wrapper');
        this.listInner = this.container.querySelector('.dropdown-list-inner');
        this.valDisplay = this.container.querySelector('.dropdown-value');
        this.icon = this.container.querySelector('.dropdown-icon');
        this.resetContainer = this.container.querySelector('.dropdown-reset');
        this.resetBtn = this.container.querySelector('.slider-reset-btn');
        
        this.renderOptionsList();
    }

    renderOptionsList() {
        this.listInner.innerHTML = '';
        this.optionsData.forEach(opt => {
            const el = document.createElement('div');
            el.className = `dropdown-option ${this.value === opt.value ? 'selected' : ''}`;
            const i18nAttr = opt.i18n ? `data-i18n="${opt.i18n}"` : '';
            el.innerHTML = `
                <div class="dropdown-option-arrow">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                </div>
                <span style="z-index:10;" ${i18nAttr}>${opt.label}</span>
            `;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setValue(opt.value);
                this.setOpen(false);
            });
            this.listInner.appendChild(el);
        });
        
        if (typeof applyTranslations === 'function') applyTranslations();
    }

    updateOptions(newOptions) {
        this.optionsData = newOptions;
        this.renderOptionsList();
        this.updateVisuals();
    }

    setValue(val, triggerOnChange = true) {
        if (this.value !== val) {
            this.value = val;
            if (triggerOnChange) this.onChange(this.value);
            this.renderOptionsList(); 
        }
        this.updateVisuals();
    }

    setOpen(state) {
        this.isOpen = state;
        if (state) {
            Object.values(window.osuDropdowns || {}).forEach(d => { if(d !== this) d.setOpen(false); });
            this.main.classList.add('open');
            this.listWrapper.classList.add('open');
            this.icon.classList.add('open');
        } else {
            this.main.classList.remove('open');
            this.listWrapper.classList.remove('open');
            this.icon.classList.remove('open');
        }
    }

    updateVisuals() {
        const currentOpt = this.optionsData.find(o => o.value === this.value) || this.optionsData[0] || { label: 'Unknown' };
        
        if (currentOpt.i18n) {
            this.valDisplay.setAttribute('data-i18n', currentOpt.i18n);
        } else {
            this.valDisplay.removeAttribute('data-i18n');
        }
        this.valDisplay.innerText = currentOpt.label;

        if (this.value !== this.defaultValue) {
            this.resetContainer.classList.add('show');
        } else {
            this.resetContainer.classList.remove('show');
        }
        if (typeof applyTranslations === 'function') applyTranslations();
    }

    attachEvents() {
        this.main.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setOpen(!this.isOpen);
        });

        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.container.contains(e.target)) {
                this.setOpen(false);
            }
        });

        this.wrapper.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.setOpen(!this.isOpen);
            } else if (e.key === 'Escape' && this.isOpen) {
                e.preventDefault();
                this.setOpen(false);
            }
        });

        this.resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setValue(this.defaultValue);
            this.setOpen(false);
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
    const skipSetup = localStorage.getItem('wm_skip_setup') === 'true';
    if (skipSetup) {
        const selScreen = document.getElementById('select-screen');
        if (selScreen) selScreen.classList.add('active');
    } else {
        const setupScreen = document.getElementById('setup-screen');
        if (setupScreen) setupScreen.classList.add('active');
    }

    if (typeof applyTranslations === 'function') applyTranslations();
    applyUIScale(); 

    window.osuDropdowns = window.osuDropdowns || {};
    
    const savedSortField = sessionStorage.getItem('wm_sortField') || 'title';
    window.osuDropdowns['sortField'] = new OsuDropdown('dropdown-sort-field', {
        labelKey: '排序方式',
        options: [
            { value: 'title', label: '标题 (A-Z)', i18n: 'sort_title' },
            { value: 'artist', label: '艺术家 (A-Z)', i18n: 'sort_artist' },
            { value: 'stars', label: '难度', i18n: 'sort_diff' },
            { value: 'bpm', label: 'BPM', i18n: 'sort_bpm' }
        ],
        defaultValue: 'title',
        value: savedSortField,
        onChange: (val) => { sessionStorage.setItem('wm_sortField', val); renderMapList(); }
    });

    const savedSortDir = sessionStorage.getItem('wm_sortDir') || 'asc';
    window.osuDropdowns['sortDir'] = new OsuDropdown('dropdown-sort-dir', {
        labelKey: '顺序',
        options: [
            { value: 'asc', label: '升序', i18n: 'sort_asc' },
            { value: 'desc', label: '降序', i18n: 'sort_desc' }
        ],
        defaultValue: 'asc',
        value: savedSortDir,
        onChange: (val) => { sessionStorage.setItem('wm_sortDir', val); renderMapList(); }
    });

    const keysOpts = [{ value: 'ALL', label: '全部 (ALL)' }];
    for(let i=1; i<=18; i++) keysOpts.push({ value: i.toString(), label: `${i}K` });

    const savedFilterKeys = sessionStorage.getItem('wm_filterKeys') || 'ALL';
    window.osuDropdowns['filterKeys'] = new OsuDropdown('dropdown-filter-keys', {
        labelKey: '模式筛选',
        options: keysOpts,
        defaultValue: 'ALL',
        value: savedFilterKeys,
        onChange: (val) => { sessionStorage.setItem('wm_filterKeys', val); renderMapList(); }
    });

    window.osuRangeSliders = window.osuRangeSliders || {};
    const savedDiffMin = parseFloat(sessionStorage.getItem('wm_diffMin')) || 0;
    const savedDiffMax = sessionStorage.getItem('wm_diffMax') !== null ? parseFloat(sessionStorage.getItem('wm_diffMax')) : 10;
    window.osuRangeSliders['diffRange'] = new OsuRangeSlider('slider-diff-range', {
        labelKey: '难度范围 (Stars)',
        min: 0,
        max: 10,
        step: 0.1,
        minValue: savedDiffMin,
        maxValue: savedDiffMax,
        formatter: (min, max) => `${min.toFixed(1)} ★ - ${max.toFixed(1)} ★`,
        onChange: (min, max) => { 
            sessionStorage.setItem('wm_diffMin', min); 
            sessionStorage.setItem('wm_diffMax', max); 
            renderMapList(); 
        }
    });

    window.isStartingGame = false;

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

    if (savedPath) {
        if (skipSetup) {
            const list = document.getElementById('map-list');
            if (list) list.innerHTML = '<div style="color:#60a5fa; text-align:center; padding: 50px; font-weight: 600;">正在加载缓存数据...</div>';
        }
        const status = document.getElementById('scan-status');
        if (status) status.innerText = '正在初始化扫描...';
        doScan(false); 
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = sessionStorage.getItem('wm_search') || '';
        searchInput.addEventListener('input', (e) => {
            sessionStorage.setItem('wm_search', e.target.value);
            handleSearchInput();
        });
    }

    initSettingsUI();
    populateAudioDevices();
});

window.addEventListener('pageshow', (e) => {
    window.isStartingGame = false;
    const overlay = document.getElementById('transcode-overlay');
    if (overlay) overlay.style.display = 'none';
    const selectScreen = document.getElementById('select-screen');
    if (selectScreen) selectScreen.classList.remove('transitioning');
    
    if (previewAudio && previewAudio.paused && selectedMap && selectedMap.audioPath) {
        previewAudio.play().catch(()=>{});
    }
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
                if (prop === 'language' && typeof applyTranslations === 'function') applyTranslations();
                if (onChange) onChange();
            });
        }
    };

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
    initSlider('slider-sensitivity', 'sensitivity', '光标灵敏度', 0.1, 10.0, 0.1, 1.0, v => v.toFixed(1) + 'x');

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
    initToggle('toggle-highPrecision', 'highPrecision', '高精度鼠标', false);
    initToggle('toggle-disableWheel', 'disableWheel', '在游戏中禁用鼠标滚轮调整音量', false);
    initToggle('toggle-disableClick', 'disableClick', '在游戏中禁用鼠标点击', false);
    initToggle('toggle-hitErrorMeter', 'hitErrorMeter', 'hit_error', true);
    initToggle('toggle-noStoryboard', 'noStoryboard', 'no_sb', false);
    initToggle('toggle-autoOffset', 'autoOffset', 'auto_offset', false);
    initToggle('toggle-autoKiosk', 'autoKiosk', 'auto_kiosk', false);
    initToggle('toggle-desync', 'desync', 'desync', false);
    initToggle('toggle-showFps', 'showFps', 'show_fps', true);
    initToggle('toggle-hwAccel', 'hwAccel', 'hw_accel', false);
    initToggle('toggle-enableHitSounds', 'enableHitSounds', 'enable_hitsounds', true);

    window.osuDropdowns = window.osuDropdowns || {};
    const initDropdown = (id, prop, labelKey, opts, defVal, onChangeExtra) => {
        if(!document.getElementById(id)) return;
        window.osuDropdowns[prop] = new OsuDropdown(id, {
            labelKey: labelKey,
            options: opts,
            defaultValue: defVal,
            value: userSettings[prop] !== undefined ? userSettings[prop] : defVal,
            onChange: (val) => {
                userSettings[prop] = val;
                saveSettings();
                if (prop === 'renderer' || prop === 'fpsLimit' || prop === 'threadMode') saveSysConfig();
                if (prop === 'language' && typeof applyTranslations === 'function') applyTranslations();
                if (onChangeExtra) onChangeExtra(val);
            }
        });
    };

    initDropdown('dropdown-language', 'language', 'language', [
        { value: 'zh', label: '简体中文' },
        { value: 'en', label: 'English' }
    ], 'zh');

    initDropdown('dropdown-confineCursor', 'confineCursor', '将光标限制在窗口内', [
        { value: 'never', label: '不限制' },
        { value: 'play', label: '仅在游玩时限制' },
        { value: 'always', label: '总是限制' }
    ], 'never');

    const keysOpts = [];
    for(let i=1; i<=18; i++) keysOpts.push({ value: i.toString(), label: `${i}K` });
    initDropdown('dropdown-skinKeys', 'skinKeys', 'track_keys', keysOpts, '4', (val) => renderSkinColors(parseInt(val)));
    
    if (!userSettings.skinKeys) userSettings.skinKeys = '4';
    renderSkinColors(parseInt(userSettings.skinKeys));

    initDropdown('dropdown-renderer', 'renderer', 'renderer', [
        { value: 'default', label: '默认', i18n: 'rend_default' },
        { value: 'd3d12', label: 'DirectX 12' },
        { value: 'd3d11', label: 'DirectX 11' },
        { value: 'graphite', label: 'Graphite (Skia)' }
    ], 'default');

    initDropdown('dropdown-fpsLimit', 'fpsLimit', 'fps_limit', [
        { value: 'vsync', label: 'VSync' },
        { value: '2x', label: '2x refresh rate' },
        { value: '4x', label: '4x refresh rate' },
        { value: '8x', label: '8x refresh rate' },
        { value: 'unlimited', label: '无限制', i18n: 'unlimited' }
    ], 'vsync');

    initDropdown('dropdown-threadMode', 'threadMode', 'thread_mode', [
        { value: 'single', label: '单线程', i18n: 'single_thread' },
        { value: 'multi', label: '多线程', i18n: 'multi_thread' }
    ], 'single');

    initDropdown('dropdown-audioDevice', 'audioDevice', 'device', [
        { value: 'default', label: 'Default / 默认' }
    ], 'default');

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
        if (typeof applyTranslations === 'function') applyTranslations();
    }
    doScan(true);
};

async function populateAudioDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        
        const opts = [{ value: 'default', label: 'Default / 默认' }];
        outputs.forEach(d => {
            opts.push({ value: d.deviceId, label: d.label || 'Unknown Device' });
        });
        
        if (window.osuDropdowns && window.osuDropdowns['audioDevice']) {
            window.osuDropdowns['audioDevice'].updateOptions(opts);
        }
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
    const sortField = window.osuDropdowns && window.osuDropdowns['sortField'] ? window.osuDropdowns['sortField'].value : 'title';
    const sortDir = window.osuDropdowns && window.osuDropdowns['sortDir'] ? window.osuDropdowns['sortDir'].value : 'asc';
    const filterKey = window.osuDropdowns && window.osuDropdowns['filterKeys'] ? window.osuDropdowns['filterKeys'].value : 'ALL';
    const diffRange = window.osuRangeSliders && window.osuRangeSliders['diffRange'] ? window.osuRangeSliders['diffRange'].getValues() : { min: 0, max: 10 };

    let groupArray = Object.keys(mapGroups).map(key => {
        let maps = mapGroups[key];

        maps = maps.filter(m => {
            const stars = m.stars || getFakeStars(m.version);
            const cs = m.cs || 4;
            if (filterKey !== 'ALL' && cs !== parseInt(filterKey)) return false;
            if (stars < diffRange.min || stars > diffRange.max) return false;
            return true;
        });

        if (maps.length === 0) return null;

        return {
            key: key, maps: maps, title: maps[0].title.toLowerCase(), artist: maps[0].artist.toLowerCase(),
            maxStars: Math.max(...maps.map(m => m.stars || getFakeStars(m.version))),
            avgBpm: maps.reduce((sum, m) => sum + (m.bpm || 0), 0) / maps.length,
            dirPath: maps[0].dirPath
        };
    }).filter(g => g !== null);

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

    if (!isSelector && !searchTerm && !filterDir && filterKey === 'ALL' && diffRange.min === 0 && diffRange.max === 10) {
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
    let section = '', bpm = 0, hp = 0, od = 5, cs = 4, previewTime = -1, noteCount = 0, holdCount = 0, beatLengths = [], videoPath = null;
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
        else if (section === '[Events]') {
            const parts = line.split(',');
            if (parts[0] === 'Video' || parts[0] === '1') {
                if (parts.length >= 3) {
                    videoPath = parts[2].replace(/"/g, '').trim();
                }
            }
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
    return { bpm, hp, od, cs, previewTime, noteCount, holdCount, videoPath };
}

async function startGame() {
    if (!selectedMap || window.isStartingGame) return; 
    window.isStartingGame = true;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('selector') === 'true') {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'select_map', map: selectedMap }, '*');
        }
        window.isStartingGame = false;
        return;
    }

    let needsTranscode = false;
    let fullVideoPath = null;
    let cachedVideoPath = null;

    if (userSettings.noStoryboard !== true) {
        const osuText = parsedMapCache[selectedMap.osuPath];
        if (osuText) {
            const parsed = parseOsuFileLite(osuText);
            if (parsed.videoPath) {
                fullVideoPath = selectedMap.dirPath + '/' + parsed.videoPath.trim();
                if (fullVideoPath.toLowerCase().endsWith('.avi')) {
                    try {
                        const checkRes = await fetch(`${LOCAL_API_URL}/check_video_cache?path=${encodeURIComponent(fullVideoPath)}`);
                        const checkData = await checkRes.json();
                        if (checkData.cached) cachedVideoPath = checkData.cachedPath;
                        else needsTranscode = true;
                    } catch(e) {}
                }
            }
        }
    }

    const screen = document.getElementById('select-screen');
    screen.classList.add('transitioning');
    let vol = previewAudio.volume;
    const fadeOut = setInterval(() => {
        if(vol > 0.05) { vol -= 0.05; previewAudio.volume = vol; }
        else { clearInterval(fadeOut); previewAudio.pause(); }
    }, 50);

    if (needsTranscode) {
        const overlay = document.getElementById('transcode-overlay');
        overlay.style.display = 'block';
        const bar = document.getElementById('transcode-progress');
        const text = document.getElementById('transcode-text');

        try {
            const { createFFmpeg } = FFmpeg;
            if (!window.ffmpegInstance) {
                text.innerText = "加载核心组件...";
                window.ffmpegInstance = createFFmpeg({ log: true });
                window.ffmpegInstance.setProgress(({ ratio }) => {
                    const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
                    bar.style.width = percent + '%';
                    text.innerText = `为提供更极致流畅的体验，正在永久转换老旧视频格式 (${percent}%)`;
                });
                await window.ffmpegInstance.load();
            }

            text.innerText = "正在读取源视频...";
            const videoUrl = `${LOCAL_API_URL}/file?path=${encodeURIComponent(fullVideoPath)}`;
            const aviResponse = await fetch(videoUrl);
            if (!aviResponse.ok) throw new Error("获取视频文件失败");
            const aviBuffer = await aviResponse.arrayBuffer();
            
            text.innerText = "正在转换格式... (此操作仅当前谱面进行一次)";
            window.ffmpegInstance.FS('writeFile', 'input.avi', new Uint8Array(aviBuffer));
            await window.ffmpegInstance.run('-i', 'input.avi', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', 'output.mp4');
            
            text.innerText = "正在将其写入系统缓存以供下次秒开...";
            const data = window.ffmpegInstance.FS('readFile', 'output.mp4');
            const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
            
            const fd = new FormData();
            fd.append('video', mp4Blob, 'output.mp4');
            fd.append('originalPath', fullVideoPath);
            const uploadRes = await fetch(`${LOCAL_API_URL}/cache_video`, { method: 'POST', body: fd });
            const uploadData = await uploadRes.json();
            if (uploadData.success) cachedVideoPath = uploadData.cachedPath;

            window.ffmpegInstance.FS('unlink', 'input.avi');
            window.ffmpegInstance.FS('unlink', 'output.mp4');

        } catch (err) {
            console.error("转码环节发生异常:", err);
        } finally {
            setTimeout(() => { finishStartGame(cachedVideoPath); }, 500);
        }
    } else {
        setTimeout(() => { finishStartGame(cachedVideoPath); }, 1000); 
    }
}

function finishStartGame(cachedVideoPath) {
    sessionStorage.setItem('webmania_multi', 'false');
    sessionStorage.setItem('webmania_current_map', JSON.stringify(selectedMap));
    sessionStorage.setItem('webmania_current_leaderboard', JSON.stringify(currentLeaderboard));
    if (cachedVideoPath) {
        sessionStorage.setItem('webmania_cached_video', cachedVideoPath);
    } else {
        sessionStorage.removeItem('webmania_cached_video');
    }
    window.location.href = 'game.html';
}