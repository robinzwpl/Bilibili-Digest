# Bilibili Digest

[English](README.md) | [简体中文](README.zh-CN.md)

> **说明：** 本项目源自开源项目 [youtube-digest](https://github.com/zarazhangrui/youtube-digest)，在其基础上改造以适配 bilibili 视频——原 YouTube 字幕来源已替换为 B 站自带的 CC/AI 字幕轨。

把每个 bilibili 视频变成一份可以深入学习的资料。Bilibili Digest 把字幕、双语翻译、AI 概览、内容讲解和时间戳笔记放进同一个 Chrome 侧边栏，让你可以持续学习视频中的知识和语言，同时不丢失原视频上下文。

- 把零碎字幕变成清晰、可搜索的学习资料。
- 查看原文、简体中文翻译，或中英双语对照字幕来学习语言。
- 通过 AI 概览、章节、重点引用和选中文本讲解建立系统理解。
- 点击字幕、概览或笔记中的时间戳，快速跳转到对应位置。
- 保存自动润色的时间戳笔记，方便之后复习。
- 使用自己的 API Key，数据保存在本地 Chrome 中，不包含分析统计或行为追踪。

Bilibili Digest 是一个需要自行提供 API Key 的开源项目，通过 GitHub 安装。目前没有上架 Chrome 应用商店，不赠送 API 额度，也没有开发者运营的服务器。

点击查看演示和教学视频（小白友好）：[https://www.bilibili.com/video/BV1dnuq6dEak/](https://www.bilibili.com/video/BV1dnuq6dEak/)

![Bilibili Digest 双语演示](Bilibili%20Digest%20demo%20bilingual.png)

## v1.4.0 更新

- 为完全没有字幕轨的视频新增语音转写兜底。默认关闭，不增加任何安装期权限，并且只会在你点击 **转写音频** 时运行。
- 音频直接从 B 站的 DASH 流中拉取，再上传给你选择的托管转写服务（默认预置硅基流动，也支持 OpenAI、Groq 或任意兼容 OpenAI 的接口）。
- 转写得到的字幕会按同一结构缓存，因此概览、笔记、搜索、点击跳转和选中讲解在转写视频上同样可用。
- 事前告知：音频时长、大小与已配置的上限都会先算出来，超长视频在下载之前就会被拒绝。
- Whisper 系列模型的时间戳保持精确；只返回文本的模型同样可用，时间轴为估算值，并且字幕上方会明确标注是哪种。

## v1.3.0 更新

- 在视频选集中切换分 P 时，侧边栏会重新加载为所选分 P，不再停留在上一个分 P。
- 搜索字幕中的单词或短语，并依次查看所有匹配位置。
- 在 Transcript、Overview 和 Notes 中共用 Original、中文和双语设置。新视频默认保持 Original，不会自动消耗翻译 token。
- 只翻译当前可见的 Overview 和 Notes 内容，并通过小批次渐进显示和缓存结果。
- 选中字幕后，可以直接讲解内容或保存带时间戳的笔记。
- 页面跳转后保留字幕阅读位置，并在离开 bilibili 视频页面时自动关闭侧边栏。

## 让你的编程 Agent 帮你安装

你不需要看懂代码，也不需要会使用命令行。把下面这段话发送给你的编程 Agent：

> 请把这个项目下载或克隆到我选择的长期保留文件夹，告诉我准确的完整路径，并让 Chrome“加载已解压的扩展程序”使用同一个文件夹。如果我在第一次安装时需要位置建议，可以推荐 macOS 或 Linux 上的 `~/Documents/bilibili-digest`，或 Windows 上的 `%USERPROFILE%\Documents\bilibili-digest`，但不要假设我一定使用这些路径。请用简单易懂的语言一步一步指导我完成安装和配置。https://github.com/zarazhangrui/youtube-digest

你的 Agent 应该帮你：

1. 先询问你想把项目长期保存在哪里，再下载或克隆到那里，并告诉你准确的完整路径。如果你需要建议，可以推荐 macOS 或 Linux 上的 `~/Documents/bilibili-digest`，或 Windows 上的 `%USERPROFILE%\Documents\bilibili-digest`。
2. 打开下方 DeepSeek 官方页面，指导你创建自己的账号（如需语音转写兜底，再打开对应转写服务商的页面）。
3. 指导你在 Chrome 中通过“加载已解压的扩展程序”选择你刚才确定的那个准确项目文件夹。
4. 告诉你应该在扩展的“设置”页面哪个位置填写 API Key。
5. 打开一个带字幕的 bilibili 视频，确认字幕和翻译功能可以使用。

安装后请让这个文件夹留在原位。如果移动或删除它，Chrome 中加载的本地扩展会失效，需要从新的长期存放位置重新加载。

不要把 API Key 发送到 AI 对话、源代码、截图或公开消息中。请你自己在 Bilibili Digest 的设置页面直接填写。编程 Agent 可以告诉你填写位置，但不需要看到 Key。

## 手动安装

如果你想自己操作：

1. 打开 [github.com/zarazhangrui/youtube-digest](https://github.com/zarazhangrui/youtube-digest)。
2. 点击 **Code**，再选择 **Download ZIP**。
3. 选择一个长期保留的文件夹，并把项目解压到这里。可选建议是 macOS 或 Linux 上的 `~/Documents/bilibili-digest`，或 Windows 上的 `%USERPROFILE%\Documents\bilibili-digest`。你也可以使用其他文件夹。
4. 在 Chrome 地址栏打开 `chrome://extensions`。
5. 打开右上角的“开发者模式”。
6. 点击“加载已解压的扩展程序”。
7. 选择你刚才确定的那个准确项目文件夹，其中必须包含 `manifest.json`。
8. 如果需要，可以在 Chrome 扩展菜单中固定 Bilibili Digest。

这是一个本地加载的扩展，不会自动更新。下载新版或让 Agent 修改代码后，请在 `chrome://extensions` 中找到 Bilibili Digest 并点击“重新加载”，然后刷新已经打开的 bilibili 页面。如果移动或删除源代码文件夹，Chrome 中加载的扩展会失效，需要从新的位置重新加载。

## 设置 API Key

Bilibili Digest 使用你自己的服务账号，只有一个 Key 是必需的：

1. **DeepSeek API Key**，用于生成概览、讲解内容、翻译和自动润色笔记。
2. **转写服务 API Key**（可选），仅当你需要为完全没有字幕轨的视频启用语音转写兜底时才需要。

字幕本身不需要任何 Key，它来自 B 站自带的字幕轨。

### 字幕来源

字幕来自 B 站自带的字幕轨：

- 扩展通过 B 站官方接口链路（`x/web-interface/view` → `x/player/wbi/v2` → 字幕 CDN）获取 CC 字幕与 AI 字幕。
- 字幕无需第三方 API Key，只需在当前 Chrome 个人资料中登录 bilibili.com。
- 中文 CC 字幕与 AI 中文字幕（`ai-zh`）直接显示；外语字幕自动翻译为简体中文。

### 语音转写兜底（可选）

有些视频完全没有字幕轨。Bilibili Digest 可以覆盖这类视频：下载该视频的音频，发送给由你选择、由你付费的托管转写服务。该功能默认关闭，在打开之前不会申请任何额外权限，并且只会在你点击 **转写音频** 时运行。

1. 先在受支持的服务商申请 Key。[硅基流动](https://cloud.siliconflow.cn/account/ak) 已内置为默认选项，因为国内可直连；OpenAI 与 Groq 也已内置，另外任何兼容 OpenAI `/audio/transcriptions` 的接口都可以使用。
2. 打开 Bilibili Digest 设置，打开 **启用语音转写兜底**。
3. 粘贴 Key，选择模型，然后保存。此时 Chrome 会为这一个接口地址申请权限，请选择允许。
4. 打开一个没有字幕的视频，面板会给出 **转写音频（约 N 分钟）** 按钮。在你点击之前，什么都不会发生。

模型的选择决定时间戳质量：

- `whisper-large-v3`、`whisper-1`、`whisper-large-v3-turbo` 会返回逐段时间戳，点击跳转保持精确。
- `FunAudioLLM/SenseVoiceSmall` 等只返回纯文本的模型更便宜、更快，但时间轴会根据音频总时长估算，面板会在字幕上方明确说明。

音频默认上限为 24 MB，可在 1 到 100 MB 之间调整。长视频会产生更大的音频文件，请提高上限或选择较短的分 P。

### 获取 DeepSeek API Key

1. 打开 DeepSeek 官方 [API Keys 页面](https://platform.deepseek.com/api_keys)。
2. 按照提示登录，或创建 DeepSeek 开放平台账号。
3. 点击 **Create new API key**，填写容易识别的名称，例如 `Bilibili Digest`，然后创建 Key。
4. 立即复制 Key。完整 Key 可能只会显示一次。
5. 把 Key 粘贴到 Bilibili Digest 设置中的 **DeepSeek API key**。
6. 如果 DeepSeek 提示余额不足，请在 DeepSeek 开放平台账号中充值后再试。

当前账号和接口说明请查看 [DeepSeek 官方 API 文档](https://api-docs.deepseek.com/)。

在侧边栏中打开 **Settings**。你也可以在 `chrome://extensions` 的 Bilibili Digest 卡片中打开扩展选项。Key 只能粘贴到这些设置输入框中。不要把 Key 发送到 AI 对话、项目文件、截图或公开消息中。

发布版本只支持 DeepSeek V4 Flash：

```text
Base URL: https://api.deepseek.com
Model: deepseek-v4-flash
```

Bilibili Digest 会让所有 DeepSeek 请求使用非思考模式，以获得更快、更稳定的交互。设置中的接口地址和模型固定，只需要填写 DeepSeek API Key。如果想使用其他服务或模型，请在设置中复制安全的自定义 prompt，让编程 Agent 修改你自己的本地副本。不要把任何 API Key 放进 prompt 或对话。

API Key 和设置保存在你设备上的 Chrome 扩展本地存储中。发布包不会包含或使用 `config.js`。

## 使用 Bilibili Digest

1. 打开一个普通的 bilibili 视频页面。
2. 点击 Bilibili Digest 扩展图标，打开侧边栏。
3. 阅读带时间戳的字幕：中文字幕直接显示，外语字幕自动翻译为简体中文，点击任意一行即可让播放器跳转到对应位置。
4. 可以随意切换视频选集，面板会跟随你选中的分 P。
5. 如果视频没有字幕且你已启用兜底功能，点击 **转写音频**。
6. 打开 **Overview**，查看 AI 生成的章节和重点引用。
7. 选中字幕，获取 AI 内容讲解。
8. 从播放器或重点引用中保存笔记，之后可以在 **Notes** 中查看。

## 当前支持范围

- Chrome 116 或更高版本。
- 标准的 `bilibili.com/watch` 视频页面。
- 来自 B 站自带 CC 与 AI 字幕轨的字幕。优先中文字幕（CC 优先于 `ai-zh`），外语字幕翻译为简体中文。
- 带时间戳的完整字幕，支持点击跳转、页内搜索、复制和导出。
- AI 概览、选中文本讲解、翻译和自动润色笔记。
- 语音转写兜底：为完全没有字幕轨的视频服务，需要你打开开关并点击 **转写音频**。
- 本地笔记，以及最近字幕、概览和翻译的本地缓存。
- 发布版本的所有 AI 功能都使用 DeepSeek V4 Flash。其他服务需要修改本地代码，不属于发布版本的支持范围。

选集分 P 通过地址栏识别，因此切换选集会重新加载正确的分 P。Shorts、直播、私密视频、受访问限制的视频，以及既没有字幕也拿不到音频流的视频可能无法使用。目前没有测试 Firefox、Safari、移动浏览器或其他 Chromium 浏览器。

Bilibili Digest 不会请求 B 站生成 AI 字幕，也不会在本地转录音频。唯一的兜底路径是你自己配置的托管转写服务，并且只在你点击时运行。

## 转写成本与限制

转写按音频分钟数由你选择的服务商计费。Bilibili Digest 不收款、不转售服务，也绝不会自行启动转写：

- 面板会先把估算放在按钮上（**转写音频（约 N 分钟）**），让你在知道花费的前提下决定。
- 预检会先算出音频时长和大小，之后再开始下载。
- 超过你配置上限的音频会在上传之前被拒绝，而不是传完之后失败。
- 结果按视频分 P 缓存，再次打开同一分 P 不会产生任何费用。

下载音频并上传给你服务商的耗时与视频长度成正比：使用较快的模型时，大约每 10 到 20 分钟音频需要 1 分钟处理时间。面板会显示当前进行到哪一步。

内置服务及其 Key 页面：

| 服务 | 接口地址 | Key 页面 |
| --- | --- | --- |
| 硅基流动 | `https://api.siliconflow.cn/v1` | [cloud.siliconflow.cn](https://cloud.siliconflow.cn/account/ak) |
| OpenAI | `https://api.openai.com/v1` | [platform.openai.com](https://platform.openai.com/api-keys) |
| Groq | `https://api.groq.com/openai/v1` | [console.groq.com](https://console.groq.com/keys) |

使用前请查看各服务商的最新价格。DeepSeek 的额度与转写额度分开计算，两个账号分别由各自的服务商计费。

## DeepSeek V4 Flash 价格

截至 2026 年 8 月 27 日，DeepSeek 官方[价格页面](https://api-docs.deepseek.com/quick_start/pricing/)列出的每 100 万 token 美元价格如下：

| Token 类型 | 非高峰 | 高峰 |
| --- | ---: | ---: |
| 缓存命中输入 | $0.007 | $0.014 |
| 缓存未命中输入 | $0.22 | $0.44 |
| 输出 | $0.66 | $1.32 |

高峰时段为周一至周五 UTC 01:00–04:00 和 06:00–10:00，其他时间使用非高峰价格。

一个实测的 20 分钟英文视频使用约 **32,600 个输入 token**，并在 43 个小批次中产生约 **3,500 到 4,500 个输出 token**。按当前价格，完整翻译该视频的费用约为：

- **非高峰：$0.003 到 $0.010 USD**。
- **高峰：$0.005 到 $0.020 USD**。

低值假设大部分重复输入命中 DeepSeek 缓存，高值假设输入未命中缓存。翻译按需执行并复用缓存，只翻译部分视频时费用会更低。使用前请查看官方页面确认最新价格。

## 用编程 Agent 改造成自己的版本

这是一个个人 Remix 项目，不接受上游 Issue 或 Pull Request。如果功能出错，或者你想增加新功能，请下载或 Fork 自己的副本，再让你的编程 Agent 帮你修复、改造和个性化。

Bilibili Digest 使用原生 HTML、CSS 和 JavaScript，没有构建步骤，很适合用编程 Agent 做个人项目。你可以尝试：

- 增加更多翻译语言，并让每个人选择自己的学习语言。
- 为课程、访谈、教程、测评或研究视频增加自定义总结模板。
- 增加生词本，保存单词、原句、解释和视频时间戳。
- 把笔记和生词导出到 Markdown、CSV、Anki 或其他学习工具。
- 增加个人主题筛选，只突出与你目标相关的章节。
- 把语音转写放到本机运行（例如通过 WebGPU 运行 Whisper），让音频不再离开电脑，作为托管兜底的替代方案。
- 改善键盘操作、字体大小和高对比度等无障碍体验。

请让 Agent 保留用户自带 API Key 的模式，不要把秘密写入源代码，并运行下方检查。分享自己的版本前，也要在真实视频上测试。

如果想使用其他 AI 服务或模型，请先在编程 Agent 中打开 Chrome 通过“加载已解压的扩展程序”使用的那个准确的 Bilibili Digest 项目文件夹。然后打开 Bilibili Digest 设置并点击 **Copy customization prompt**。发送前替换 `[PROVIDER]` 和 `[MODEL]`，但不要加入任何 API Key。Agent 完成本地代码修改后，请你自己在它指出的设置位置填写 Key。

## 隐私和数据流向

Bilibili Digest 会直接从扩展向服务商发送请求：

1. 通过 B 站自己的接口、使用你的 bilibili 登录状态读取字幕。没有任何第三方服务会收到视频或字幕。
2. 如果你请求了转写，扩展会从 B 站的音频 CDN 下载该分 P 的音轨，再上传给你配置的转写接口。
3. 当你使用 AI 功能时，把字幕和相关视频信息发送给 DeepSeek。
4. 翻译或讲解等功能只发送当前需要的内容，例如选中的文本和上下文，或少量字幕分段。
5. API Key、设置、笔记和最近缓存保存在 Chrome 本地。

Bilibili Digest 没有账号系统、广告、分析统计或行为追踪。你的转写服务商和 DeepSeek 仍会按照各自的条款和隐私政策处理数据。详情请查看 [PRIVACY.md](PRIVACY.md)。

## 常见问题

### bilibili 视频页面没有显示 Digest 按钮

- 在 `chrome://extensions` 中找到 Bilibili Digest，点击“重新加载”，然后刷新 bilibili 页面。
- 确认当前页面是标准 `https://www.bilibili.com/watch?...` 页面，而不是 Shorts、嵌入页面或直播页面。
- 当前版本会在 bilibili 响应式操作栏变化时自动重新定位按钮。页面加载完成后可以稍等片刻。
- 如果你使用的是较早下载的版本，可以先横向调整一次 bilibili 窗口宽度让按钮出现，然后下载最新版，这样之后不再需要调整窗口。
- 如果按钮仍然没有出现，让你的编程 Agent 在这个具体视频页面检查 content script。

### 侧边栏无法打开

- 确认你打开的是标准 `https://www.bilibili.com/watch?...` 页面。
- 在 `chrome://extensions` 中确认 Bilibili Digest 已启用，并点击“重新加载”。
- 重新加载扩展后，刷新 bilibili 页面。
- 如果问题仍然存在，让你的编程 Agent 检查扩展。

### Bilibili Digest 提示需要设置

- 打开 **Settings**，保存 DeepSeek Key。这是唯一必需的 Key。
- 发布版本固定使用 DeepSeek V4 Flash，没有需要填写的 AI Base URL 或 Model 字段。
- 如果设置提示旧的自定义服务已移除，请重新填写 DeepSeek Key。旧 AI Key 已安全清除，避免被错误用于 DeepSeek。

### 找不到字幕

- 确认视频是公开的，并且在当前 Chrome 个人资料中已登录 bilibili.com，因为 B 站的字幕轨需要登录状态才会返回。
- 有些视频确实没有任何字幕轨。此时面板会显示 **No subtitle found**，并说明具体情况。
- 如果你已启用语音转写兜底，这个界面还会给出 **转写音频（约 N 分钟）** 按钮，只有点击后才会开始。
- 如果看不到转写按钮，说明兜底开关未打开、没有填写 Key，或 Chrome 还没有获得该接口地址的访问权限。请打开设置，检查开关与 Key，然后重新保存一次。

Bilibili Digest 不会请求 B 站生成 AI 字幕，唯一的转写路径就是你自己配置的托管服务。

### 转写失败

- **Transcription is not ready**：开关未打开、Key 缺失，或接口权限未授予。请打开设置重新保存。
- **Transcription needs permission**：Chrome 拒绝了该接口地址。请再次保存设置页，并在弹窗中选择 **允许**。
- **Audio too long to transcribe**：该分 P 超过了你配置的上限。请在设置中调大（1 到 100 MB），或改选较短的分 P。
- **Key 被拒绝**：服务商认为凭证无效。请检查 Key 以及该服务商账号的余额。
- **无法下载该视频音频**：音频 CDN 拒绝了请求。可以在 `chrome://extensions` 重新加载扩展后重试；如果仍然失败，可能是该视频的音频流对当前登录状态或地区不可用。

### AI 请求失败

- `401` 或 `403` 通常表示 DeepSeek Key 或账号权限有问题。
- `429` 通常表示达到了 DeepSeek 服务限速或消费上限。
- 确认 Key 来自上方链接的 DeepSeek 开放平台账号，并且账号有可用额度。
- 如果你把本地副本改成了其他模型，请再次使用设置中的自定义 prompt，让编程 Agent 检查本地实现。

不要在对话、截图或日志中分享 API Key、私密字幕或个人笔记。

## 给编程 Agent 的检查命令

修改项目后，让你的编程 Agent 运行：

```bash
npm test
npm run check
npm run package
```

Agent 还应该在 Chrome 中重新加载扩展，并测试多个真实 bilibili 视频。自动检查通过，不代表真实服务请求和 bilibili 交互一定正常。

## 开源许可

MIT，详见 [LICENSE](LICENSE)。
