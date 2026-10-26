# Miku 桌宠

淡彩风的初音未来桌面宠物（Windows / Electron）。立绘以两张参考图为基础，用 Codex 的 `image_gen` 生成同画风的透明底动作立绘，WebGL 着色器让双马尾随风飘动、拖动时有惯性。

<p align="center"><img src="assets/gen/idle.png" height="300"> <img src="assets/gen/leek.png" height="300"> <img src="assets/gen/night.png" height="300"></p>

## 安装

到 [Releases](https://github.com/wldinhy/miku-deskpet/releases/latest) 下载（仅 Windows x64）：

- **Miku-Deskpet-Setup-x.x.x.exe**：安装版，可自选安装位置，自动创建桌面和开始菜单快捷方式，可在系统“应用”里卸载。
- **Miku-Deskpet-Portable-x.x.x.exe**：免安装版，双击即用。

安装程序没有代码签名，第一次运行时 Windows 可能弹出“已保护你的电脑”，点 **更多信息 → 仍要运行** 即可。

## 从源码运行

需要 Node.js 18+。

```bash
npm install
npm start
```

装好依赖后，也可以双击 `启动桌宠.vbs` 直接启动（不弹命令行窗口）。`.npmrc` 已配置 npmmirror 的 Electron 镜像，国内网络也能顺利安装。

自己打包安装程序：`npm run dist`，产物在 `dist/`。

## 互动

| 操作 | 反应 |
| --- | --- |
| 单击头 / 鼠标在头上来回蹭 | 摸头，开心脸红，冒爱心 |
| 单击脸颊 | 戳脸，鼓起腮帮子 |
| 单击身体（连戳） | 吓一跳 / 挠痒笑个不停 |
| 单击双马尾 | 拽头发，会生气 |
| 单击腿 | 跳一下 |
| 双击 | 转个圈（正面 → 侧面 → 背面） |
| 按住拖动 | 拎起来；用力甩出去会被抛飞、撞墙反弹、晕头转向 |
| 右键 | 打开菜单 |

右键菜单：
- **互动**：挥手、唱歌、甩葱、跳舞、转圈、跳、伸懒腰、坐下、睡午觉、喂葱、递水
- **小功能**：番茄钟、待办便签、定时提醒、猜拳、今日运势、好感度与记录
- **月夜模式**：在月亮前漂浮（可设为入夜自动切换）
- **设置**：大小、不透明度、喝水 / 久坐提醒、打瞌睡时间、置顶、自由散步、重力、音效、说话声、整点报时、安静模式、开机自启

她还会自己散步、东张西望、哼歌、坐下休息，长时间没人理会就打瞌睡（点一下叫醒）。好感度会随互动增长，解锁更亲密的台词。音乐和音效全部由 WebAudio 实时合成。

托盘图标：左键显示 / 隐藏，右键打开菜单。

## 目录

```
main.js          主进程：透明置顶窗口、拖拽 / 抛掷 / 下落 / 散步物理、菜单、托盘、存档
preload.js       IPC 白名单
js/character.js  立绘加载与 WebGL 渲染（头发飘动、眨眼 / 说话叠层、像素级命中判断）
js/app.js        动作状态机、交互、自主行为
js/features.js   番茄钟、待办、提醒、猜拳、运势、好感度面板
js/audio.js      合成音效与原创小曲
js/lines.js      台词
assets/gen/      生成的透明底立绘
assets/src/      参考原图
tools/           用 Codex CLI 批量生成立绘的脚本（在 WSL 中运行）
```

## 重新生成立绘

在装有 Codex CLI 并已登录的 WSL 中：

```bash
bash tools/gen.sh wave "standing, facing the viewer, waving with her right hand ..."
bash tools/gen-batch.sh 0 1 poses.txt   # 参数：起始行 步长 [清单文件]
```

## 版权说明

代码以 MIT 许可发布。初音未来（Hatsune Miku）为 Crypton Future Media, INC. 的角色，本项目为非商业同人作品；立绘素材不随 MIT 许可授权，请勿用于商业用途。
