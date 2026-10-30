// /preload-webview.js
// 针对 osu! 网页与 Cloudflare Turnstile 验证环境的高级指纹伪装与反检测保护
// 借助 webFrame.executeJavaScriptInIsolatedWorld(0, ...) 将欺骗补丁直接注入主世界 (World 0)

const { webFrame } = require('electron');

const injectionCode = `
(function () {
    if (window.__wmn_cf_patched) return;
    window.__wmn_cf_patched = true;

    // 1. 原生函数字符串欺骗（防检测 toString 检查）
    const nativeToString = Function.prototype.toString;
    const customStringMap = new WeakMap();

    function makeNative(fn, name = '', isGetter = false) {
        if (typeof fn !== 'function') return fn;
        const str = isGetter
            ? 'function get ' + name + '() { [native code] }'
            : 'function ' + name + '() { [native code] }';
        customStringMap.set(fn, str);
        try {
            Object.defineProperty(fn, 'name', { value: name, configurable: true });
        } catch (e) {}
        return fn;
    }

    try {
        Function.prototype.toString = makeNative(function toString() {
            if (customStringMap.has(this)) {
                return customStringMap.get(this);
            }
            return nativeToString.call(this);
        }, 'toString');
    } catch (e) {}

    // 2. 深度重构 navigator.userAgentData，剥除 Electron 特征，补全标准 Chrome 客户端指纹
    try {
        const ua = navigator.userAgent || '';
        const chromeMatch = ua.match(/Chrome\\/([0-9\\.]+)/);
        const chromeFullVersion = chromeMatch ? chromeMatch[1] : '130.0.6723.44';
        const chromeMajor = chromeFullVersion.split('.')[0] || '130';

        const standardBrands = [
            { brand: 'Chromium', version: chromeMajor },
            { brand: 'Google Chrome', version: chromeMajor },
            { brand: 'Not?A_Brand', version: '99' }
        ];

        const standardFullVersionList = [
            { brand: 'Chromium', version: chromeFullVersion },
            { brand: 'Google Chrome', version: chromeFullVersion },
            { brand: 'Not?A_Brand', version: '99.0.0.0' }
        ];

        const mockUserAgentData = {
            brands: standardBrands,
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: makeNative(async function getHighEntropyValues(hints) {
                const data = {
                    architecture: 'x86',
                    bitness: '64',
                    brands: standardBrands,
                    formFactor: ['Desktop'],
                    fullVersionList: standardFullVersionList,
                    model: '',
                    mobile: false,
                    platform: 'Windows',
                    platformVersion: '15.0.0',
                    uaFullVersion: chromeFullVersion,
                    wow64: false
                };
                const res = {};
                if (Array.isArray(hints)) {
                    for (const h of hints) {
                        if (h in data) res[h] = data[h];
                    }
                }
                return res;
            }, 'getHighEntropyValues'),
            toJSON: makeNative(function toJSON() {
                return {
                    brands: this.brands,
                    mobile: this.mobile,
                    platform: this.platform
                };
            }, 'toJSON')
        };

        if (window.NavigatorUAData && window.NavigatorUAData.prototype) {
            try {
                Object.setPrototypeOf(mockUserAgentData, window.NavigatorUAData.prototype);
            } catch (e) {}
        }

        const navProto = Object.getPrototypeOf(navigator) || Navigator.prototype;
        Object.defineProperty(navProto, 'userAgentData', {
            get: makeNative(function userAgentData() {
                return mockUserAgentData;
            }, 'userAgentData', true),
            set: undefined,
            enumerable: true,
            configurable: true
        });
    } catch (e) {}

    // 3. 原生抹除 navigator.webdriver（保持 Blink 原生未自动化状态）
    try {
        if (Object.prototype.hasOwnProperty.call(navigator, 'webdriver')) {
            try { delete navigator.webdriver; } catch (e) {}
        }
        if (navigator.webdriver === true) {
            const navProto = Object.getPrototypeOf(navigator) || Navigator.prototype;
            Object.defineProperty(navProto, 'webdriver', {
                get: makeNative(function webdriver() {
                    return false;
                }, 'webdriver', true),
                set: undefined,
                enumerable: true,
                configurable: true
            });
        }
    } catch (e) {}

    // 4. 补齐原生桌面 Chrome 的 window.chrome 属性及原生方法
    try {
        if (!window.chrome) {
            window.chrome = {};
        }
        if (!window.chrome.app) {
            window.chrome.app = {
                isInstalled: false,
                InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
                RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
            };
        }
        if (!window.chrome.csi) {
            window.chrome.csi = makeNative(function csi() {
                return {
                    startE: performance.timeOrigin,
                    onloadT: performance.timeOrigin + 50,
                    pageT: 100,
                    tran: 15
                };
            }, 'csi');
        }
        if (!window.chrome.loadTimes) {
            window.chrome.loadTimes = makeNative(function loadTimes() {
                return {
                    requestTime: performance.timeOrigin / 1000,
                    startLoadTime: performance.timeOrigin / 1000,
                    commitLoadTime: performance.timeOrigin / 1000,
                    finishDocumentLoadTime: performance.timeOrigin / 1000,
                    firstPaintTime: performance.timeOrigin / 1000,
                    finishLoadTime: performance.timeOrigin / 1000,
                    wasFetchedViaSpdy: true,
                    wasNpnNegotiated: true,
                    npnNegotiatedProtocol: 'h2',
                    connectionInfo: 'h2'
                };
            }, 'loadTimes');
        }
    } catch (e) {}

    // 5. 确保正常桌面语言列表
    try {
        if (!navigator.languages || navigator.languages.length === 0) {
            const navProto = Object.getPrototypeOf(navigator) || Navigator.prototype;
            Object.defineProperty(navProto, 'languages', {
                get: makeNative(function languages() {
                    return ['zh-CN', 'zh', 'en-US', 'en'];
                }, 'languages', true),
                enumerable: true,
                configurable: true
            });
        }
    } catch (e) {}
})();
`;

try {
    webFrame.executeJavaScriptInIsolatedWorld(0, [{ code: injectionCode }]);
} catch (e) {
    try {
        webFrame.executeJavaScript(injectionCode);
    } catch (err) {}
}
