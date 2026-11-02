// Daggerfall Watch: Guild Directory as the third main content tab.
// This file changes only the main-page tab UI; /guilds/ remains intact.
(() => {
  'use strict';

  function init() {
    const tabBar = document.querySelector('.view-tabs[role="tablist"]') || document.querySelector('.view-tabs');
    if (!tabBar || document.getElementById('guilds-tab')) return;
    const eventTab = tabBar.querySelector('#events-tab');
    const vendorTab = tabBar.querySelector('#vendors-tab');
    const events = document.getElementById('events');
    const vendors = document.getElementById('vendors');
    if (!eventTab || !vendorTab || !events || !vendors) return;

    // The existing tab styles apply to this button automatically.
    const guildTab = document.createElement('button');
    guildTab.id = 'guilds-tab';
    guildTab.type = 'button';
    guildTab.setAttribute('role', 'tab');
    guildTab.setAttribute('aria-controls', 'guilds');
    guildTab.setAttribute('aria-selected', 'false');
    guildTab.tabIndex = -1;
    guildTab.dataset.view = 'guilds';
    guildTab.textContent = '⚑ GUILDS';
    tabBar.append(guildTab);

    const panel = document.createElement('section');
    panel.id = 'guilds';
    panel.className = 'guilds-inline';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'guilds-tab');
    panel.hidden = true;

    const frame = document.createElement('iframe');
    frame.id = 'guilds-inline-frame';
    frame.title = 'Guild Directory: standings, influence, and territory map';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'same-origin';
    panel.append(frame);
    tabBar.after(panel);

    // Move, don't duplicate, the Guilds navigation entry.
    for (const link of document.querySelectorAll('header nav a')) {
      const href = link.getAttribute('href') || '';
      if (/\/guilds\/?(?:[?#]|$)/i.test(href) && /^guilds$/i.test(link.textContent.trim())) {
        link.remove();
      }
    }

    function deactivateGuilds() {
      panel.hidden = true;
      guildTab.classList.remove('selected');
      guildTab.setAttribute('aria-selected', 'false');
      guildTab.tabIndex = -1;
    }

    function activateGuilds() {
      events.hidden = true;
      vendors.hidden = true;
      panel.hidden = false;
      for (const tab of [eventTab, vendorTab, guildTab]) {
        const selected = tab === guildTab;
        tab.classList.toggle('selected', selected);
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.tabIndex = selected ? 0 : -1;
      }
      if (!frame.getAttribute('src')) frame.src = '/guilds/?embed=1';
      if (location.hash !== '#guilds') history.pushState(null, '', '#guilds');
    }

    // Capture before the site's existing tab listeners, so guilds isn't
    // accidentally interpreted as a third variant of Event Watch/Vendors.
    guildTab.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      activateGuilds();
    }, true);
    for (const tab of [eventTab, vendorTab]) {
      tab.addEventListener('click', () => deactivateGuilds(), true);
    }

    // Load the same-origin guild page without its second navigation bar.
    // A stylesheet link works with the site's style-src 'self' CSP.
    frame.addEventListener('load', () => {
      let doc;
      try { doc = frame.contentDocument; } catch { return; }
      if (!doc?.head || !doc.body) return;
      if (!doc.querySelector('#guilds-embed-style')) {
        const css = doc.createElement('link');
        css.id = 'guilds-embed-style';
        css.rel = 'stylesheet';
        css.href = '/guild-embed-inner.css';
        doc.head.append(css);
      }
      const resize = () => {
        if (!doc.documentElement || !doc.body) return;
        const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 620);
        frame.style.height = `${height + 6}px`;
      };
      resize();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(resize);
        observer.observe(doc.documentElement);
        observer.observe(doc.body);
      }
      doc.addEventListener('click', () => requestAnimationFrame(resize), true);
    });

    window.addEventListener('popstate', () => {
      if (location.hash === '#guilds') activateGuilds();
      else if (!panel.hidden) {
        deactivateGuilds();
        (location.hash === '#vendors' ? vendorTab : eventTab).click();
      }
    });

    if (location.hash === '#guilds') activateGuilds();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
