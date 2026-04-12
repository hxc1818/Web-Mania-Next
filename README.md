# 🎹 Web Mania Next
![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Platform-Electron-47848F.svg)
![HTML5 Canvas](https://img.shields.io/badge/Tech-Canvas%20%7C%20Node.js-E34F26.svg)

**Web Mania Next** 是一款基于 Electron 和现代 Web 技术（HTML5 Canvas + WebSockets）构建的开源跨平台下落式音乐游戏。它深度复刻了 **osu\!mania (4K)** 的核心体验，并引入了内置多人联机大厅、自动化谱面管理以及高性能的渲染引擎。

## ✨ 核心特性

  * **⚡ 极致性能与判定**

      * 采用 **HTML5 Canvas 2D API** 进行亚像素级渲染，支持无限制帧率。
      * 精确还原 osu\!mania 判定机制（MAX, 300, 200, 100, 50, MISS）及 PP 计算算法。
      * 内置高性能 **FFmpeg** 视频解码，支持谱面动态视频背景播放。

  * **🌐 强大的多人联机 (Multiplayer)**

      * **即时联机大厅**：支持创建房间、实时聊天、多人同步竞技。
      * **秒传同步**：独创的谱面 Hash 校验机制，房主选歌后，缺少谱面的玩家可从远程服务器秒传下载。
      * **实时观战**：支持流畅的观战模式（Spectator Mode），实时同步按键与判定。

  * **📦 谱面生态支持**

      * **原生 osu\! 支持**：直接读取本地 `osu! Songs` 目录，支持 `.osu` 解析与 `.osz` 拖拽导入。
      * **Sayobot 集成**：游戏内直接搜索并获取 Sayobot 上的优质谱面。
      * **智能转码**：自动检测并转码老旧视频格式（如 AVI），确保播放流畅。

  * **🛠️ 高度可自定义**

      * **个性化皮肤**：支持自定义轨道颜色、按键绑定、背景暗化与模糊度。
      * **专业调校**：内置音频偏移校准 (Offset) 系统、下落速度调节及多重渲染器切换（D3D11/D3D12/Graphite）。

## 🖼️ 游戏截图

\<img width="1920" height="1040" alt="select-screen" src="[https://github.com/user-attachments/assets/e487ccc7-4038-4c6e-b77c-2520337d56c0](https://github.com/user-attachments/assets/e487ccc7-4038-4c6e-b77c-2520337d56c0)" /\>
\<img width="1920" height="1040" alt="multiplayer" src="[https://github.com/user-attachments/assets/f74da7d2-0e25-471d-93c0-8239c8f33ae1](https://github.com/user-attachments/assets/f74da7d2-0e25-471d-93c0-8239c8f33ae1)" /\>
\<img width="1920" height="1040" alt="gameplay" src="[https://github.com/user-attachments/assets/9ddaf2cf-4ba2-4006-b4b0-53592f855b01](https://github.com/user-attachments/assets/9ddaf2cf-4ba2-4006-b4b0-53592f855b01)" /\>

## 🚀 快速开始

### 环境依赖

  * **Node.js** (推荐 v16.x 或更高版本)
  * **FFmpeg** (若需播放视频背景，请确保系统已安装并配置环境变量)

### 安装与运行

1.  **克隆仓库**
    ```bash
    git clone https://github.com/hxc1818/web-mania-next.git
    cd web-mania-next
    ```
2.  **安装依赖**
    ```bash
    npm install
    ```
3.  **启动游戏**
    ```bash
    npm start
    ```
4.  **打包应用** (可选)
    ```bash
    npm run dist
    ```

## 🎮 游玩建议

  * **首次启动**：请在初始化界面选择您的 `osu! Songs` 文件夹以同步本地库。
  * **默认键位**：4K 模式默认为 `D` `F` `J` `K`，可在设置中心随时更改。
  * **性能优化**：若遇到掉帧，请在设置中尝试切换渲染器（Renderer）或开启硬解加速。

## 🛠️ 技术栈

  * **桌面端**: Electron
  * **渲染引擎**: HTML5 Canvas (原生 JS)
  * **后端服务**: Node.js + Express
  * **实时通信**: WebSockets (WS)
  * **多媒体处理**: FFmpeg + JSMpeg

## 📄 开源协议

本项目基于 [MIT License](https://www.google.com/search?q=LICENSE) 协议开源。

Copyright (c) 2026 hxc1818
