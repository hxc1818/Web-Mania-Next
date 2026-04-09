
# Web Mania Next

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Platform-Electron-47848F.svg)
![HTML5 Canvas](https://img.shields.io/badge/Tech-Canvas%20%7C%20Node.js-E34F26.svg)

Web Mania Next 是一个基于 Electron 和现代 Web 技术（HTML5 Canvas + WebSockets）重构的跨平台下落式音乐游戏。它复刻了 osu!mania (4K) 的核心体验，并提供了便捷的内置联机和谱面管理功能。

## 核心特性 (Features)

* **原生 osu! 谱面支持**
    * 无缝读取本地 `osu! Songs` 目录。
    * 支持解析 `.osu` 谱面文件和直接导入 `.osz` 压缩包。
    * 精确还原 osu!mania 的判定机制（MAX, 300, 200, 100, 50, MISS）、HP 机制与 PP 算法。

* **在线多人联机大厅 (Multiplayer)**
    * 支持创建房间、实时聊天、多人同步游戏。
    * 自动同步谱面：房主选歌后，缺少谱面的玩家可直接从远程服务器或房主端秒传下载。
    * 支持实时观战模式（Spectator Mode）。

* **内置 Sayobot 谱面下载**
    * 游戏内直接随机获取并下载 Sayobot 上的优质 4K 谱面。

* **动态视频背景支持**
    * 集成 `FFmpeg` 和 `JSMpeg`，支持在游戏过程中流畅播放谱面自带的视频背景。

* **排行榜与回放系统 (Replays & Leaderboards)**
    * 内置本地历史分数记录与回放系统。
    * 支持对接全球排行榜系统。

* **高度自定义**
    * 支持音频偏移校准 (Offset)、下落速度调节、轨道缩放。
    * 支持自定义轨道颜色、背景暗化度 (Dim) 与模糊度 (Blur)。

## 游戏截图 (Screenshots)

<img width="1920" height="1040" alt="select-screen" src="https://github.com/user-attachments/assets/e487ccc7-4038-4c6e-b77c-2520337d56c0" />
<img width="1920" height="1040" alt="multiplayer" src="https://github.com/user-attachments/assets/f74da7d2-0e25-471d-93c0-8239c8f33ae1" />
<img width="1920" height="1040" alt="gameplay" src="https://github.com/user-attachments/assets/9ddaf2cf-4ba2-4006-b4b0-53592f855b01" />


## 快速开始 (Getting Started)

### 环境依赖
* **Node.js** (推荐 v16 及以上版本)
* **FFmpeg** (若需启用视频背景播放功能，请确保系统中已安装 FFmpeg 并配置了环境变量)

### 安装与运行

1. 克隆本仓库到本地：
```bash
git clone [https://github.com/hxc1818/web-mania-next.git](https://github.com/hxc1818/web-mania-next.git)
cd web-mania-next
```

2. 安装依赖：  
```bash
npm install
```

3. 启动应用：
```Bash
npm start
```

4. 打包发布 (可选)：
```bash
npm run dist
```
## 游玩指南 (How to Play)

1. **首次运行**：应用启动后，系统会提示选择本地的 `osu! Songs` 文件夹路径以建立缓存索引。
    
2. **导入谱面**：可直接将 `.osz` 文件拖拽到选歌界面进行解析和安装。
    
3. **按键操作**：默认 4K 键位为 `D`, `F`, `J`, `K`，游戏中可随时通过 `ESC` 键呼出暂停菜单。
    

## 技术栈 (Tech Stack)

- **前端 UI 与渲染**：HTML5, CSS3, 原生 JavaScript, Canvas 2D API
    
- **视频解码与播放**：JSMpeg + FFmpeg
    
- **后端与桌面端**：Electron, Node.js, Express.js
    
- **多人联机通信**：WebSockets (WS)
    

## 贡献与参与 (Contributing)

欢迎提交 Pull Request 或发布 Issue。无论是修复缺陷、优化判定逻辑，还是增加全新的 UI 主题，都非常感谢您的贡献。

## 开源协议 (License)

本项目基于 [MIT License](https://www.google.com/search?q=./LICENSE) 开源。

Copyright (c) 2026 hxc1818
