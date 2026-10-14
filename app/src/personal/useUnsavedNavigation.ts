import { useEffect, useRef } from 'react';
import './UnsavedNavigation.css';

/** An actual in-app dialog: WKWebView does not supply window.confirm here. */
export function confirmDiscard(message: string, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted || document.querySelector('.pn-discard-dialog')) return Promise.resolve(false);
  return new Promise(resolve => {
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'pn-discard-dialog';
    dialog.setAttribute('aria-label', 'Unsaved changes');
    const title = document.createElement('h2'); title.textContent = 'Keep your changes?';
    const description = document.createElement('p'); description.textContent = message;
    const actions = document.createElement('div');
    const stay = document.createElement('button'); stay.type = 'button'; stay.textContent = 'Keep editing';
    const leave = document.createElement('button'); leave.type = 'button'; leave.textContent = 'Discard and continue';
    const finish = (approved: boolean) => {
      signal?.removeEventListener('abort', abort);
      dialog.remove();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
      resolve(approved);
    };
    const abort = () => finish(false);
    stay.onclick = () => finish(false);
    leave.onclick = () => finish(true);
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
    actions.append(stay, leave); dialog.append(title, description, actions);
    document.body.append(dialog);
    signal?.addEventListener('abort', abort, { once: true });
    dialog.showModal(); stay.focus();
  });
}

/** Guard only actions that leave Work, not sidebar disclosure/export or active tabs. */
export function useUnsavedNavigation(dirty: boolean, message: string, onDiscard: () => void) {
  const current = useRef({ dirty, onDiscard });
  current.current = { dirty, onDiscard };
  useEffect(() => {
    if (!dirty) return;
    const controller = new AbortController();
    let replaying = false;
    const proceed = async (action: () => void) => {
      if (!await confirmDiscard(message, controller.signal)) return;
      current.current.onDiscard();
      replaying = true;
      try { action(); } finally { replaying = false; }
    };
    const click = (event: MouseEvent) => {
      if (replaying || !current.current.dirty || !(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>('.fc-modes button, .pn-sidebar-nav, button[aria-label="Disconnect session"]');
      if (!button || button.disabled || button.getAttribute('aria-current') === 'page' || button.getAttribute('aria-pressed') === 'true') return;
      event.preventDefault(); event.stopImmediatePropagation();
      void proceed(() => { if (button.isConnected && !button.disabled) button.click(); });
    };
    const shortcut = (event: KeyboardEvent) => {
      if (replaying || !current.current.dirty || !(event.metaKey || event.ctrlKey) || !['g', ','].includes(event.key.toLowerCase())) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void proceed(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey })));
    };
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    document.addEventListener('click', click, true);
    window.addEventListener('keydown', shortcut, true);
    window.addEventListener('beforeunload', unload);
    return () => {
      controller.abort();
      document.removeEventListener('click', click, true);
      window.removeEventListener('keydown', shortcut, true);
      window.removeEventListener('beforeunload', unload);
    };
  }, [dirty, message]);
}
