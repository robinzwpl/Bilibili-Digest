# Bilibili Digest

[English](README.md) | [简体中文](README.zh-CN.md)

> **Note:** This project is derived from [youtube-digest](https://github.com/zarazhangrui/youtube-digest) v1.2.0 by [zarazhangrui](https://github.com/zarazhangrui). It has been adapted to work with bilibili videos — the original YouTube transcript source is replaced with bilibili's own CC/AI subtitle tracks.

Turn every bilibili video into a resource for deep learning. Bilibili Digest brings transcripts, bilingual translation, AI overviews, explanations, and timestamped notes into one Chrome side panel, so you can study ideas and language without losing your place.

- Turn captions into a readable, searchable learning resource.
- Learn languages with the original transcript, a Simplified Chinese translation, or an aligned bilingual view.
- Build understanding with an AI overview, chapters, key quotes, and selected-text explanations.
- Navigate long videos by clicking timestamps in the transcript, overview, or notes.
- Save polished timestamped notes for later study.
- Keep control of your data with your own API keys, local Chrome storage, and no analytics or telemetry.

Bilibili Digest is a bring-your-own-key project installed locally from GitHub. It is not available through the Chrome Web Store, does not include API credits, and does not run a developer-operated server.

## New in v1.4.0

- Speech-to-text fallback for videos that have no subtitle track at all. Off by default, no extra install-time permission, and it only ever runs from the **Transcribe audio** button.
- Audio is pulled straight from bilibili's DASH stream and uploaded to the hosted transcription service you pick (SiliconFlow preset, OpenAI, Groq, or any OpenAI-compatible endpoint).
- The transcript it produces is cached and shaped like any other, so overviews, notes, search, click-to-seek, and selection explanations all work on transcribed videos too.
- Reported up front: audio length, size, and the configured ceiling, so a video that is too long is refused before anything is downloaded.
- Timestamps stay exact on Whisper-style models; text-only models still work with estimated timings, and the transcript says which you got.

## New in v1.3.0

- Switching between episodes in a video playlist now reloads the panel with the selected part, instead of keeping the previous part on screen.
- Search transcript words or phrases and move through every match.
- Use one Original, Chinese, or bilingual setting across Transcript, Overview, and Notes. New videos stay in Original by default.
- Translate visible Overview and Notes content progressively in small cached batches.
- Explain selected transcript text or save it directly as a timestamped note.
- Keep your transcript position across navigation, with the panel closing automatically outside bilibili video pages.

## Install with your coding agent

You do not need to understand the code or use the command line. Send this message to your coding agent:

> Download or clone this project into a permanent folder I choose, tell me its exact full path, and use that same folder for Chrome's Load unpacked step. If I need a suggestion during this first installation, offer `~/Documents/bilibili-digest` on macOS or Linux, or `%USERPROFILE%\Documents\bilibili-digest` on Windows, but do not assume either path. Walk me through installation and setup in simple terms. https://github.com/robinzwpl/Bilibili-Digest

Your agent should:

1. Ask where you want to keep the project, download or clone it there, and tell you the exact full path. If you want a suggestion, it can offer `~/Documents/bilibili-digest` on macOS or Linux, or `%USERPROFILE%\Documents\bilibili-digest` on Windows.
2. Open the official DeepSeek page below and help you create your own account (plus a transcription provider page if you want the speech-to-text fallback).
3. Walk you through selecting the exact project folder you chose in Chrome with **Load unpacked**.
4. Show you where to enter your API keys in the extension's **Settings** page.
5. Open a bilibili video with captions and confirm the transcript and translation work.

Keep this folder in the same place after installation. If you move or delete it, Chrome's unpacked extension stops working until you load the extension again from its new permanent folder.

Never paste an API key into an AI chat, source file, screenshot, or public message. Enter keys yourself, directly in the Bilibili Digest Settings page. Your coding agent can point to the correct field without seeing the key.

## Install manually

If you prefer to do it yourself:

1. Open [github.com/robinzwpl/Bilibili-Digest](https://github.com/robinzwpl/Bilibili-Digest).
2. Choose **Code**, then **Download ZIP**.
3. Choose a permanent folder and unzip the project there. Optional suggestions are `~/Documents/bilibili-digest` on macOS or Linux, or `%USERPROFILE%\Documents\bilibili-digest` on Windows. You may use a different folder.
4. In Chrome, open `chrome://extensions`.
5. Turn on **Developer mode**.
6. Click **Load unpacked**.
7. Select the exact project folder you chose, which must contain `manifest.json`.
8. Pin Bilibili Digest from Chrome's Extensions menu if you want quick access.

Because this is an unpacked extension, it does not update automatically. After downloading an update or changing local files, click **Reload** on the Bilibili Digest card at `chrome://extensions`, then refresh open bilibili tabs. Moving or deleting the source folder breaks the unpacked extension until you load it again from the new location.

## Set up your API keys

Bilibili Digest uses your own provider accounts. Only one key is required:

1. A **DeepSeek API key** for overviews, explanations, translation, and automatic note polishing.
2. A **transcription API key** (optional) only if you want the speech-to-text fallback for videos that have no subtitle track at all.

Transcripts themselves need no key: they come from bilibili's own caption tracks.

### Subtitle source

Subtitles come from bilibili's own caption tracks:

- The extension fetches CC subtitles and AI subtitles through bilibili's official API chain (`x/web-interface/view` → `x/player/wbi/v2` → subtitle CDN).
- No third-party API key is required for subtitles; you only need to be logged in to bilibili.com in this Chrome profile.
- Chinese CC subtitles and AI Chinese subtitles (`ai-zh`) are shown directly; foreign subtitles are auto-translated to Simplified Chinese.

### Speech-to-text fallback (optional)

Some videos carry no subtitle track of any kind. Bilibili Digest can cover those by downloading the video's audio and sending it to a hosted transcription service that you choose and pay for. It is off by default, asks for no extra permission until you switch it on, and only ever runs when you click **Transcribe audio**.

1. Get an API key from a supported service. [SiliconFlow](https://cloud.siliconflow.cn/account/ak) is preset because it is reachable from mainland China. OpenAI and Groq are preset too, and any OpenAI-compatible `/audio/transcriptions` endpoint works.
2. Open Bilibili Digest Settings and turn on **Enable speech-to-text fallback**.
3. Paste the key, pick a model, and save. Chrome then asks for permission to call that single endpoint. Allow it.
4. Open a video with no subtitles. The panel offers **Transcribe audio (about N min)**. Nothing runs until you click it.

The model you pick decides how good the timestamps are:

- `whisper-large-v3`, `whisper-1`, and `whisper-large-v3-turbo` return per-segment timings, so click-to-seek stays exact.
- `FunAudioLLM/SenseVoiceSmall` and other text-only models are cheaper and faster, but their timings are estimated by spreading the sentences across the audio length. The panel says so above the transcript.

Audio is capped at 24 MB by default, adjustable from 1 to 100 MB. Long videos produce larger audio files, so raise the cap or transcribe a shorter part.

### Get a DeepSeek API key

1. Open the official [DeepSeek API Keys page](https://platform.deepseek.com/api_keys).
2. Sign in or create a DeepSeek Platform account when prompted.
3. Choose **Create new API key**, give it a recognizable name such as `Bilibili Digest`, and create it.
4. Copy the key immediately. The full key may only be shown once.
5. Paste it into **DeepSeek API key** in Bilibili Digest Settings.
6. If DeepSeek reports insufficient balance, add credit in your DeepSeek Platform account and try again.

See the [official DeepSeek API documentation](https://api-docs.deepseek.com/) for current account and API details.

Open **Settings** from the side panel. You can also open the Bilibili Digest **Options** page from its card at `chrome://extensions` or by right-clicking its toolbar icon. Paste keys only into these Settings fields. Never paste a key into an AI chat, repository file, screenshot, or public message.

The published version supports DeepSeek V4 Flash as its only AI provider:

```text
Base URL: https://api.deepseek.com
Model: deepseek-v4-flash
```

Bilibili Digest sends every DeepSeek request in non-thinking mode for responsive, predictable interactions. The endpoint and model are fixed in Settings, so the only AI credential you enter is your DeepSeek API key. To use another provider or model, copy the safe customization prompt in Settings and give it to a coding agent for your local copy. Never add an API key to that prompt or chat.

Keys and settings are stored in Chrome's local extension storage on your device. Release builds do not include or use `config.js`.

## Use Bilibili Digest

1. Open a standard bilibili watch page.
2. Click the Bilibili Digest extension icon to open the side panel.
3. Read the timestamped transcript. Chinese captions show as-is; foreign captions are translated to Simplified Chinese; click any line to jump the player to it.
4. Switch playlist episodes freely. The panel follows the part you selected.
5. If the video has no captions and you enabled the fallback, click **Transcribe audio**.
6. Open **Overview** when you want AI-generated chapters and key quotes.
7. Select transcript text when you want an AI explanation.
8. Save a note from the player or a key quote, then revisit it from **Notes**.

## What works today

- Google Chrome 116 or newer, using the Side Panel API.
- Standard `bilibili.com/watch` video pages.
- Subtitles from bilibili's own CC and AI caption tracks. Chinese tracks (CC first, then `ai-zh`) are preferred; foreign tracks are translated to Simplified Chinese.
- Full transcript with click-to-seek, in-page search, copy, and export.
- AI overviews, selected-text explanations, translation, and automatic note polishing.
- Speech-to-text fallback for videos with no subtitle track, when you switch it on and click **Transcribe audio**.
- Local notes and a local cache for recent transcript and digest results.
- DeepSeek V4 Flash for all published AI features. Other providers require a local code adaptation and are not supported by this published version.

Playlist parts are tracked from the URL, so switching episodes reloads the right part. Shorts, live streams, private or access-restricted videos, and videos with neither captions nor an available audio stream may not work. Firefox, Safari, mobile browsers, and other Chromium browsers are not currently tested or supported.

Bilibili Digest never generates bilibili AI subtitles and never performs local audio transcription. The only fallback is the hosted transcription service you configure, and it runs only on your click.

## Transcription cost and limits

Transcription is billed by the provider you chose, per minute of audio. Bilibili Digest does not collect payments or resell access, and it never starts a transcription on its own:

- The panel shows the estimate first (**Transcribe audio (about N min)**), so you decide with the cost in view.
- The pre-flight resolves the audio length and size before anything is downloaded.
- Audio over your configured ceiling is refused before the upload, not after.
- Results are cached per video part, so re-opening a transcribed video costs nothing.

Downloading audio and uploading it to your provider takes time that scales with video length: roughly a minute of processing for every ten to twenty minutes of audio with a fast model. The panel shows which step is running.

Preset services and their key pages:

| Service | Endpoint | Key page |
| --- | --- | --- |
| SiliconFlow | `https://api.siliconflow.cn/v1` | [cloud.siliconflow.cn](https://cloud.siliconflow.cn/account/ak) |
| OpenAI | `https://api.openai.com/v1` | [platform.openai.com](https://platform.openai.com/api-keys) |
| Groq | `https://api.groq.com/openai/v1` | [console.groq.com](https://console.groq.com/keys) |

Check each provider's current prices before relying on them. DeepSeek usage is separate from transcription usage, and both accounts are billed by their own provider.

## DeepSeek V4 Flash pricing

As of August 27, 2026, DeepSeek lists these USD prices per 1 million tokens on its official [pricing page](https://api-docs.deepseek.com/quick_start/pricing/):

| Token type | Off-peak | Peak |
| --- | ---: | ---: |
| Cache-hit input | $0.007 | $0.014 |
| Cache-miss input | $0.22 | $0.44 |
| Output | $0.66 | $1.32 |

Peak hours are 01:00–04:00 and 06:00–10:00 UTC, Monday through Friday. All other hours use off-peak rates.

A measured 20-minute English talk used about **32,600 input tokens** and an estimated **3,500 to 4,500 output tokens** across 43 small translation batches. At current prices, translating the full video costs approximately:

- **Off-peak: $0.003 to $0.010 USD**.
- **Peak: $0.005 to $0.020 USD**.

The lower end assumes most repeated input hits DeepSeek's cache. The upper end assumes cache misses. Translation is lazy and cached, so translating only part of a video costs less. Check the official page before relying on these prices.

## Remix it with your coding agent

This is a personal remix project. Upstream issues and pull requests are not accepted. If something breaks or you want a new feature, download or fork your own copy and ask your coding agent to fix, remix, or personalize it for you.

Bilibili Digest uses plain HTML, CSS, and JavaScript with no build step, so it is a friendly starting point for agent-assisted projects. Ideas to try:

- Add more translation languages and let each person choose a learning language.
- Create customized summary templates for lectures, interviews, tutorials, reviews, or research talks.
- Build a vocabulary notebook that saves a word, its sentence, meaning, and video timestamp.
- Export notes and vocabulary to Markdown, CSV, Anki, or another study tool.
- Add personal topic filters that highlight the chapters most relevant to a goal.
- Run speech-to-text on the machine itself (for example Whisper through WebGPU) so the audio never leaves it, as an alternative to the hosted fallback.
- Improve accessibility with keyboard navigation, font controls, and higher-contrast themes.

Ask your agent to preserve the bring-your-own-key model, keep secrets out of source files, run the checks below, and test the remix on real videos.

If you want another AI provider or model, first open the exact Bilibili Digest project folder that Chrome loaded through **Load unpacked** in your coding agent. Then open Bilibili Digest Settings and use **Copy customization prompt**. Replace the `[PROVIDER]` and `[MODEL]` placeholders before sending it. Do not include any API key in the prompt or chat. After the agent updates your local copy, enter the key yourself in the Settings field it identifies.

## Privacy and data flow

Bilibili Digest makes provider requests directly from the extension:

1. It reads captions from bilibili's own API with your bilibili session. No third-party service receives the video or its subtitles.
2. If you asked for a transcription, it downloads the video part's audio from bilibili's CDN and uploads it to the transcription endpoint you configured.
3. It sends the transcript and relevant video metadata to DeepSeek when you request AI features.
4. Focused features send only the content they need, such as selected text with context or small transcript batches for translation.
5. It stores keys, settings, notes, and recent cache entries locally in Chrome.

There is no Bilibili Digest account system, advertising, analytics, or telemetry. Your transcription provider and DeepSeek still receive data under their own terms and privacy policies. See [PRIVACY.md](PRIVACY.md) for details.

## Troubleshooting

### The Digest button is missing on a bilibili video

- At `chrome://extensions`, find Bilibili Digest and click **Reload**, then refresh the bilibili tab.
- Confirm that you are on a standard `https://www.bilibili.com/watch?...` page, not a Short, embed, or live page.
- The current version automatically follows bilibili when its responsive action bar changes. Wait a moment after the page finishes loading.
- If you have an older downloaded copy, resizing the bilibili window horizontally once may reveal the button. Then download the latest version so resizing is no longer required.
- If it is still missing, ask your coding agent to inspect the content script on that exact video page.

### The side panel does not open

- Confirm that you are on a standard `https://www.bilibili.com/watch?...` page.
- At `chrome://extensions`, confirm Bilibili Digest is enabled and click **Reload**.
- Refresh the bilibili tab after reloading the extension.
- Ask your coding agent to inspect the extension if the problem continues.

### Bilibili Digest asks for setup

- Open **Settings** and save a DeepSeek key. That is the only required key.
- This published version uses the fixed DeepSeek V4 Flash endpoint and model. There are no Base URL or Model fields to configure for AI.
- If Settings says a legacy custom provider was removed, enter a DeepSeek key. The old AI key was cleared so it could not be reused with the wrong service.

### No transcript is found

- Confirm the video is public and that you are logged in to bilibili.com in this Chrome profile, because bilibili gates subtitle tracks behind the login state.
- Some videos genuinely have no caption track. The panel then says **No subtitle found** and explains the position.
- If you enabled the speech-to-text fallback, that screen also offers **Transcribe audio (about N min)**. Nothing happens until you click it.
- If the transcription button is missing, the fallback is switched off, has no key, or Chrome has not been granted access to the endpoint yet. Open Settings, check the switch and the key, and save once more.

Bilibili Digest never generates bilibili AI subtitles, and the only transcription path is the hosted service you configure yourself.

### Transcription failed

- **Transcription is not ready**: the switch is off, the key is missing, or the endpoint permission was not granted. Open Settings and save again.
- **Transcription needs permission**: Chrome blocked the endpoint. Save the Settings page once more and choose **Allow** in the prompt.
- **Audio too long to transcribe**: the part is larger than your configured ceiling. Raise it in Settings (1 to 100 MB) or transcribe a shorter part.
- **A rejected key**: the provider refused the credential. Check the key and the account balance in that provider's dashboard.
- **Could not download this video's audio**: the audio CDN rejected the request. Try again after reloading the extension at `chrome://extensions`; if it persists, the video's audio stream may not be available to logged-out or region-restricted sessions.

### AI requests fail

- A `401` or `403` usually means the DeepSeek key or account access is invalid.
- A `429` usually means a DeepSeek rate or spending limit was reached.
- Confirm the key was created in the DeepSeek Platform account linked above and that the account has available credit.
- If you adapted a local copy for another model, use the Settings customization prompt again and ask your coding agent to inspect that local implementation.

Never share API keys, private transcripts, or personal notes in chats, screenshots, or logs.

## Build the release ZIP

The source folder loads directly into Chrome as an unpacked extension, so you normally do not need to build anything. If you want a shareable `.zip` (for a GitHub Release, for example):

1. Install Node.js and a `zip` command.
2. Run:

```bash
npm run package
```

The script packages the release allowlist into `dist/bilibili-digest-v<version>.zip` (the version comes from `manifest.json`). Unzip it, then load the folder through Chrome's **Load unpacked** step as usual.

## Checks for coding agents

Ask your coding agent to run these commands after changing the project:

```bash
npm test
npm run check
npm run package
```

The agent should also reload the unpacked extension in Chrome and test several real bilibili videos. Automated checks do not prove that live provider requests and bilibili interactions work.

## License

MIT. See [LICENSE](LICENSE).
