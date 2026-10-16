---
name: bilibili-digest
description: Bilibili Digest Chrome 扩展（MV3）的总览说明，涵盖用途、适用场景、输入参数、执行步骤与输出。源自 youtube-digest v1.2.0，改造以适配 bilibili 视频。
---

# Bilibili Digest — Chrome 扩展总览（SKILL.md）

> 本项目源自开源项目 [youtube-digest](https://github.com/zarazhangrui/youtube-digest) v1.2.0（作者 [zarazhangrui](https://github.com/zarazhangrui)），在其基础上改造以适配 bilibili 视频，并保留其 git 历史与 MIT 许可署名。

## 用途

Bilibili Digest 是一个 **Chrome Manifest V3 侧边栏扩展**，把 bilibili 视频变成可深入学习的资料：抓取视频字幕，提供中文翻译、AI 概览、章节要点、内容讲解与带时间戳的笔记，全部集成在浏览器侧边栏中，点击时间戳即可跳转对应画面。

核心能力：

- 字幕获取与展示（B 站 CC 字幕 / AI 字幕优先，无字幕时用语音转写兜底）。
- 中文翻译与双语对照（外语字幕自动译中，中文字幕直显）。
- AI 概览、章节、重点引用（DeepSeek，BYOK）。
- 选中文本即时讲解。
- 带时间戳的笔记（AI 润色 + 本地缓存）。
- 语音转写兜底（DASH 音频下载 + 托管转写服务，默认关闭）。

## 适用场景

- 学习 bilibili 上的教程、讲座、课程视频，快速建立结构化理解。
- 无字幕 / 外语字幕视频的中文辅助阅读。
- 无字幕视频的语音转文字（需自行配置转写服务）。
- 需要把视频内容沉淀为可检索笔记、反复复习的场景。

## 输入参数

### 用户配置（options 设置页，存储于 `chrome.storage.local`，`settings.js` 提供默认值与校验）

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `aiApiKey` | 空 | DeepSeek API Key（AI 概览/翻译/讲解，BYOK） |
| `aiBaseUrl` | `https://api.deepseek.com` | AI 接口地址 |
| `aiModel` | `deepseek-v4-flash` | AI 模型 |
| `asrEnabled` | `false` | 语音转写开关，默认关闭 |
| `asrProvider` | `siliconflow` | 转写供应商（siliconflow / openai / groq / custom） |
| `asrApiKey` | 空 | 转写服务 API Key |
| `asrBaseUrl` | `https://api.siliconflow.cn/v1` | 转写服务地址（仅接受 https） |
| `asrModel` | `FunAudioLLM/SenseVoiceSmall` | 转写模型 |
| `asrMaxBytes` | `24 MiB` | 音频体积上限，超限在下载前拒绝 |

### 运行时输入

- **bilibili 视频 URL / bvid**：由 `platform.js` 从页面 URL 解析 `bvid` 与分 P 序号 `p`。
- **视频 cid**：由 `background.js` 经 `x/web-interface/view` 接口查询。

## 执行步骤

### 用户视角

1. 在 Chrome 中加载本扩展（开发者模式「加载已解压的扩展程序」）。
2. 打开任一 bilibili 视频页，点击页面上的 digest 按钮打开侧边栏。
3. 侧边栏自动获取字幕并展示（无字幕时按设置提供「语音转录」标签页）。
4. 按需使用「AI 概览」「翻译」「讲解」「笔记」等标签页。

### 技术链路（代码执行流程）

1. **页面注入**：`content.js` 在 bilibili 视频页注入 digest 按钮，解析 `bvid` / `p`。
2. **字幕获取**：`background.js` 走 B 站字幕链路 —— `x/web-interface/view`（取 cid）→ `x/player/wbi/v2`（字幕列表，需 `wbi.js` 的 WBI 签名）→ 字幕 CDN JSON（`body[]` 含 `from` / `to` / `content`）。
3. **选轨优先级**：中文 CC 字幕 > AI 中文字幕 > 外语字幕（标记 `needsTranslation` 自动译中）> 无字幕则进入语音转写兜底。
4. **语音转写兜底（可选）**：`asr.js` + `background.js` 拉取 DASH 音频（`x/player/wbi/playurl`，经 `declarativeNetRequest` 改写 Referer 防盗链）→ 上传至 OpenAI 兼容 `/audio/transcriptions` → 解析响应（`verbose_json` → `srt` → `json` 逐级降级）。
5. **AI 处理**：`sidepanel.js` 按用户操作调用 DeepSeek，使用 `prompts/` 下的提示词生成概览、翻译、讲解、笔记润色。
6. **输出渲染**：侧边栏渲染字幕 / 翻译 / 概览 / 笔记，点击时间戳跳转，笔记与转写结果写入本地缓存（`chrome.storage.local`）。

## 输出

- 结构化字幕（原文 + 中文翻译，含时间戳）。
- AI 概览、章节、重点引用。
- 选中文本讲解。
- 带时间戳的笔记（可导出）。
- 语音转写结果（无字幕视频，缓存复用）。
- 可离线复用的本地缓存数据。

## 项目结构

```
bilibili-digest/
├── manifest.json            # MV3 清单（v1.4.0）
├── background.js            # Service Worker：字幕/音频/AI 请求
├── content.js               # 页面注入：digest 按钮 + 导航监听
├── sidepanel.js/.css/.html  # 侧边栏 UI 与逻辑
├── options.js/.css/.html    # 设置页
├── settings.js              # 配置默认值与校验（非密钥）
├── platform.js              # bvid / URL / 分 P 解析
├── wbi.js                   # WBI 签名（含纯 JS MD5）
├── asr.js                   # 语音转写模块
├── prompts/                 # AI 提示词（analysis/explain/note-cleanup/translation）
├── icons/                   # 图标 16/48/128
├── tests/                   # 单元/回归测试（node --test）
├── scripts/                 # 可复用脚本（check-release.sh / package-extension.sh）
├── .github/workflows/ci.yml # CI
└── README.md / README.zh-CN.md / PRIVACY.md / SECURITY.md / LICENSE
```

## 可复用脚本

| 脚本 | 用途 |
| --- | --- |
| `scripts/check-release.sh` | 发布前体检：跑测试、白名单文件校验、输出发布文件清单（`--print-files`） |
| `scripts/package-extension.sh` | 打包扩展为可安装的 zip（产出 `dist/`） |

## 开发命令

```bash
npm test                 # 运行全部单元/回归测试
npm run check            # 发布前体检（测试 + 白名单文件）
npm run package          # 打包 zip（产出 dist/bilibili-digest-v*.zip）
```

## 参考说明

- `README.md` / `README.zh-CN.md`：功能与使用说明（英 / 中）。
- `PRIVACY.md`：隐私说明（BYOK、本地存储、无追踪）。
- `SECURITY.md`：安全说明。
- `LICENSE`：MIT（保留原作者版权署名）。

## 已知要点

- B 站字幕接口未登录时可能返回空字幕列表（部分视频需登录态 `SESSDATA`）。
- 语音转写依赖托管服务，会产生外部调用与费用，故默认关闭、需手动触发。
- `config.js`（本地密钥）已被 `.gitignore` 忽略，永不提交。
