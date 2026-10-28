# 🎹 Web Mania Next

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Platform-Electron-47848F.svg)
![HTML5 Canvas](https://img.shields.io/badge/Tech-Canvas%20%7C%20Node.js-E34F26.svg)
![Renderer](https://img.shields.io/badge/Renderer-D3D11%20%7C%20D3D12%20%7C%20Graphite-6366f1.svg)

**Web Mania Next** 是一款基于 Electron 和现代 Web 技术（HTML5 Canvas + WebSockets）构建的高性能开源跨平台下落式音乐游戏。项目深度复刻了 **osu!mania** 的手感与核心判定体验，支持 1K 至 18K（以 4K / 7K 为主）全模式键位，并集成了多人在线竞技大厅、交互式音频延迟校准、谱面智能转码管理与高性能硬件加速渲染引擎。

---

## ✨ 核心特性

* **⚡ 极致性能与精准判定**
  * **亚像素级 Canvas 渲染**：基于 HTML5 Canvas 2D API 打造的高性能渲染管线，解除帧率上限与垂直同步限制，呈现丝滑打击动画。
  * **严谨判定与计分系统**：精准复刻 osu!mania 判定机制（MAX 320、300、200、100、50、MISS 早/晚判定），并配备实时精确的 UR、Acc 及 PP 算法。
  * **BreakTime 休息动画**：完整支持谱面休息段倒计时与专属过渡动效。

* **🎯 交互式音频延迟校准 (Offset Calibration)**
  * **3 轮节拍打击向导**：内置专属的图形化交互延迟调校工具（`Offset Calibration`），玩家随节拍敲击按键即可智能测算硬件外设延迟，一键同步应用至系统设置。
  * **动态击打音效补偿**：高 Offset 状态下智能提前触发打击音效，确保敲击回馈与谱面节奏严格契合。
  * **音频平滑渐变**：窗口失焦或切出时自动平滑降低音量，聚焦时渐变恢复，防止听觉冲击。

* **🌐 强大的多人联机大厅 (Multiplayer)**
  * **即时房间与文字聊天**：支持自由创建房间、设置房间密码锁与人数上限，房间内成员实时同步准备状态与聊天信息。
  * **智能键位配置引导**：准备就绪时若检测到玩家尚未配置当前谱面对应 K 数的按键，将自动呼出键位配置页面，避免盲目进房。
  * **谱面极速秒传**：独创谱面 Hash 校验与分发机制，房主换歌后，缺少谱面的玩家可直接从远程服务器或 Sayobot 一键秒传下载。
  * **实时流畅观战 (Spectator Mode)**：支持自由进入观战席，亚毫秒级同步场上选手的按键状态、实时连击、判定结果与即时排行榜。
  * **房主控制权**：房主拥有强制结算与选谱权限，支持多人同台竞技结算展示。

* **📦 谱面生态与多 Key 支持**
  * **原生 osu! 歌曲库导入**：开箱即用直接读取本地 `osu! Songs` 目录，支持毫秒级索引缓存、实时搜索与分类筛选。
  * **支持 `.osz` 拖拽导入**：直接将 `.osz` 谱面压缩包拖入游戏窗口即可自动解压并完成安装。
  * **全 Key 模式支持**：内置 1K ~ 18K 自定义键位编辑器，支持单轨双键绑定，完美适配 4K、7K 等多样玩法。
  * **Sayobot 谱面库无缝集成**：游戏内直接搜索并一键下载 Sayobot 上的海量热门谱面。
  * **谱面自定义打击音**：优先加载并播放谱面自带的个性化 Hitsounds 音效。

* **🎬 智能视频背景引擎**
  * **动态视频兼容性检测**：开局前自动分析背景视频编码；若格式为老旧/无法直接硬解的视频（如 AVI 等），将自动触发后台静默转码。
  * **持久化转码缓存**：转码结果自动写入本地缓存目录（`Temp/video_cache`），实现二次秒开，确保动态视频背景 60fps+ 极速播放。
  * **个性化视觉调节**：自由调节背景暗化（Dim）、模糊度（Blur）及视频播放开关。

* **🛠️ 渲染引擎与专业调校**
  * **多重后端渲染器切换**：支持 Direct3D 11、Direct3D 12（实验性）及 Google Skia Graphite 多种渲染器自由选择。
  * **Kiosk 沉浸全屏模式**：可开启自动 Kiosk 模式，提供无边框沉浸式街机体验。

---

## 🖼️ 游戏截图

<img width="1920" height="1040" alt="select-screen" src="https://github.com/user-attachments/assets/39f8fdb6-5c38-400c-98f5-76274a42cfce" />
<img width="1920" height="1040" alt="multiplayer" src="https://github.com/user-attachments/assets/dad0c48a-7bc2-4555-9426-d1d1d2ea88e8" />
<img width="1920" height="1040" alt="gameplay" src="https://github.com/user-attachments/assets/b054955f-e643-4ca6-b699-d5694b91c385" />

---

## 🚀 快速开始

### 环境依赖

* **Node.js** (推荐 v16.x 或更高版本)
* **FFmpeg** (若需使用视频背景播放及自动转码功能，请确保系统已安装 FFmpeg 并配置至系统环境变量)

### 安装与运行

1. **克隆仓库**
   ```bash
   git clone https://github.com/hxc1818/Web-Mania-Next.git
   cd Web-Mania-Next
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **启动游戏**
   ```bash
   npm start
   ```

4. **打包应用** (可选)
   ```bash
   npm run dist
   ```

---

## 🎮 操作指南与快捷键

### 常用快捷键

| 按键 | 场景 | 动作说明 |
| :--- | :--- | :--- |
| `D` `F` `J` `K` | 4K 游玩 | 默认 4K 轨道按键（可在键位设置中自由修改） |
| `ESC` | 选歌 / 单人模式 | 暂停游戏或呼出暂停菜单；设置中返回上一级 |
| 长按 `ESC` | 多人游戏 | 认输并退出当局游戏 |
| 长按 `~` (Backquote) | 单人游戏 | 快速重开当前谱面 (Quick Retry) |
| 点击设置中的延迟校准 | 设置菜单 | 唤出主动音频延迟校准窗口 (`Offset Calibration`) |

### 游玩建议

* **首次启动**：在初始化界面选择本地的 `osu! Songs` 文件夹路径，游戏将自动扫描并建立曲库缓存。
* **按键配置**：支持 1K 至 18K 各自独立的键位绑定；多人联机时如遇到未绑定的模式，准备按钮会自动引导设置。
* **掉帧排查**：若在特定显卡平台遇到掉帧，请在设置中切换渲染器（Direct3D 11 / Direct3D 12 / Skia Graphite）或调整背景模糊度。

---

## 🛠️ 技术栈

* **桌面容器**: Electron (Chromium + Node.js)
* **图形渲染**: HTML5 Canvas 2D API (原生 JS 亚像素引擎)
* **图形后端**: Angle (D3D11 / D3D12) / Skia Graphite
* **本地后端服务**: Express.js + Node.js (支持 SharedArrayBuffer 跨域隔离)
* **多人联机通信**: WebSockets (WS)
* **多媒体与视频**: Web Audio API + FFmpeg + JSMpeg

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 协议开源。

Copyright (c) 2026 [hxc1818](https://github.com/hxc1818)
