/**
 * llm.js - Client-side LLM service for Anansi Forge.
 * 
 * Supports Gemini, OpenAI, Anthropic, OpenRouter, and local models (LM Studio, Ollama, Kobold AI).
 *
 * Models live in a registry ("All configured models"): one active model for the
 * main flow and an optional Delphi model for cross-model audits. Legacy single
 * + secondary configs migrate into the registry on first load.
 */

(() => {
  /**
   * Generates text using the configured provider.
   * @param {string} systemPrompt - System context/instructions.
   * @param {Array<{role: string, content: string}>} history - Chat messages history.
   * @param {Object} [overrideConfig] - Optional temporary config overrides.
   * @returns {Promise<string>} - The LLM response text.
   */
  async function generate(systemPrompt, history, overrideConfig = null) {
    const config = overrideConfig || getStoredConfig();
    
    const provider = config.provider || 'gemini';
    const model = config.model || 'gemini-1.5-flash';
    const key = config.apiKey || '';
    const maxTokens = config.maxTokens || 4096;

    if (!key && !['lmstudio', 'ollama', 'kobold', 'custom', 'chutes', 'local'].includes(provider)) {
      throw new Error(`API key is missing for provider: ${provider}. Please configure it in API settings.`);
    }

    // 1. Google Gemini
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      
      const contents = history && history.length > 0
        ? history.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content || ' ' }]
          }))
        : [{ role: 'user', parts: [{ text: 'Please proceed.' }] }];

      const body = {
        contents: contents,
        generationConfig: {
          temperature: config.temperature ?? 0.8,
          maxOutputTokens: maxTokens
        }
      };

      if (systemPrompt) {
        body.systemInstruction = {
          parts: [{ text: systemPrompt }]
        };
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        let errMsg = resp.statusText;
        try { const err = await resp.json(); errMsg = err.error?.message || errMsg; }
        catch (_) { try { errMsg = await resp.text() || errMsg; } catch (__) {} }
        throw new Error(`Gemini API error ${resp.status}: ${errMsg}`);
      }

      const data = await resp.json();
      const candidate = data.candidates?.[0];
      if (candidate?.finishReason === 'SAFETY') {
        return '⚠️ Output was blocked by Gemini safety filters.';
      }

      const parts = candidate?.content?.parts || [];
      let mainText = '';
      let thoughtText = '';
      for (const p of parts) {
        if (p.thought) {
          thoughtText += (thoughtText ? '\n' : '') + (p.text || '');
        } else if (p.text) {
          mainText += p.text;
        }
      }

      if (!mainText && thoughtText) {
        mainText = thoughtText;
      } else if (thoughtText) {
        mainText = `<think>${thoughtText}</think>\n${mainText}`;
      }

      return mainText || '(No response)';
    }

    // 2. OpenAI / OpenRouter / Chutes / LM Studio / Custom Endpoints
    if (['openai', 'openrouter', 'chutes', 'lmstudio', 'ollama', 'custom'].includes(provider)) {
      let url = 'https://api.openai.com/v1/chat/completions';
      if (provider === 'openrouter') url = 'https://openrouter.ai/api/v1/chat/completions';
      if (provider === 'chutes') {
        let base = config.baseUrl || 'https://llm.chutes.ai/v1';
        // Self-heal: if the saved URL is from a different provider, override with Chutes default
        if (!base.includes('chutes.ai')) {
          base = 'https://llm.chutes.ai/v1';
        }
        base = base.replace(/\/$/, '');
        if (base.endsWith('/chat/completions')) {
          url = base;
        } else {
          url = `${base}/chat/completions`;
        }
      }
      if (provider === 'lmstudio') {
        let base = config.baseUrl || 'http://localhost:1234/v1';
        base = base.replace(/\/$/, '');
        if (base.endsWith('/chat/completions')) {
          url = base;
        } else {
          url = `${base}/chat/completions`;
        }
      }
      if (provider === 'ollama') {
        let base = config.baseUrl || 'http://localhost:11434/v1';
        base = base.replace(/\/$/, '');
        if (base.endsWith('/chat/completions')) {
          url = base;
        } else {
          url = `${base}/chat/completions`;
        }
      }
      if (provider === 'custom') {
        let base = (config.baseUrl || 'https://api.example.com/v1').replace(/\/$/, '');
        if (base.endsWith('/chat/completions')) {
          url = base;
        } else {
          url = `${base}/chat/completions`;
        }
      }


      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      history.forEach(m => {
        messages.push({
          role: m.role === 'model' ? 'assistant' : m.role,
          content: m.content
        });
      });

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      };

      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://anansiforge.app';
        headers['X-Title'] = 'Anansi Forge';
      }

      const body = {
        model: model,
        messages: messages,
        temperature: config.temperature ?? 0.8,
        max_tokens: maxTokens
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        let errMsg = resp.statusText;
        try { const err = await resp.json(); errMsg = err.error?.message || errMsg; }
        catch (_) { try { errMsg = await resp.text() || errMsg; } catch (__) {} }
        throw new Error(`API error ${resp.status}: ${errMsg}`);
      }

      const data = await resp.json();
      let content = data.choices?.[0]?.message?.content || '';
      
      // If DeepSeek model reasoning is present in reasoning_content, wrap it in <think> tags
      const reasoning = data.choices?.[0]?.message?.reasoning_content;
      if (reasoning) {
        content = `<think>${reasoning}</think>\n${content}`;
      }

      return content;
    }

    // 3. Anthropic Claude
    if (provider === 'anthropic') {
      const url = 'https://api.anthropic.com/v1/messages';

      const messages = history.map(m => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.content
      }));

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: messages,
          temperature: config.temperature ?? 0.8
        })
      });

      if (!resp.ok) {
        let errMsg = resp.statusText;
        try { const err = await resp.json(); errMsg = err.error?.message || errMsg; }
        catch (_) { try { errMsg = await resp.text() || errMsg; } catch (__) {} }
        throw new Error(`Anthropic API error ${resp.status}: ${errMsg}`);
      }

      const data = await resp.json();
      return data.content?.[0]?.text || '(No response)';
    }

    // 4. Kobold AI (Local)
    if (provider === 'kobold') {
      const base = (config.baseUrl || 'http://localhost:5001').replace(/\/$/, '');
      const url = `${base}/api/v1/generate`;

      // Compile raw text prompt sequence
      let rawPrompt = '';
      if (systemPrompt) {
        rawPrompt += `[System: ${systemPrompt}]\n`;
      }
      history.forEach(m => {
        const label = m.role === 'user' ? 'User' : 'Character';
        rawPrompt += `${label}: ${m.content}\n`;
      });
      rawPrompt += `Character:`;

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: rawPrompt,
          max_context_length: 4096,
          max_length: 512,
          temperature: config.temperature ?? 0.8
        })
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Kobold Error: ${errText || resp.statusText}`);
      }

      const data = await resp.json();
      return data.results?.[0]?.text || '(No response)';
    }

    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  // --- Model registry ("All configured models") ---
  // One list of profiles; the active profile drives the main flow and an
  // optional Delphi profile drives cross-model audits. Legacy configs
  // (anansi_forge_api_config / anansi_forge_api_config_2) migrate in once.

  const MODELS_KEY = 'anansi_forge_models';
  const ACTIVE_KEY = 'anansi_forge_active_model';
  const DELPHI_KEY = 'anansi_forge_delphi_model';
  const LEGACY_KEY = 'anansi_forge_api_config';
  const LEGACY_SECONDARY_KEY = 'anansi_forge_api_config_2';

  function newModelId() {
    return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function profileName(p) {
    if (p.provider && p.model) return p.provider + ' / ' + p.model;
    if (p.provider) return p.provider;
    return 'Unnamed model';
  }

  function cleanProfile(p) {
    return {
      id: p.id || newModelId(),
      name: p.name || profileName(p),
      provider: p.provider || 'gemini',
      model: p.model || '',
      apiKey: p.apiKey || '',
      baseUrl: p.baseUrl || '',
      maxTokens: Number(p.maxTokens) || 2048
    };
  }

  function migrateIfNeeded() {
    try {
      if (localStorage.getItem(MODELS_KEY)) return;
      const models = [];
      let activeId = null;
      let delphiId = null;
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
        if (legacy && legacy.provider) {
          const prof = cleanProfile(legacy);
          models.push(prof);
          activeId = prof.id;
        }
      } catch (_) {}
      try {
        const legacy2 = JSON.parse(localStorage.getItem(LEGACY_SECONDARY_KEY) || 'null');
        if (legacy2 && legacy2.provider && legacy2.provider !== 'none') {
          const prof = cleanProfile(legacy2);
          models.push(prof);
          delphiId = prof.id;
        }
      } catch (_) {}
      if (!models.length) {
        const prof = cleanProfile({ provider: 'gemini', model: 'gemini-1.5-flash' });
        models.push(prof);
      }
      if (!activeId && models.length) activeId = models[0].id;
      localStorage.setItem(MODELS_KEY, JSON.stringify(models));
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
      if (delphiId) localStorage.setItem(DELPHI_KEY, delphiId);
    } catch (e) {
      console.warn('[ForgeLLM] Model migration failed:', e);
    }
  }

  function getModels() {
    migrateIfNeeded();
    try {
      const raw = localStorage.getItem(MODELS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed) && parsed.length) return parsed.map(cleanProfile);
    } catch (e) {
      console.warn('[ForgeLLM] Failed to parse model registry:', e);
    }
    return [cleanProfile({ provider: 'gemini', model: 'gemini-1.5-flash' })];
  }

  function saveModels(models) {
    const cleaned = (Array.isArray(models) ? models : []).map(cleanProfile);
    localStorage.setItem(MODELS_KEY, JSON.stringify(cleaned));
    return cleaned;
  }

  function getActiveModelId() {
    return localStorage.getItem(ACTIVE_KEY);
  }

  function setActiveModelId(id) {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
  }

  function getDelphiModelId() {
    return localStorage.getItem(DELPHI_KEY);
  }

  function setDelphiModelId(id) {
    if (id) localStorage.setItem(DELPHI_KEY, id);
    else localStorage.removeItem(DELPHI_KEY);
  }

  function getActiveModel() {
    const models = getModels();
    const id = getActiveModelId();
    return models.find(m => m.id === id) || models[0] || null;
  }

  function getDelphiModel() {
    const id = getDelphiModelId();
    if (!id) return null;
    return getModels().find(m => m.id === id) || null;
  }

  function profileToConfig(p) {
    return {
      provider: p.provider,
      model: p.model,
      apiKey: p.apiKey,
      baseUrl: p.baseUrl,
      maxTokens: p.maxTokens
    };
  }

  // Active profile config — what generate() uses when no override is given.
  // Kept as getConfig so existing callers need no changes.
  function getStoredConfig() {
    const active = getActiveModel();
    if (active) return profileToConfig(active);
    // Default fallback (matches the pre-registry default)
    return {
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      apiKey: '',
      baseUrl: '',
      maxTokens: 2048
    };
  }

  // Legacy path: writes into the active profile instead of a single slot.
  function saveConfig(config) {
    const models = getModels();
    const active = getActiveModel();
    const updated = cleanProfile({ ...(active || {}), ...(config || {}), id: active ? active.id : undefined });
    const next = active
      ? models.map(m => (m.id === active.id ? updated : m))
      : [...models, updated];
    saveModels(next);
    if (!active) setActiveModelId(updated.id);
  }

  // Delphi profile config, or null when Delphi audits are single-model only.
  // Kept as getSecondaryConfig so Delphi callers need no changes.
  function getDelphiConfig() {
    const delphi = getDelphiModel();
    return delphi ? profileToConfig(delphi) : null;
  }

  function getSecondaryConfig() {
    return getDelphiConfig();
  }

  // Legacy shim: pin a profile as the Delphi model (or clear it with null).
  function saveSecondaryConfig(config) {
    if (!config || !config.provider || config.provider === 'none') {
      setDelphiModelId(null);
      return;
    }
    const models = getModels();
    const match = models.find(m => m.provider === config.provider && m.model === config.model);
    const profile = match
      ? cleanProfile({ ...match, ...config, id: match.id })
      : cleanProfile(config);
    const next = match
      ? models.map(m => (m.id === match.id ? profile : m))
      : [...models, profile];
    saveModels(next);
    setDelphiModelId(profile.id);
  }

  // Export
  window.ForgeLLM = {
    generate,
    getConfig: getStoredConfig,
    saveConfig,
    getSecondaryConfig,
    saveSecondaryConfig,
    getModels,
    saveModels,
    getActiveModel,
    getActiveModelId,
    setActiveModelId,
    getDelphiModel,
    getDelphiModelId,
    setDelphiModelId,
    getDelphiConfig
  };
})();
