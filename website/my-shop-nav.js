/* MY SHOP nav: plain same-origin script allowed by existing CSP. */
(() => {
  'use strict';
  const ID = 'dfo-my-shop-nav';
  const DESTINATION = 'https://dfo.spaceghosts.com/owner/';
  let scheduled = false;

  const label = (node) => (node.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const candidates = 'a, button, [role="tab"], [role="button"]';

  function mount() {
    if (document.getElementById(ID)) return;
    const source = Array.from(document.querySelectorAll(candidates))
      .find((node) => {
        const text = label(node);
        return node.id !== ID && text.includes('MY WATCHLIST') && text.length <= 48;
      });
    if (!source || !source.parentElement) return;

    // Use the same element type as the adjacent tab to inherit its CSS layout.
    const tag = /^(A|BUTTON)$/i.test(source.tagName) ? source.tagName.toLowerCase() : 'button';
    const tab = document.createElement(tag);
    tab.id = ID;
    tab.className = String(source.className || '').split(/\s+/)
      .filter((name) => name && !/^(?:active|selected|current|is-active|is-selected)$/i.test(name))
      .join(' ');
    if (source.getAttribute('style')) tab.setAttribute('style', source.getAttribute('style'));
    tab.textContent = 'MY SHOP';
    tab.title = 'Manage or claim your Daggerfall shop';
    tab.setAttribute('aria-label', 'My Shop');

    if (tag === 'a') {
      tab.href = DESTINATION;
      tab.addEventListener('click', (event) => event.stopPropagation());
    } else {
      tab.type = 'button';
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.location.assign(DESTINATION);
      });
    }
    source.insertAdjacentElement('afterend', tab);
  }

  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      mount();
    });
  }

  // Navigation is rendered/updated by the existing client scripts.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMount, { once: true });
  } else {
    scheduleMount();
  }
  new MutationObserver(scheduleMount).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
