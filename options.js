const YTD_OPTIONS = (() => {
  const LANGUAGE_STORAGE_KEY = "ytd_options_language";
  const PREVIEW_STORAGE_PREFIX = "bilibiliDigestPreview:";
  const SUPPORTED_LANGUAGES = new Set(["en", "zh-CN"]);

  const COPY = {
    en: {
      pageTitle: "Bilibili Digest Settings",
      languageGroupLabel: "Interface language",
      heading: "Bring your own API keys",
      lede:
        "Keys stay in this Chrome profile and are sent only to DeepSeek. This open-source extension has no developer server or analytics.",
      transcriptProvider: "Subtitle source",
      supadataApiKeyLabel: "Supadata API key",
      supadataHelp: "Subtitles come from bilibili's own CC and AI caption tracks. No API key is needed. ",
      supadataLink: "Open bilibili.com",
      supadataHelpSuffix:
        ". Supadata generates the key during onboarding.",
      asrHeading: "Speech to text (optional)",
      asrIntro:
        "Some bilibili videos have no subtitle track at all. With this on, Bilibili Digest can download the audio and send it to a hosted transcription service you choose. It only ever runs when you click the button, and never at all while this switch is off.",
      asrEnableLabel: "Enable speech-to-text fallback",
      asrProviderLabel: "Transcription service",
      asrHintSiliconflow:
        "OpenAI-compatible endpoint at api.siliconflow.cn, reachable from mainland China.",
      asrHintOpenai:
        "Whisper endpoints at api.openai.com. Needs network access outside mainland China.",
      asrHintGroq:
        "Fast Whisper endpoints at api.groq.com. Needs network access outside mainland China.",
      asrHintCustom: "Any OpenAI-compatible /audio/transcriptions endpoint.",
      asrApiKeyLabel: "Transcription API key",
      asrModelLabel: "Model",
      asrBaseUrlLabel: "Endpoint",
      asrMaxMbLabel: "Largest audio to transcribe (MB)",
      asrTimestampHint:
        "Models that return timings (whisper-1, whisper-large-v3) keep click-to-seek exact. Models that return plain text still work, but their timings are estimated from the audio length.",
      asrPrivacyNote:
        "While this is on, clicking Transcribe audio sends that video's audio to the service above. Overviews, notes and explanations still go to DeepSeek. Review the provider's terms and pricing first.",
      asrAddKey: "Add a transcription API key, or turn the fallback off.",
      asrPermissionDenied:
        "Chrome blocked access to that endpoint, so transcription cannot run yet. Save again and choose Allow in the prompt.",
      aiProvider: "AI provider",
      providerSummaryLabel: "Supported AI provider",
      providerBadge: "Supported in this version",
      deepseekApiKeyLabel: "DeepSeek API key",
      deepseekHelp:
        "Bilibili Digest uses DeepSeek V4 Flash for overviews, explanations, translation, and note polishing. ",
      deepseekLink: "Create a DeepSeek API key",
      deepseekHelpSuffix: ".",
      privacyNote:
        "When you use AI features, DeepSeek receives the video transcript and relevant video context. Review DeepSeek's terms and pricing before saving.",
      saveSettings: "Save settings",
      localRemix: "Local remix",
      customizationTitle: "Want to use another AI model?",
      customizationPurpose: "Edit and copy a safe prompt for your coding agent",
      agentBadge: "Coding agent ready",
      customizationIntro:
        "You can edit the prompt directly. Complete these three steps before copying:",
      customizationStepFolder:
        "Open the extracted Bilibili Digest project folder in your coding agent.",
      customizationStepReplace:
        "Replace [PROVIDER] and [MODEL] with the service and model you want to use.",
      customizationStepKeys:
        "Never include API keys in the prompt or chat. Enter them yourself after the code is ready.",
      customizationPromptLabel: "Editable customization prompt",
      customizationReminderLabel: "Prompt reminder",
      customizationReminder:
        "Before copying, replace [PROVIDER] and [MODEL] with the provider and model you want to use.",
      customizationPrompt:
        "Customize this local Bilibili Digest workspace to use [PROVIDER] with [MODEL]. Work only in the current workspace. Before editing, verify that it contains manifest.json and that the manifest name is Bilibili Digest. If verification fails, stop and ask me to open the extracted Bilibili Digest project folder in my coding agent. Do not search other folders, edit a guessed copy, assume an installation path, or claim Chrome can reveal the absolute OS source path. Update the provider's API endpoint, request format, and minimum Chrome host permissions. Preserve bring-your-own-key and local Chrome storage. Never put API keys in source code, commits, logs, screenshots, this prompt, or chat; after the code is ready, tell me where to enter the key myself. Keep DeepSeek-only request fields and retry behavior isolated to DeepSeek. Handle provider-specific rules separately so one provider does not affect another. Update README.md, README.zh-CN.md, PRIVACY.md, SECURITY.md, and tests. Run npm test, npm run check, and npm run package. Then explain how to reload the unpacked extension and test it on a real bilibili video.",
      copyCustomizationPrompt: "Copy edited prompt",
      localData: "Local data",
      localDataHelp:
        "Digests, translations, and notes are stored only in this Chrome profile. You can remove them at any time.",
      clearCache: "Clear cached digests",
      deleteNotes: "Delete all notes",
      resetData: "Reset extension data",
      footer:
        'Read <a href="PRIVACY.md" target="_blank">PRIVACY.md</a> in the repository for the complete data-flow description.',
      migrationWarning:
        "Custom provider settings were removed safely. Your Supadata key was kept, but the AI key was cleared. Enter a DeepSeek API key to continue.",
      saving: "Saving…",
      addSupadataKey: "Add a DeepSeek API key.",
      addDeepseekKey: "Add a DeepSeek API key.",
      saved: "Saved. Reopen Bilibili Digest to use these settings.",
      saveFailed: "Could not save settings. Please try again.",
      copying: "Copying…",
      promptCopied: "Edited prompt copied.",
      copyFailed:
        "Could not copy the prompt. Select the prompt text and copy it manually.",
      clearedDigests: ({ count }) =>
        `Cleared ${count} cached digest${count === 1 ? "" : "s"}.`,
      notesDeleted: "Deleted all saved notes.",
      resetConfirm:
        "Delete API keys, cached digests, translations, and saved notes from this Chrome profile?",
      allDataDeleted: "All Bilibili Digest data was deleted.",
      settingsLoadFailed:
        "Could not load saved settings. You can still preview this page.",
    },
    "zh-CN": {
      pageTitle: "Bilibili Digest 设置",
      languageGroupLabel: "界面语言",
      heading: "使用你自己的 API 密钥",
      lede:
        "密钥仅保存在当前 Chrome 个人资料中，只会发送给 DeepSeek。本开源扩展没有开发者服务器，也不使用分析服务。",
      transcriptProvider: "字幕来源",
      supadataApiKeyLabel: "字幕服务",
      supadataHelp: "字幕来自哔哩哔哩自带的 CC 字幕和 AI 字幕，无需 API 密钥。",
      supadataLink: "打开 bilibili.com",
      supadataHelpSuffix: "请在当前 Chrome 个人资料中登录 bilibili.com，以解锁字幕轨。",
      asrHeading: "语音转写（可选）",
      asrIntro:
        "部分 B 站视频完全没有字幕。打开此开关后，Bilibili Digest 可以下载音频，并发送给你指定的托管转写服务。它只会在你点击按钮时运行，开关关闭时完全不会启动。",
      asrEnableLabel: "启用语音转写兜底",
      asrProviderLabel: "转写服务",
      asrHintSiliconflow: "OpenAI 兼容接口 api.siliconflow.cn，国内可直连。",
      asrHintOpenai: "api.openai.com 的 Whisper 接口，需要能访问境外网络。",
      asrHintGroq: "api.groq.com 的快速 Whisper 接口，需要能访问境外网络。",
      asrHintCustom: "任意兼容 OpenAI /audio/transcriptions 的服务地址。",
      asrApiKeyLabel: "转写服务 API 密钥",
      asrModelLabel: "模型",
      asrBaseUrlLabel: "服务地址",
      asrMaxMbLabel: "可转写的最大音频（MB）",
      asrTimestampHint:
        "返回时间戳的模型（whisper-1、whisper-large-v3）能保证点击跳转精确。只返回纯文本的模型同样可用，但时间轴会根据音频总时长估算。",
      asrPrivacyNote:
        "开启后，点击“转写音频”会把该视频的音轨发送给上面的服务。概览、笔记和讲解仍然只发送给 DeepSeek。请先确认该服务的条款与价格。",
      asrAddKey: "请填写转写服务 API 密钥，或关闭该开关。",
      asrPermissionDenied:
        "Chrome 拒绝了该服务地址的访问权限，转写暂时无法运行。请再次保存，并在弹窗中选择“允许”。",
      aiProvider: "AI 服务",
      providerSummaryLabel: "支持的 AI 服务",
      providerBadge: "当前版本支持",
      deepseekApiKeyLabel: "DeepSeek API 密钥",
      deepseekHelp:
        "Bilibili Digest 使用 DeepSeek V4 Flash 生成概览、解释内容、翻译字幕和润色笔记。",
      deepseekLink: "创建 DeepSeek API 密钥",
      deepseekHelpSuffix: "。",
      privacyNote:
        "使用 AI 功能时，DeepSeek 会收到视频字幕及相关视频上下文。保存前请查看 DeepSeek 的服务条款和价格。",
      saveSettings: "保存设置",
      localRemix: "本地改造",
      customizationTitle: "想使用其他 AI 模型？",
      customizationPurpose: "编辑并复制一段可安全交给编程 Agent 的提示词",
      agentBadge: "可交给编程 Agent",
      customizationIntro: "你可以直接编辑提示词。复制前完成以下三步：",
      customizationStepFolder:
        "在编程 Agent 中打开 Bilibili Digest 解压后的项目文件夹。",
      customizationStepReplace:
        "把 [PROVIDER] 和 [MODEL] 替换成你想使用的服务和模型。",
      customizationStepKeys:
        "不要在提示词或聊天中加入 API 密钥。代码准备好后，请自行填写。",
      customizationPromptLabel: "可编辑的自定义提示词",
      customizationReminderLabel: "提示词提醒",
      customizationReminder:
        "复制前，请先把 [PROVIDER] 和 [MODEL] 替换成你想使用的服务和模型。",
      customizationPrompt:
        "请把当前本地 Bilibili Digest 工作区改为使用 [PROVIDER] 提供的 [MODEL]。只在当前工作区中操作。编辑前，先确认其中包含 manifest.json，且 manifest 中的 name 是 Bilibili Digest。如果验证失败，请停止，并让我在编程 Agent 中打开 Bilibili Digest 解压后的项目文件夹。不要搜索其他文件夹，不要编辑猜测的副本，不要假设安装路径，也不要声称 Chrome 可以显示操作系统中的绝对源码路径。更新该服务的 API endpoint、请求格式和最少的 Chrome host permissions。保留用户自带密钥模式和 Chrome 本地存储。不要把 API 密钥写入源代码、提交记录、日志、截图、这段提示词或聊天；代码准备好后，请告诉我应该在哪里自行填写密钥。DeepSeek 专用的请求参数和重试逻辑继续只用于 DeepSeek。新服务的专属规则请单独处理，避免相互影响。更新 README.md、README.zh-CN.md、PRIVACY.md、SECURITY.md 和测试。运行 npm test、npm run check 和 npm run package。最后，说明如何重新加载已解压的扩展，并在真实 bilibili 视频上测试。",
      copyCustomizationPrompt: "复制编辑后的提示词",
      localData: "本地数据",
      localDataHelp:
        "摘要、翻译和笔记仅保存在当前 Chrome 个人资料中。你可以随时删除。",
      clearCache: "清除缓存的摘要",
      deleteNotes: "删除全部笔记",
      resetData: "重置扩展数据",
      footer:
        '完整数据流说明请参阅仓库中的 <a href="PRIVACY.md" target="_blank">PRIVACY.md</a>。',
      migrationWarning:
        "已安全移除自定义服务设置。Supadata 密钥已保留，AI 密钥已清除。请输入 DeepSeek API 密钥以继续使用。",
      saving: "正在保存…",
      addSupadataKey: "请添加 DeepSeek API 密钥。",
      addDeepseekKey: "请添加 DeepSeek API 密钥。",
      saved: "已保存。请重新打开 Bilibili Digest 以使用这些设置。",
      saveFailed: "无法保存设置，请重试。",
      copying: "正在复制…",
      promptCopied: "已复制编辑后的提示词。",
      copyFailed: "无法复制提示词。请选中提示词文本并手动复制。",
      clearedDigests: ({ count }) => `已清除 ${count} 条缓存摘要。`,
      notesDeleted: "已删除全部已保存的笔记。",
      resetConfirm:
        "要从当前 Chrome 个人资料中删除 API 密钥、缓存摘要、翻译和已保存的笔记吗？",
      allDataDeleted: "已删除全部 Bilibili Digest 数据。",
      settingsLoadFailed: "无法加载已保存的设置，但你仍可预览此页面。",
    },
  };

  function normalizeLanguage(language) {
    return SUPPORTED_LANGUAGES.has(language) ? language : "en";
  }

  function translate(language, key, params = {}) {
    const normalizedLanguage = normalizeLanguage(language);
    const value = COPY[normalizedLanguage][key] ?? COPY.en[key] ?? "";
    return typeof value === "function" ? value(params) : value;
  }

  function createStorageAdapter(chromeApi, fallbackStorage) {
    const chromeStorage = chromeApi?.storage?.local;
    const memoryStorage = new Map();

    function fallbackKeys() {
      const keys = [];
      if (!fallbackStorage) return keys;
      try {
        for (let index = 0; index < fallbackStorage.length; index += 1) {
          const key = fallbackStorage.key(index);
          if (key?.startsWith(PREVIEW_STORAGE_PREFIX)) keys.push(key);
        }
      } catch (_error) {
        return [];
      }
      return keys;
    }

    function readFallbackValue(key) {
      try {
        const rawValue = fallbackStorage?.getItem(
          `${PREVIEW_STORAGE_PREFIX}${key}`,
        );
        if (rawValue !== null && rawValue !== undefined) {
          return JSON.parse(rawValue);
        }
      } catch (_error) {
        // Fall through to memory when localStorage is unavailable or malformed.
      }
      return memoryStorage.get(key);
    }

    function writeFallbackValue(key, value) {
      memoryStorage.set(key, value);
      try {
        fallbackStorage?.setItem(
          `${PREVIEW_STORAGE_PREFIX}${key}`,
          JSON.stringify(value),
        );
      } catch (_error) {
        // The in-memory copy keeps a restricted preview functional.
      }
    }

    return {
      async get(keys) {
        if (chromeStorage) return chromeStorage.get(keys);

        const requestedKeys =
          keys === null
            ? [
                ...new Set([
                  ...memoryStorage.keys(),
                  ...fallbackKeys().map((key) =>
                    key.slice(PREVIEW_STORAGE_PREFIX.length),
                  ),
                ]),
              ]
            : Array.isArray(keys)
              ? keys
              : [keys];

        return Object.fromEntries(
          requestedKeys
            .map((key) => [key, readFallbackValue(key)])
            .filter(([, value]) => value !== undefined),
        );
      },

      async set(items) {
        if (chromeStorage) return chromeStorage.set(items);
        for (const [key, value] of Object.entries(items)) {
          writeFallbackValue(key, value);
        }
      },

      async remove(keys) {
        if (chromeStorage) return chromeStorage.remove(keys);
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          memoryStorage.delete(key);
          try {
            fallbackStorage?.removeItem(`${PREVIEW_STORAGE_PREFIX}${key}`);
          } catch (_error) {
            // Memory removal is sufficient for this preview session.
          }
        }
      },

      async clear() {
        if (chromeStorage) return chromeStorage.clear();
        memoryStorage.clear();
        for (const key of fallbackKeys()) {
          try {
            fallbackStorage.removeItem(key);
          } catch (_error) {
            // Continue clearing any remaining preview keys.
          }
        }
      },
    };
  }

  async function readPreferredLanguage(storage) {
    const stored = await storage.get(LANGUAGE_STORAGE_KEY);
    return normalizeLanguage(stored[LANGUAGE_STORAGE_KEY]);
  }

  async function persistPreferredLanguage(storage, language) {
    const normalizedLanguage = normalizeLanguage(language);
    await storage.set({ [LANGUAGE_STORAGE_KEY]: normalizedLanguage });
    return normalizedLanguage;
  }

  function updateLanguageButtonState(buttons, language) {
    const normalizedLanguage = normalizeLanguage(language);
    for (const button of buttons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.language === normalizedLanguage),
      );
    }
  }

  function updateLocalizedPrompt(textarea, prompt) {
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selectionDirection = textarea.selectionDirection;
    const scrollTop = textarea.scrollTop;
    const scrollLeft = textarea.scrollLeft;

    textarea.value = prompt;

    if (
      Number.isInteger(selectionStart) &&
      Number.isInteger(selectionEnd) &&
      typeof textarea.setSelectionRange === "function"
    ) {
      textarea.setSelectionRange(
        Math.min(selectionStart, prompt.length),
        Math.min(selectionEnd, prompt.length),
        selectionDirection || "none",
      );
    }
    textarea.scrollTop = scrollTop;
    textarea.scrollLeft = scrollLeft;
  }

  function createPromptDrafts() {
    return {
      en: translate("en", "customizationPrompt"),
      "zh-CN": translate("zh-CN", "customizationPrompt"),
    };
  }

  function switchPromptDraft(
    drafts,
    currentLanguage,
    nextLanguage,
    currentValue,
  ) {
    const normalizedCurrentLanguage = normalizeLanguage(currentLanguage);
    const normalizedNextLanguage = normalizeLanguage(nextLanguage);
    drafts[normalizedCurrentLanguage] = String(currentValue ?? "");
    if (typeof drafts[normalizedNextLanguage] !== "string") {
      drafts[normalizedNextLanguage] = translate(
        normalizedNextLanguage,
        "customizationPrompt",
      );
    }
    return {
      language: normalizedNextLanguage,
      prompt: drafts[normalizedNextLanguage],
    };
  }

  async function copyPromptValue(clipboard, value) {
    await clipboard.writeText(value);
  }

  function getSafeLocalStorage(root) {
    try {
      return root.localStorage;
    } catch (_error) {
      return null;
    }
  }

  function initialize(root = globalThis) {
    const doc = root.document;
    const settingsApi = root.YTD_SETTINGS;
    if (!doc || !settingsApi) return;

    const storage = createStorageAdapter(
      root.chrome,
      getSafeLocalStorage(root),
    );
    const form = doc.getElementById("settingsForm");
    const aiApiKeyInput = doc.getElementById("aiApiKey");
    const asrEnabledInput = doc.getElementById("asrEnabled");
    const asrProviderSelect = doc.getElementById("asrProvider");
    const asrProviderHint = doc.getElementById("asrProviderHint");
    const asrApiKeyInput = doc.getElementById("asrApiKey");
    const asrModelInput = doc.getElementById("asrModel");
    const asrModelPresets = doc.getElementById("asrModelPresets");
    const asrBaseUrlInput = doc.getElementById("asrBaseUrl");
    const asrMaxMbInput = doc.getElementById("asrMaxMb");
    const customizationPrompt = doc.getElementById("customizationPrompt");
    const copyCustomizationPromptBtn = doc.getElementById(
      "copyCustomizationPromptBtn",
    );
    const copyStatus = doc.getElementById("copyStatus");
    const saveStatus = doc.getElementById("saveStatus");
    const dataStatus = doc.getElementById("dataStatus");
    const languageButtons = [...doc.querySelectorAll("[data-language]")];
    const statusStates = new Map();
    const promptDrafts = createPromptDrafts();
    let currentLanguage = "en";

    function renderStatus(element) {
      const state = statusStates.get(element);
      element.textContent = state
        ? translate(currentLanguage, state.key, state.params)
        : "";
    }

    function setStatus(element, key, params = {}) {
      statusStates.set(element, { key, params });
      renderStatus(element);
    }

    // --- Speech-to-text fallback -----------------------------------------
    // The endpoint is a third-party origin, so it is not part of the
    // install-time host permissions. It is requested here, on an explicit save
    // by the user, and only when the fallback is switched on.

    const asrApi = root.BILI_ASR;
    const asrFields = [
      asrProviderSelect,
      asrApiKeyInput,
      asrModelInput,
      asrBaseUrlInput,
      asrMaxMbInput,
    ];
    const ASR_HINT_KEYS = {
      siliconflow: "asrHintSiliconflow",
      openai: "asrHintOpenai",
      groq: "asrHintGroq",
      custom: "asrHintCustom",
    };
    const BYTES_PER_MB = 1024 * 1024;

    function fillAsrProviders() {
      if (!asrApi) return;
      asrProviderSelect.innerHTML = "";
      for (const id of asrApi.PROVIDER_IDS) {
        const option = doc.createElement("option");
        option.value = id;
        option.textContent = asrApi.PROVIDERS[id].label;
        asrProviderSelect.appendChild(option);
      }
    }

    function renderAsrModelPresets(providerId) {
      if (!asrApi) return;
      asrModelPresets.innerHTML = "";
      for (const model of asrApi.modelsFor(providerId)) {
        const option = doc.createElement("option");
        option.value = model.id;
        asrModelPresets.appendChild(option);
      }
    }

    function renderAsrProviderHint() {
      if (!asrApi) return;
      asrProviderHint.textContent = translate(
        currentLanguage,
        ASR_HINT_KEYS[asrProviderSelect.value] || "asrHintCustom",
      );
      asrProviderHint.style.display = asrProviderSelect.value ? "" : "none";
    }

    /** The whole block is inert until the switch is on; say so by dimming it. */
    function updateAsrFieldState() {
      const enabled = asrEnabledInput.checked;
      for (const field of asrFields) field.disabled = !enabled;
    }

    function applyAsrProviderPreset() {
      if (!asrApi) return;
      const provider = asrApi.resolveProvider(asrProviderSelect.value);
      if (provider.baseUrl) {
        asrBaseUrlInput.value = provider.baseUrl;
        asrModelInput.value = provider.defaultModel;
      }
      renderAsrModelPresets(asrProviderSelect.value);
      renderAsrProviderHint();
    }

    /** Ask for the endpoint origin, which is deliberately not install-time. */
    async function requestEndpointPermission(baseUrl) {
      if (!asrApi) return { granted: true };
      const pattern = asrApi.endpointOriginPattern(baseUrl);
      if (!pattern) return { granted: false };
      const permissions = root.chrome && root.chrome.permissions;
      if (!permissions) return { granted: true };
      try {
        if (await permissions.contains({ origins: [pattern] })) {
          return { granted: true };
        }
        const granted = await permissions.request({ origins: [pattern] });
        return { granted: granted === true };
      } catch (_error) {
        return { granted: false };
      }
    }

    function applyLanguage(language) {
      const nextDraft = switchPromptDraft(
        promptDrafts,
        currentLanguage,
        language,
        customizationPrompt.value,
      );
      currentLanguage = nextDraft.language;
      doc.documentElement.lang = currentLanguage;
      doc.title = translate(currentLanguage, "pageTitle");

      for (const element of doc.querySelectorAll("[data-i18n]")) {
        element.textContent = translate(
          currentLanguage,
          element.dataset.i18n,
        );
      }
      for (const element of doc.querySelectorAll("[data-i18n-html]")) {
        element.innerHTML = translate(
          currentLanguage,
          element.dataset.i18nHtml,
        );
      }
      for (const element of doc.querySelectorAll("[data-i18n-aria-label]")) {
        element.setAttribute(
          "aria-label",
          translate(currentLanguage, element.dataset.i18nAriaLabel),
        );
      }

      updateLocalizedPrompt(
        customizationPrompt,
        nextDraft.prompt,
      );
      updateLanguageButtonState(languageButtons, currentLanguage);
      renderAsrProviderHint();
      for (const element of statusStates.keys()) renderStatus(element);
    }

    async function loadSettings() {
      try {
        const stored = await storage.get(settingsApi.STORAGE_KEY);
        const migration = settingsApi.migrateLegacyCustom(
          stored[settingsApi.STORAGE_KEY],
        );
        const settings = migration.settings;

        aiApiKeyInput.value = settings.aiApiKey;
        asrEnabledInput.checked = settings.asrEnabled === true;
        asrProviderSelect.value = settings.asrProvider;
        asrApiKeyInput.value = settings.asrApiKey;
        asrModelInput.value = settings.asrModel;
        asrBaseUrlInput.value = settings.asrBaseUrl;
        asrMaxMbInput.value = String(
          Math.round(settings.asrMaxBytes / BYTES_PER_MB),
        );
        renderAsrModelPresets(settings.asrProvider);
        renderAsrProviderHint();
        updateAsrFieldState();

        if (migration.migrated) {
          await storage.set({ [settingsApi.STORAGE_KEY]: settings });
          setStatus(saveStatus, "migrationWarning");
        }
      } catch (_error) {
        setStatus(saveStatus, "settingsLoadFailed");
      }
    }

    async function loadOptions() {
      try {
        applyLanguage(await readPreferredLanguage(storage));
      } catch (_error) {
        applyLanguage("en");
      }
      await loadSettings();
    }

    async function saveSettings(event) {
      event.preventDefault();
      setStatus(saveStatus, "saving");

      const settings = settingsApi.normalize({
        aiApiKey: aiApiKeyInput.value,
        asrEnabled: asrEnabledInput.checked,
        asrProvider: asrProviderSelect.value,
        asrApiKey: asrApiKeyInput.value,
        asrModel: asrModelInput.value,
        asrBaseUrl: asrBaseUrlInput.value,
        asrMaxBytes: Number(asrMaxMbInput.value) * BYTES_PER_MB,
      });

      if (!settings.aiApiKey) {
        setStatus(saveStatus, "addDeepseekKey");
        return;
      }

      if (settings.asrEnabled && !settings.asrApiKey) {
        setStatus(saveStatus, "asrAddKey");
        return;
      }

      if (settings.asrEnabled) {
        const permission = await requestEndpointPermission(settings.asrBaseUrl);
        if (!permission.granted) {
          setStatus(saveStatus, "asrPermissionDenied");
          return;
        }
      }

      try {
        await storage.set({ [settingsApi.STORAGE_KEY]: settings });
        setStatus(saveStatus, "saved");
      } catch (_error) {
        setStatus(saveStatus, "saveFailed");
      }
    }

    async function copyCustomizationPrompt() {
      setStatus(copyStatus, "copying");
      try {
        await copyPromptValue(
          root.navigator.clipboard,
          customizationPrompt.value,
        );
        setStatus(copyStatus, "promptCopied");
      } catch (_error) {
        setStatus(copyStatus, "copyFailed");
      }
    }

    async function clearCachedDigests() {
      const all = await storage.get(null);
      const keys = Object.keys(all).filter((key) => key.startsWith("digest_"));
      if (keys.length) await storage.remove(keys);
      setStatus(dataStatus, "clearedDigests", { count: keys.length });
    }

    async function clearNotes() {
      await storage.remove("ytd_notes");
      setStatus(dataStatus, "notesDeleted");
    }

    async function resetAllData() {
      const confirmed = root.confirm(
        translate(currentLanguage, "resetConfirm"),
      );
      if (!confirmed) return;

      await storage.clear();
      await persistPreferredLanguage(storage, currentLanguage);
      await loadSettings();
      setStatus(dataStatus, "allDataDeleted");
    }

    fillAsrProviders();
    updateAsrFieldState();
    asrEnabledInput.addEventListener("change", updateAsrFieldState);
    asrProviderSelect.addEventListener("change", applyAsrProviderPreset);

    form.addEventListener("submit", saveSettings);
    copyCustomizationPromptBtn.addEventListener(
      "click",
      copyCustomizationPrompt,
    );
    doc
      .getElementById("clearCacheBtn")
      .addEventListener("click", clearCachedDigests);
    doc.getElementById("clearNotesBtn").addEventListener("click", clearNotes);
    doc.getElementById("resetBtn").addEventListener("click", resetAllData);
    for (const button of languageButtons) {
      button.addEventListener("click", async () => {
        const language = button.dataset.language;
        applyLanguage(language);
        await persistPreferredLanguage(storage, language);
      });
    }

    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", loadOptions, { once: true });
    } else {
      void loadOptions();
    }
  }

  return {
    COPY,
    LANGUAGE_STORAGE_KEY,
    copyPromptValue,
    createPromptDrafts,
    createStorageAdapter,
    normalizeLanguage,
    persistPreferredLanguage,
    readPreferredLanguage,
    translate,
    updateLanguageButtonState,
    updateLocalizedPrompt,
    switchPromptDraft,
    initialize,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = YTD_OPTIONS;
}

if (typeof document !== "undefined") {
  YTD_OPTIONS.initialize();
}
