# Privacy

Effective: July 28, 2026

Bilibili Digest is a GitHub-only, bring-your-own-key Chrome extension. It has no Bilibili Digest account, developer-operated backend, analytics, advertising, or telemetry.

## Data the extension handles

Depending on the feature you use, Bilibili Digest handles:

- the canonical URL and video ID of the active bilibili video;
- transcript text and timestamps;
- video metadata such as title, channel, description, and duration;
- text you select in the transcript and nearby transcript context;
- transcript context around a timestamped note;
- content you ask to translate;
- notes you save;
- DeepSeek and transcription-service configuration, including API keys; and
- cached transcript, digest, and translation results.

If you switch on the speech-to-text fallback and click **Transcribe audio**, it also handles the video's audio track.

## Where data goes

### Bilibili

Subtitles are fetched from bilibili's own CC/AI caption tracks through bilibili's API (see the README). No third-party service is involved. The extension sends your bilibili cookies only to `bilibili.com` and `api.bilibili.com`, and it reads the active tab's URL to identify the video.

### Transcription service (optional, off by default)

Only when you switch on **Enable speech-to-text fallback** and click **Transcribe audio** on a video with no subtitle track:

- the extension downloads that video part's DASH audio track from bilibili's own audio CDN (`*.bilivideo.com`), and
- it uploads the audio file to the OpenAI-compatible endpoint you configured, authenticated with your key.

That audio leaves your machine. The default endpoint is `https://api.siliconflow.cn/v1/audio/transcriptions`; OpenAI, Groq, or any custom endpoint you enter are alternatives. Bilibili Digest sends nothing to a transcription service while the fallback is off, and nothing at all without your click. Provider-side retention is governed by that provider's own terms.

To reach a third-party endpoint, the extension needs host permission for it. Those origins are not granted at install time: Chrome asks when you save the setting, and only for the endpoint you entered.

### DeepSeek

The published version sends AI feature content to DeepSeek V4 Flash at `https://api.deepseek.com`:

- transcript plus relevant title, channel, description, or duration for an overview;
- selected text plus nearby transcript context for an explanation;
- small semantic transcript batches currently needed for progressive Chinese
  translation, or requested overview or explanation content;
- nearby transcript context and video metadata when polishing a saved note.

The endpoint and `deepseek-v4-flash` model are fixed in the published Settings page. You provide one DeepSeek API key. To use another provider or model, you must adapt your own local source copy and its permissions. The Settings page provides a coding-agent prompt for that purpose and warns you never to include an API key in the prompt or chat.

Requests go directly from the extension to your transcription service or to DeepSeek. They are authenticated with the keys you supply. Bilibili Digest's developer does not proxy or receive these requests.

Those services process data under their own terms, privacy policies, retention practices, and account settings. Do not send confidential, personal, or regulated content unless their terms and your obligations permit it.

## Local storage and retention

Bilibili Digest uses Chrome's local extension storage, not a Bilibili Digest cloud service.

- DeepSeek and transcription settings and API keys remain on the device in Chrome's extension storage.
- Saved notes remain until you delete them or remove/clear the extension's data. The extension keeps up to 100 notes.
- Recent transcript, digest, and per-segment translation cache entries are stored
  locally. The cache is limited to 20 videos, and entries older than 30 days are
  removed when the side panel opens.

Chrome extension storage is not a password vault. Anyone with sufficient access to your browser profile or device may be able to recover locally stored keys or content. Use scoped keys where providers support them, set spending limits, and rotate or revoke a key if the device or browser profile is compromised.

To remove data:

- delete individual saved notes in Bilibili Digest;
- use the Options page to clear cached digests, delete all notes, or reset all extension data;
- remove the extension or clear its stored data from Chrome to delete all local settings, keys, notes, and cache entries; and
- revoke keys in the DeepSeek or transcription-provider dashboard to stop their future use.

Clearing local data does not delete information already processed or retained by DeepSeek or your transcription provider. Use each service's controls for service-side requests.

## Permissions

Bilibili Digest uses Chrome permissions for these purposes:

- `sidePanel`: display the Bilibili Digest interface beside bilibili.
- `storage`: store settings, keys, notes, and cached results locally.
- `tabs` and `webNavigation`: identify the active bilibili tab and notice when you switch playlist parts.
- `scripting`: coordinate the extension's bilibili page controls.
- `cookies`: read your bilibili login state so bilibili-gated subtitle tracks become available.
- `declarativeNetRequestWithHostAccess`: set one request header, `Referer: https://www.bilibili.com/`, on media requests to `bilivideo.com`. The audio CDN answers `403` without it, so the extension cannot download audio for transcription otherwise, and the value is byte for byte the referer the bilibili player already sends for its own media requests. The rule is installed only while a transcription is running, and it changes no other header, origin, or request.
- bilibili host access: read the active video's URL and metadata and provide timestamp controls.
- DeepSeek host access: provide AI overviews, explanations, translation, and note polishing through DeepSeek V4 Flash.
- Transcription host access, granted on demand: send audio to the endpoint you configured, and only that endpoint. It is never part of the install-time permission set.

Bilibili Digest does not use these permissions to monitor general browsing activity.

## No sale or advertising use

Bilibili Digest does not sell personal information, build advertising profiles, or share data with data brokers. It does not include analytics SDKs.

## Changes

Privacy-relevant changes will be documented in this file and in the repository history. Review updates before installing a new version.

## Questions

This repository does not provide a public support or issue channel. Review this policy, the source code, and each provider's documentation before using the extension. For a vulnerability or accidental secret exposure, follow the private process in [SECURITY.md](SECURITY.md).
