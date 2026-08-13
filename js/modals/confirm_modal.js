/**
 * confirm_modal.js - Anansi Forge Styled Confirmation Modal Utility
 *
 * Replaces native confirm() / alert() with styled modals matching the
 * existing dark-themed design system (.omni-overlay / .omni-panel).
 *
 * Usage:
 *   const ok = await showConfirmModal({ title: '⚠️ Confirm', message: 'Are you sure?', danger: true });
 *   await showAlertModal({ title: '🚫 Error', message: 'Something went wrong.' });
 */

(() => {
    'use strict';

    let modalEl = null;

    function ensureDOM() {
        if (modalEl) return;
        modalEl = document.createElement('div');
        modalEl.id = 'custom-confirm-modal';
        modalEl.className = 'omni-overlay hidden';
        modalEl.style.zIndex = '10000';
        modalEl.innerHTML = `
      <div class="omni-backdrop"></div>
      <div class="omni-panel" style="max-width: 480px; padding: 24px; text-align: left;">
        <h3 id="custom-confirm-title" style="margin-top:0; margin-bottom: 12px; font-size: 1.1rem; color: var(--text-primary); font-family: var(--font-sans);"></h3>
        <div id="custom-confirm-msg" style="margin-bottom: 16px; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5; font-family: var(--font-sans);"></div>
        <div id="custom-confirm-input-container" style="display:none; margin-bottom: 20px;">
          <input type="text" id="custom-confirm-input" class="mc-modal-input" style="width: 100%; box-sizing: border-box; font-size: 0.9rem; padding: 8px 12px; background: var(--bg-tertiary, #1e293b); color: var(--text-primary, #f8fafc); border: 1px solid var(--border-color, #334155); border-radius: 6px;" autocomplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true">
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button id="custom-confirm-cancel" class="btn btn-ghost" style="padding: 8px 16px;"></button>
          <button id="custom-confirm-ok" class="btn btn-primary" style="padding: 8px 16px;"></button>
        </div>
      </div>
    `;
        document.body.appendChild(modalEl);
    }

    /**
     * Show a styled confirmation modal. Returns a Promise<boolean>.
     * @param {object} opts
     * @param {string} opts.title - Modal title (supports HTML/emoji)
     * @param {string} opts.message - Body message (supports HTML)
     * @param {string} [opts.okText='OK'] - Confirm button label
     * @param {string} [opts.cancelText='Cancel'] - Cancel button label
     * @param {boolean} [opts.danger=false] - If true, confirm button uses danger styling
     */
    function showConfirmModal({ title, message, okText = 'OK', cancelText = 'Cancel', danger = false }) {
        ensureDOM();

        return new Promise((resolve) => {
            const titleEl = modalEl.querySelector('#custom-confirm-title');
            const msgEl = modalEl.querySelector('#custom-confirm-msg');
            const inputContainer = modalEl.querySelector('#custom-confirm-input-container');
            const okBtn = modalEl.querySelector('#custom-confirm-ok');
            const cancelBtn = modalEl.querySelector('#custom-confirm-cancel');
            const backdrop = modalEl.querySelector('.omni-backdrop');

            titleEl.innerHTML = title;
            msgEl.innerHTML = message;
            msgEl.style.display = 'block';
            inputContainer.style.display = 'none';
            okBtn.textContent = okText;
            cancelBtn.textContent = cancelText;
            okBtn.style.display = '';
            cancelBtn.style.display = '';

            okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
            okBtn.style.padding = '8px 16px';

            const cleanup = (result) => {
                modalEl.classList.add('hidden');
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                backdrop.removeEventListener('click', onCancel);
                window.removeEventListener('keydown', onKey);
                resolve(result);
            };

            const onOk = () => cleanup(true);
            const onCancel = () => cleanup(false);
            const onKey = (e) => {
                if (e.key === 'Escape') cleanup(false);
                if (e.key === 'Enter') cleanup(true);
            };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            backdrop.addEventListener('click', onCancel);
            window.addEventListener('keydown', onKey);

            modalEl.classList.remove('hidden');
            okBtn.focus();
        });
    }

    /**
     * Show a styled alert modal (single OK button). Returns a Promise<void>.
     * @param {object} opts
     * @param {string} opts.title - Modal title
     * @param {string} opts.message - Body message (supports HTML)
     * @param {string} [opts.okText='OK'] - Button label
     */
    function showAlertModal({ title, message, okText = 'OK' }) {
        ensureDOM();

        return new Promise((resolve) => {
            const titleEl = modalEl.querySelector('#custom-confirm-title');
            const msgEl = modalEl.querySelector('#custom-confirm-msg');
            const inputContainer = modalEl.querySelector('#custom-confirm-input-container');
            const okBtn = modalEl.querySelector('#custom-confirm-ok');
            const cancelBtn = modalEl.querySelector('#custom-confirm-cancel');
            const backdrop = modalEl.querySelector('.omni-backdrop');

            titleEl.innerHTML = title;
            msgEl.innerHTML = message;
            msgEl.style.display = 'block';
            inputContainer.style.display = 'none';
            okBtn.textContent = okText;
            okBtn.className = 'btn btn-primary';
            okBtn.style.padding = '8px 16px';
            cancelBtn.style.display = 'none';

            const cleanup = () => {
                modalEl.classList.add('hidden');
                okBtn.removeEventListener('click', onOk);
                backdrop.removeEventListener('click', onOk);
                window.removeEventListener('keydown', onKey);
                resolve();
            };

            const onOk = () => cleanup();
            const onKey = (e) => {
                if (e.key === 'Escape' || e.key === 'Enter') cleanup();
            };

            okBtn.addEventListener('click', onOk);
            backdrop.addEventListener('click', onOk);
            window.addEventListener('keydown', onKey);

            modalEl.classList.remove('hidden');
            okBtn.focus();
        });
    }

    /**
     * Show a styled prompt modal with a text input. Returns a Promise<string|null>.
     * @param {object} opts
     * @param {string} opts.title - Modal title (supports HTML/emoji)
     * @param {string} [opts.message=''] - Body message / description
     * @param {string} [opts.defaultValue=''] - Default value inside text input
     * @param {string} [opts.placeholder=''] - Input placeholder
     * @param {string} [opts.okText='OK'] - Confirm button label
     * @param {string} [opts.cancelText='Cancel'] - Cancel button label
     */
    function showPromptModal({ title, message = '', defaultValue = '', placeholder = '', okText = 'OK', cancelText = 'Cancel' }) {
        ensureDOM();

        return new Promise((resolve) => {
            const titleEl = modalEl.querySelector('#custom-confirm-title');
            const msgEl = modalEl.querySelector('#custom-confirm-msg');
            const inputContainer = modalEl.querySelector('#custom-confirm-input-container');
            const inputEl = modalEl.querySelector('#custom-confirm-input');
            const okBtn = modalEl.querySelector('#custom-confirm-ok');
            const cancelBtn = modalEl.querySelector('#custom-confirm-cancel');
            const backdrop = modalEl.querySelector('.omni-backdrop');

            titleEl.innerHTML = title;
            msgEl.innerHTML = message;
            msgEl.style.display = message ? 'block' : 'none';
            inputContainer.style.display = 'block';
            inputEl.value = defaultValue;
            inputEl.placeholder = placeholder;
            okBtn.textContent = okText;
            cancelBtn.textContent = cancelText;
            okBtn.style.display = '';
            cancelBtn.style.display = '';

            okBtn.className = 'btn btn-primary';
            okBtn.style.padding = '8px 16px';

            const cleanup = (result) => {
                modalEl.classList.add('hidden');
                inputContainer.style.display = 'none';
                msgEl.style.display = 'block';
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                backdrop.removeEventListener('click', onCancel);
                window.removeEventListener('keydown', onKey);
                resolve(result);
            };

            const onOk = () => cleanup(inputEl.value);
            const onCancel = () => cleanup(null);
            const onKey = (e) => {
                if (e.key === 'Escape') cleanup(null);
                if (e.key === 'Enter') {
                    e.preventDefault();
                    cleanup(inputEl.value);
                }
            };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            backdrop.addEventListener('click', onCancel);
            window.addEventListener('keydown', onKey);

            modalEl.classList.remove('hidden');
            setTimeout(() => {
                inputEl.focus();
                inputEl.select();
            }, 50);
        });
    }

    window.showConfirmModal = showConfirmModal;
    window.showAlertModal = showAlertModal;
    window.showPromptModal = showPromptModal;
})();
