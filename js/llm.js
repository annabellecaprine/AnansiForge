/**
 * llm.js - Client-side LLM service for Anansi Forge.
 * 
 * Supports Gemini, OpenAI, Anthropic, OpenRouter, and local models (LM Studio, Kobold AI).
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

    if (!key && provider !== 'lmstudio' && provider !== 'kobold') {
      throw new Error(`API key is missing for provider: ${provider}. Please configure it in API settings.`);
    }

    // 1. Google Gemini
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      
      const contents = history.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const body = {
        contents: contents,
        generationConfig: {
          temperature: 0.8,
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
        const err = await resp.json();
        throw new Error(err.error?.message || resp.statusText);
      }

      const data = await resp.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '(No response)';
    }

    // 2. OpenAI / OpenRouter / Chutes / LM Studio / Custom Endpoints
    if (['openai', 'openrouter', 'chutes', 'lmstudio', 'custom'].includes(provider)) {
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
        temperature: 0.8,
        max_tokens: maxTokens
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error?.message || resp.statusText);
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
          temperature: 0.8
        })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error?.message || resp.statusText);
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
          temperature: 0.8
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

  function getStoredConfig() {
    try {
      const saved = localStorage.getItem('anansi_forge_api_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('[ForgeLLM] Failed to parse API settings:', e);
    }
    // Default fallback
    return {
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      apiKey: '',
      baseUrl: '',
      maxTokens: 2048
    };
  }

  function saveConfig(config) {
    localStorage.setItem('anansi_forge_api_config', JSON.stringify(config));
  }

  // Export
  window.ForgeLLM = {
    generate,
    getConfig: getStoredConfig,
    saveConfig
  };
})();
