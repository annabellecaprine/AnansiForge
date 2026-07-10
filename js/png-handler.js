/**
 * png-handler.js - PNG metadata reader/writer for SillyTavern character cards.
 * 
 * Embeds JSON character data in the 'chara' tEXt chunk of a PNG file.
 */

(() => {
  const CHARA_KEY = 'chara';

  // Fallback 1x1 transparent PNG data (Base64)
  const FALLBACK_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function crc32(data) {
    let crc = 0xFFFFFFFF;
    const table = [];

    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c;
    }

    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function createTextChunk(keyword, text) {
    const keywordBytes = new TextEncoder().encode(keyword);
    const textBytes = new TextEncoder().encode(text);

    // keyword + null + text
    const data = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
    data.set(keywordBytes, 0);
    data[keywordBytes.length] = 0;
    data.set(textBytes, keywordBytes.length + 1);

    const chunkType = new TextEncoder().encode('tEXt');
    const chunkData = new Uint8Array(4 + 4 + data.length + 4);
    const view = new DataView(chunkData.buffer);

    view.setUint32(0, data.length, false);
    chunkData.set(chunkType, 4);
    chunkData.set(data, 8);

    const crcData = new Uint8Array(4 + data.length);
    crcData.set(chunkType, 0);
    crcData.set(data, 4);
    view.setUint32(8 + data.length, crc32(crcData), false);

    return chunkData;
  }

  function parsePngChunks(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunks = [];

    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) {
      if (bytes[i] !== signature[i]) {
        throw new Error('Invalid PNG signature');
      }
    }

    let offset = 8;
    while (offset < bytes.length) {
      const view = new DataView(buffer, offset);
      const length = view.getUint32(0, false);
      const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
      const data = bytes.slice(offset + 8, offset + 8 + length);
      const crc = view.getUint32(8 + length, false);

      chunks.push({ type, data, length, crc, offset });
      offset += 12 + length;

      if (type === 'IEND') break;
    }

    return chunks;
  }

  /**
   * Extracts character metadata from a PNG file.
   * @param {Blob|ArrayBuffer} png - The PNG file.
   * @returns {Promise<Object|null>} - The parsed character card data or null.
   */
  async function extractCharaCard(png) {
    try {
      const buffer = png instanceof Blob ? await png.arrayBuffer() : png;
      const chunks = parsePngChunks(buffer);

      for (const chunk of chunks) {
        if (chunk.type === 'tEXt') {
          const nullIndex = chunk.data.indexOf(0);
          if (nullIndex === -1) continue;

          const keyword = new TextDecoder().decode(chunk.data.slice(0, nullIndex));
          if (keyword !== CHARA_KEY) continue;

          const textData = new TextDecoder().decode(chunk.data.slice(nullIndex + 1));
          
          try {
            // Decode base64 UTF-8 using escape sequence reverse mapping
            const jsonStr = decodeURIComponent(escape(atob(textData)));
            return JSON.parse(jsonStr);
          } catch (e) {
            try {
              // Fallback for standard ISO-8859-1 base64
              const fallbackJson = atob(textData);
              return JSON.parse(fallbackJson);
            } catch (innerB64Err) {
              // Fallback for raw JSON text
              try {
                return JSON.parse(textData);
              } catch (innerErr) {
                console.warn('[PNGHandler] Failed to parse card data:', e, innerB64Err, innerErr);
              }
            }
          }
        }
      }
      return null;
    } catch (err) {
      console.error('[PNGHandler] Extract error:', err);
      return null;
    }
  }

  /**
   * Embeds character card data inside a PNG image.
   * @param {Blob|ArrayBuffer|null} png - The source PNG file (optional). If null, a transparent 1x1 PNG is used.
   * @param {Object} cardData - The character metadata to embed.
   * @returns {Promise<Blob>} - The resulting PNG file.
   */
  async function embedCharaCard(png, cardData) {
    let buffer;
    if (!png) {
      buffer = base64ToArrayBuffer(FALLBACK_PNG_B64);
    } else {
      buffer = png instanceof Blob ? await png.arrayBuffer() : png;
    }

    const chunks = parsePngChunks(buffer);
    const processedChunks = [];

    // Remove existing 'chara' chunks
    for (const chunk of chunks) {
      if (chunk.type === 'tEXt') {
        const nullIndex = chunk.data.indexOf(0);
        if (nullIndex !== -1) {
          const keyword = new TextDecoder().decode(chunk.data.slice(0, nullIndex));
          if (keyword === CHARA_KEY) continue; // Skip existing metadata
        }
      }

      const chunkTotalLength = 12 + chunk.length;
      const chunkBytes = new Uint8Array(buffer, chunk.offset, chunkTotalLength);
      processedChunks.push(chunkBytes);
    }

    // Create new 'chara' metadata chunk
    const jsonStr = JSON.stringify(cardData);
    // Base64 encode using unescape/encodeURIComponent to support multi-byte Unicode chars
    const base64Data = btoa(unescape(encodeURIComponent(jsonStr)));
    const charaChunk = createTextChunk(CHARA_KEY, base64Data);

    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    // Calculate total size of rebuilt PNG
    let totalSize = 8;
    for (const chunk of processedChunks) {
      totalSize += chunk.length;
    }
    totalSize += charaChunk.length;

    const newPng = new Uint8Array(totalSize);
    let offset = 0;

    // Write PNG signature
    newPng.set(signature, offset);
    offset += 8;

    // Write chunks, inserting the chara chunk immediately after IHDR chunk
    let insertedChara = false;
    for (const chunkBytes of processedChunks) {
      const type = new TextDecoder().decode(chunkBytes.slice(4, 8));
      newPng.set(chunkBytes, offset);
      offset += chunkBytes.length;

      if (!insertedChara && type === 'IHDR') {
        newPng.set(charaChunk, offset);
        offset += charaChunk.length;
        insertedChara = true;
      }
    }

    return new Blob([newPng], { type: 'image/png' });
  }

  // Export to window
  window.PNGHandler = {
    extract: extractCharaCard,
    embed: embedCharaCard
  };
})();
