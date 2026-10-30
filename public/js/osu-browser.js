// /public/js/osu-browser.js
// 嵌入式 osu! 原生风格浏览器与下载拦截管理器

(function () {
    let container = null;
    let btnBack = null;
    let btnForward = null;
    let btnRefresh = null;
    let btnHome = null;
    let addressInput = null;
    let btnCopyUrl = null;
    let btnDownloads = null;
    let badgeDownloads = null;
    let btnClose = null;
    let loadingBar = null;
    let downloadsPanel = null;
    let downloadsList = null;
    let btnClearDownloads = null;

    // 所有拦截到的下载任务
    const downloadTasks = new Map();

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
    }

    function isBrowserVisible() {
        return container && container.classList.contains('active');
    }

    function getEffectiveTopOffset() {
        const header = document.querySelector('.osu-browser-header');
        const h = header ? header.offsetHeight : 48;
        let panelHeight = 0;
        if (downloadsPanel && downloadsPanel.style.display === 'flex') {
            panelHeight = downloadsPanel.offsetHeight;
        }
        return h + panelHeight;
    }

    function syncOsuViewBounds() {
        if (!isBrowserVisible()) return;
        if (window.electronAPI && window.electronAPI.updateOsuViewBounds) {
            window.electronAPI.updateOsuViewBounds(getEffectiveTopOffset());
        }
    }

    function toggleOsuBrowser(forceState) {
        if (!container) container = document.getElementById('osu-browser-container');
        if (!container) return;
        const shouldShow = forceState !== undefined ? forceState : !container.classList.contains('active');

        if (shouldShow) {
            // 打开独立浏览器时退出高精度鼠标指针锁定，确保 Cloudflare 与网页正常点击
            if (document.pointerLockElement) {
                try { document.exitPointerLock(); } catch (e) {}
            }
            if (window.mouseManager && window.mouseManager.onSettingsChange) window.mouseManager.onSettingsChange();
            if (window.electronAPI && window.electronAPI.setOsuViewVisible) {
                container.classList.add('active');
                window.electronAPI.setOsuViewVisible(true, getEffectiveTopOffset());
            } else {
                window.open('https://osu.ppy.sh/beatmapsets', '_blank');
                if (typeof showToast === 'function') {
                    showToast('已在新窗口打开 osu! 谱面库', 'info', 3000);
                }
            }
        } else {
            container.classList.remove('active');
            if (downloadsPanel) downloadsPanel.style.display = 'none';
            if (window.electronAPI && window.electronAPI.setOsuViewVisible) {
                window.electronAPI.setOsuViewVisible(false, 48);
            }
        }
    }

    function toggleDownloadsPanel(forceState) {
        if (!downloadsPanel) return;
        const isShown = downloadsPanel.style.display === 'flex';
        const nextState = forceState !== undefined ? forceState : !isShown;
        downloadsPanel.style.display = nextState ? 'flex' : 'none';
        requestAnimationFrame(() => syncOsuViewBounds());
    }

    function updateBadge() {
        if (!badgeDownloads) return;
        let activeCount = 0;
        downloadTasks.forEach(task => {
            if (task.state === 'downloading' || task.state === 'importing') activeCount++;
        });

        if (activeCount > 0) {
            badgeDownloads.textContent = activeCount;
            badgeDownloads.style.display = 'inline-block';
            badgeDownloads.classList.add('pulsing');
        } else {
            badgeDownloads.textContent = '0';
            badgeDownloads.style.display = 'none';
            badgeDownloads.classList.remove('pulsing');
        }
    }

    function renderDownloadsList() {
        if (!downloadsList) return;
        if (downloadTasks.size === 0) {
            downloadsList.innerHTML = `
                <div class="wb-dl-empty">
                    暂无下载任务<br>
                    <span style="font-size:12px;color:#64748b;margin-top:4px;display:inline-block;">在 osu! 网页点击谱面“下载”后将自动在此劫持并安装</span>
                </div>
            `;
            return;
        }

        const taskArray = Array.from(downloadTasks.values()).reverse();
        downloadsList.innerHTML = '';

        taskArray.forEach(task => {
            const item = document.createElement('div');
            item.className = 'wb-dl-item';
            item.id = `wb-task-${task.id}`;

            let statusText = '';
            let fillClass = '';
            let actionBtnHtml = '';

            if (task.state === 'downloading') {
                const totalStr = task.totalBytes > 0 ? formatBytes(task.totalBytes) : '未知大小';
                const recStr = formatBytes(task.receivedBytes);
                statusText = `正在下载 (${task.percent}%) • ${recStr} / ${totalStr}`;
                fillClass = '';
                actionBtnHtml = `<button class="wb-dl-action-btn cancel" onclick="window.osuBrowserModule.cancelDownload('${task.id}')">取消</button>`;
            } else if (task.state === 'importing') {
                statusText = `正在解析并自动导入游戏曲库...`;
                fillClass = 'importing';
            } else if (task.state === 'completed') {
                const diffCountStr = task.count ? ` (共 ${task.count} 个难度)` : '';
                statusText = `✅ 已成功导入${diffCountStr}`;
                fillClass = 'success';
                if (task.dirPath) {
                    actionBtnHtml = `<button class="wb-dl-action-btn view" onclick="window.osuBrowserModule.locateBeatmap('${encodeURIComponent(task.dirPath)}')">在曲库中查看</button>`;
                }
            } else if (task.state === 'interrupted' || task.state === 'error') {
                statusText = `❌ ${task.error || '下载失败'}`;
                fillClass = 'error';
            } else if (task.state === 'cancelled') {
                statusText = `⚠️ 已取消下载`;
                fillClass = 'error';
            }

            const title = task.title || task.filename.replace(/\.osz$/i, '');

            item.innerHTML = `
                <div class="wb-dl-title-row">
                    <div class="wb-dl-title" title="${task.filename}">🎵 ${title}</div>
                    <div>${actionBtnHtml}</div>
                </div>
                <div class="wb-dl-status-row">
                    <span>${statusText}</span>
                    <span>${task.percent}%</span>
                </div>
                <div class="wb-dl-progress-track">
                    <div class="wb-dl-progress-fill ${fillClass}" style="width: ${task.percent}%;"></div>
                </div>
            `;

            downloadsList.appendChild(item);
        });
        if (downloadsPanel && downloadsPanel.style.display === 'flex') {
            requestAnimationFrame(() => syncOsuViewBounds());
        }
    }

    function updateSingleTaskDOM(task) {
        const item = document.getElementById(`wb-task-${task.id}`);
        if (!item) {
            renderDownloadsList();
            return;
        }

        const fill = item.querySelector('.wb-dl-progress-fill');
        const statusSpan = item.querySelector('.wb-dl-status-row span:first-child');
        const percentSpan = item.querySelector('.wb-dl-status-row span:last-child');

        if (fill) fill.style.width = `${task.percent}%`;
        if (percentSpan) percentSpan.textContent = `${task.percent}%`;

        if (task.state === 'downloading' && statusSpan) {
            const totalStr = task.totalBytes > 0 ? formatBytes(task.totalBytes) : '未知大小';
            const recStr = formatBytes(task.receivedBytes);
            statusSpan.textContent = `正在下载 (${task.percent}%) • ${recStr} / ${totalStr}`;
        }
    }

    async function handleAutoImport(task) {
        task.state = 'importing';
        task.percent = 100;
        updateBadge();
        renderDownloadsList();

        const folderPath = localStorage.getItem('wm_folderPath');
        if (!folderPath) {
            task.state = 'error';
            task.error = '未配置 osu! Songs 目录，请先在常规设置中配置！';
            if (typeof showToast === 'function') {
                showToast('未检测到 Songs 目录，谱面暂存待配置', 'error', 4500);
            }
            updateBadge();
            renderDownloadsList();
            return;
        }

        try {
            const res = await fetch(`${LOCAL_API_URL}/import_downloaded_map`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filePath: task.savePath,
                    folderPath: folderPath,
                    originalFilename: task.filename
                })
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error || '安装解析失败');

            task.state = 'completed';
            task.dirPath = data.dirPath;
            task.count = data.count;
            task.title = data.title || task.filename.replace(/\.osz$/i, '');
            task.newBeatmaps = data.newBeatmaps;

            // 实时更新前端曲库
            if (typeof window.addImportedBeatmaps === 'function' && data.newBeatmaps && data.newBeatmaps.length > 0) {
                window.addImportedBeatmaps(data.newBeatmaps, data.dirPath);
            } else {
                if (Array.isArray(window.beatmaps) && data.newBeatmaps && data.newBeatmaps.length > 0) {
                    window.beatmaps = window.beatmaps.filter(b => b.dirPath !== data.dirPath);
                    window.beatmaps.push(...data.newBeatmaps);
                }
                if (window.mapGroups) {
                    window.mapGroups[data.dirPath] = data.newBeatmaps;
                }
                if (typeof renderMapList === 'function') {
                    renderMapList();
                }
            }

            // 显示在游戏中
            if (typeof showToast === 'function') {
                showToast(`🎉 已成功导入谱面: ${task.title} (${data.count} 个难度)`, 'success', 4000);
            }

        } catch (err) {
            task.state = 'error';
            task.error = err.message;
            if (typeof showToast === 'function') {
                showToast(`❌ 谱面导入失败: ${err.message}`, 'error', 4500);
            }
        }

        updateBadge();
        renderDownloadsList();
    }

    function locateBeatmap(encodedDirPath) {
        const dirPath = decodeURIComponent(encodedDirPath);
        toggleOsuBrowser(false);

        // 清空搜索框保证新谱面可见
        const searchInput = document.getElementById('search-input');
        if (searchInput && searchInput.value) {
            searchInput.value = '';
            sessionStorage.removeItem('wm_search');
            if (typeof renderMapList === 'function') renderMapList();
        }

        setTimeout(() => {
            const header = document.querySelector(`.map-group-header[data-key="${dirPath.replace(/"/g, '&quot;')}"]`);
            if (header) {
                const groupEl = header.parentElement;
                if (!groupEl.classList.contains('expanded')) {
                    header.click();
                } else {
                    const firstItem = groupEl.querySelector('.map-diff-item');
                    const task = Array.from(downloadTasks.values()).find(t => t.dirPath === dirPath);
                    if (firstItem && task && task.newBeatmaps && task.newBeatmaps[0] && typeof selectMap === 'function') {
                        selectMap(task.newBeatmaps[0], firstItem);
                    }
                }
                setTimeout(() => {
                    groupEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }, 150);
    }

    function showLoadingBar() {
        if (!loadingBar) return;
        loadingBar.style.display = 'block';
        loadingBar.style.width = '35%';
        setTimeout(() => {
            if (loadingBar.style.display !== 'none') loadingBar.style.width = '70%';
        }, 200);
    }

    function hideLoadingBar() {
        if (!loadingBar) return;
        loadingBar.style.width = '100%';
        setTimeout(() => {
            loadingBar.style.display = 'none';
            loadingBar.style.width = '0%';
        }, 200);
    }

    function initOsuBrowser() {
        container = document.getElementById('osu-browser-container');
        btnBack = document.getElementById('wb-btn-back');
        btnForward = document.getElementById('wb-btn-forward');
        btnRefresh = document.getElementById('wb-btn-refresh');
        btnHome = document.getElementById('wb-btn-home');
        addressInput = document.getElementById('wb-address-input');
        btnCopyUrl = document.getElementById('wb-btn-copy-url');
        btnDownloads = document.getElementById('wb-btn-downloads');
        badgeDownloads = document.getElementById('wb-dl-badge');
        btnClose = document.getElementById('wb-btn-close');
        loadingBar = document.getElementById('wb-loading-bar');
        downloadsPanel = document.getElementById('wb-downloads-panel');
        downloadsList = document.getElementById('wb-downloads-list');
        btnClearDownloads = document.getElementById('wb-btn-clear-downloads');

        const browserBtn = document.getElementById('browser-btn');
        if (browserBtn) {
            browserBtn.onclick = () => toggleOsuBrowser();
        }

        if (!container) return;

        // 绑定导航按钮
        if (btnBack) {
            btnBack.onclick = () => {
                if (window.electronAPI && window.electronAPI.osuNavAction) {
                    window.electronAPI.osuNavAction('back');
                }
            };
        }

        if (btnForward) {
            btnForward.onclick = () => {
                if (window.electronAPI && window.electronAPI.osuNavAction) {
                    window.electronAPI.osuNavAction('forward');
                }
            };
        }

        if (btnRefresh) {
            btnRefresh.onclick = (e) => {
                if (window.electronAPI && window.electronAPI.osuNavAction) {
                    if (e && e.shiftKey) window.electronAPI.osuNavAction('reloadIgnoringCache');
                    else window.electronAPI.osuNavAction('reload');
                }
            };
        }

        if (btnHome) {
            btnHome.onclick = () => {
                if (window.electronAPI && window.electronAPI.osuNavAction) {
                    window.electronAPI.osuNavAction('home');
                }
            };
        }

        // 谱面源快捷切换
        const sourceButtons = document.querySelectorAll('.wb-source-btn');
        sourceButtons.forEach(btn => {
            btn.onclick = () => {
                const targetUrl = btn.getAttribute('data-url');
                if (targetUrl && window.electronAPI && window.electronAPI.osuNavAction) {
                    window.electronAPI.osuNavAction('go', targetUrl);
                }
            };
        });

        function updateSourceButtonsActive(url) {
            if (!url) return;
            sourceButtons.forEach(btn => {
                const bUrl = btn.getAttribute('data-url') || '';
                let match = false;
                if (bUrl.includes('osu.ppy.sh') && url.includes('osu.ppy.sh')) match = true;
                else if (bUrl.includes('sayobot.cn') && url.includes('sayobot.cn')) match = true;
                else if (bUrl.includes('nerinyan.moe') && url.includes('nerinyan.moe')) match = true;
                btn.classList.toggle('active', match);
            });
        }

        // 地址栏输入回车
        if (addressInput) {
            addressInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    let url = addressInput.value.trim();
                    if (!url) return;
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        url = 'https://' + url;
                    }
                    if (window.electronAPI && window.electronAPI.osuNavAction) {
                        window.electronAPI.osuNavAction('go', url);
                    }
                }
            });
        }

        // 复制链接
        if (btnCopyUrl) {
            btnCopyUrl.onclick = () => {
                const curUrl = addressInput ? addressInput.value : '';
                if (curUrl) {
                    navigator.clipboard.writeText(curUrl).then(() => {
                        if (typeof showToast === 'function') showToast('已复制网页链接至剪贴板', 'info', 2000);
                    });
                }
            };
        }

        // 下载按钮
        if (btnDownloads) {
            btnDownloads.onclick = (e) => {
                e.stopPropagation();
                toggleDownloadsPanel();
            };
        }

        // 清空已完成/失败下载
        if (btnClearDownloads) {
            btnClearDownloads.onclick = () => {
                const keysToDelete = [];
                downloadTasks.forEach((task, id) => {
                    if (task.state === 'completed' || task.state === 'error' || task.state === 'cancelled') {
                        keysToDelete.push(id);
                    }
                });
                keysToDelete.forEach(id => downloadTasks.delete(id));
                updateBadge();
                renderDownloadsList();
            };
        }

        // 清理缓存按钮
        const btnClearCache = document.getElementById('wb-btn-clear-cache');
        if (btnClearCache) {
            btnClearCache.onclick = () => {
                if (window.electronAPI && window.electronAPI.clearOsuCache) {
                    window.electronAPI.clearOsuCache();
                }
                if (typeof showToast === 'function') {
                    showToast('已清理浏览器缓存并强制刷新页面', 'info', 2500);
                }
            };
        }

        // 关闭按钮
        if (btnClose) {
            btnClose.onclick = () => toggleOsuBrowser(false);
        }

        // 点击外部关闭下载面板
        document.addEventListener('click', (e) => {
            if (downloadsPanel && downloadsPanel.style.display === 'flex') {
                if (!downloadsPanel.contains(e.target) && e.target !== btnDownloads && !btnDownloads.contains(e.target)) {
                    toggleDownloadsPanel(false);
                }
            }
        });

        // 快捷键监听
        window.addEventListener('keydown', (e) => {
            if (e.altKey && (e.key === 'b' || e.key === 'B' || e.code === 'KeyB')) {
                e.preventDefault();
                toggleOsuBrowser();
            } else if (e.key === 'Escape' && isBrowserVisible()) {
                e.preventDefault();
                toggleOsuBrowser(false);
            }
        });

        // Electron IPC 通信挂载
        if (window.electronAPI) {
            if (window.electronAPI.onOsuNavState) {
                window.electronAPI.onOsuNavState((state) => {
                    if (addressInput && state.url && state.url !== 'about:blank') {
                        addressInput.value = state.url;
                        updateSourceButtonsActive(state.url);
                    }
                    if (btnBack) btnBack.disabled = !state.canGoBack;
                    if (btnForward) btnForward.disabled = !state.canGoForward;
                });
            }

            if (window.electronAPI.onOsuLoading) {
                window.electronAPI.onOsuLoading((isLoading) => {
                    if (isLoading) showLoadingBar();
                    else hideLoadingBar();
                });
            }

            window.electronAPI.onToggleBrowser(() => {
                toggleOsuBrowser();
            });

            window.electronAPI.onCloseBrowser(() => {
                if (isBrowserVisible()) toggleOsuBrowser(false);
            });

            window.electronAPI.onDownloadStart((data) => {
                const task = {
                    id: data.id,
                    filename: data.filename,
                    totalBytes: data.totalBytes || 0,
                    receivedBytes: data.receivedBytes || 0,
                    percent: data.percent || 0,
                    state: 'downloading',
                    url: data.url
                };
                downloadTasks.set(data.id, task);
                updateBadge();
                renderDownloadsList();

                if (typeof showToast === 'function') {
                    showToast(`📥 开始下载谱面: ${data.filename}`, 'loading', 3000);
                }
            });

            window.electronAPI.onDownloadProgress((data) => {
                const task = downloadTasks.get(data.id);
                if (task) {
                    task.totalBytes = data.totalBytes;
                    task.receivedBytes = data.receivedBytes;
                    task.percent = data.percent;
                    task.state = 'downloading';
                    updateSingleTaskDOM(task);
                }
            });

            window.electronAPI.onDownloadDone((data) => {
                const task = downloadTasks.get(data.id);
                if (task) {
                    task.savePath = data.savePath;
                    task.percent = 100;
                    handleAutoImport(task);
                }
            });

            window.electronAPI.onDownloadError((data) => {
                const task = downloadTasks.get(data.id);
                if (task) {
                    task.state = data.state || 'error';
                    task.error = data.error || '下载失败';
                    updateBadge();
                    renderDownloadsList();
                    if (typeof showToast === 'function') {
                        showToast(`❌ 下载失败: ${task.filename}`, 'error', 3500);
                    }
                }
            });
        }
    }

    // 暴露供下载面板按钮调用的模块方法
    window.osuBrowserModule = {
        toggle: toggleOsuBrowser,
        locateBeatmap: locateBeatmap,
        cancelDownload: (id) => {
            if (window.electronAPI && window.electronAPI.cancelDownload) {
                window.electronAPI.cancelDownload(id);
            }
            const task = downloadTasks.get(id);
            if (task) {
                task.state = 'cancelled';
                task.error = '用户已取消下载';
                updateBadge();
                renderDownloadsList();
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initOsuBrowser);
    } else {
        initOsuBrowser();
    }
})();
