/* ============================================================
   AFRIBN — shared runtime: logo, icons, shell, charts, map
   ============================================================ */
(function () {
  const NS = {};
  window.AFRIBN = NS;

  // The 10 launch markets — selectable anywhere via the top-nav country picker.
  NS.MARKETS = [
    { name: 'Nigeria', flag: 'nigeria', slug: 'nigeria' },
    { name: 'South Africa', flag: 'southafrica', slug: 'south-africa' },
    { name: 'Kenya', flag: 'kenya', slug: 'kenya' },
    { name: 'Egypt', flag: 'egypt', slug: 'egypt' },
    { name: 'Morocco', flag: 'morocco', slug: 'morocco' },
    { name: 'Ghana', flag: 'ghana', slug: 'ghana' },
    { name: 'Rwanda', flag: 'rwanda', slug: 'rwanda' },
    { name: "Côte d'Ivoire", flag: 'cotedivoire', slug: 'cote-divoire' },
    { name: 'Tanzania', flag: 'tanzania', slug: 'tanzania' },
    { name: 'Uganda', flag: 'uganda', slug: 'uganda' }
  ];
  NS.countryHref = (name) => `/country?country=${encodeURIComponent(name)}`;

  if (document.head && !document.getElementById('afribn-cpick-css')) {
    const st = document.createElement('style');
    st.id = 'afribn-cpick-css';
    st.textContent = `
      .cpick{position:relative}
      .cpick-btn{display:flex;align-items:center;gap:7px;height:38px;padding:0 12px;border-radius:10px;border:1px solid var(--line,#262b36);background:var(--panel,#12151c);color:var(--ink,#e6e9ef);font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap}
      .cpick-btn:hover{border-color:rgba(232,37,45,.45)}
      .cpick-btn svg.chev{width:14px;height:14px;opacity:.6}
      .cpick-menu{position:absolute;top:46px;right:0;z-index:60;min-width:212px;max-height:344px;overflow:auto;padding:6px;border-radius:12px;border:1px solid var(--line,#262b36);background:var(--panel-2,#161a22);box-shadow:0 18px 40px rgba(0,0,0,.45);display:none}
      .cpick.open .cpick-menu{display:block}
      .cpick-opt{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;color:var(--ink-2,#c2c7d0);font-size:13.5px;text-decoration:none;cursor:pointer}
      .cpick-opt:hover{background:var(--red-tint,rgba(232,37,45,.1));color:#fff}
      .cpick-opt .flag{width:20px;height:13px;border-radius:2px;flex:none}
      @media(max-width:760px){.cpick-btn .cpick-label{display:none}}
    `;
    document.head.appendChild(st);
  }

  const svgNS = (inner, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;
  const READABLE_KEY = 'afribn_readable_text';

  function readableEnabled() {
    try { return localStorage.getItem(READABLE_KEY) === '1'; }
    catch (e) { return false; }
  }

  function setReadableText(on) {
    document.documentElement.classList.toggle('afribn-readable', !!on);
    try { localStorage.setItem(READABLE_KEY, on ? '1' : '0'); }
    catch (e) {}
  }

  setReadableText(readableEnabled());
  NS.setReadableText = setReadableText;

  /* ---------- eagle mark ---------- */
  NS.markSVG = `<svg class="mark" viewBox="0 0 140 104" fill="currentColor" aria-hidden="true">
    <path d="M78 30 Q40 13 9 7 Q44 22 66 39 Z"/>
    <path d="M66 47 Q33 36 5 35 Q34 43 56 53 Z"/>
    <path d="M58 61 Q33 55 17 57 Q36 61 52 67 Z"/>
    <path fill-rule="evenodd" d="
      M57 31 Q88 15 112 33 Q126 42 131 46 Q124 52 116 52 Q127 61 119 72
      Q112 78 107 70 Q104 63 99 60 L107 57 Q92 57 85 55 Q71 61 62 56
      Q55 49 57 39 Z
      M86 40 L105 35 L98 47 Z
    "/>
  </svg>`;

  NS.logo = (opts = {}) => {
    const href = opts.href || '/';
    const h = 63;
    return `<a class="logo" href="${href}" aria-label="AFRIBN"><img class="logo-img" src="/assets/afribn-logo.png" alt="AFRIBN" style="height:${h}px"></a>`;
  };

  /* ---------- icons (lucide-derived) ---------- */
  const I = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    feed: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    file: '<path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M8 13h8M8 17h6"/>',
    policy: '<path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5z"/><path d="m9 12 2 2 4-4"/>',
    deal: '<rect x="2" y="7" width="20" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M2 12h20"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    gauge: '<circle cx="12" cy="12" r="9"/><path d="M12 12 16 8"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
    settings: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-2.7 1.15V21a2 2 0 1 1-4 0v-.09A1.6 1.6 0 0 0 6.7 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 2.6 14H2.5a2 2 0 1 1 0-4h.09A1.6 1.6 0 0 0 4.6 6.7a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 10 2.6h0A1.6 1.6 0 0 0 11 1.1L11 1a2 2 0 1 1 4 0v.09a1.6 1.6 0 0 0 2.7 1.15 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 21.4 9h.1a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.01.99z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    chevRight: '<path d="m9 6 6 6-6 6"/>',
    chevLeft: '<path d="m15 6-6 6 6 6"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    arrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    filter: '<path d="M4 4h16l-6 8v6l-4 2v-8z"/>',
    trendUp: '<path d="M3 17 9 11l4 4 8-8"/><path d="M14 7h7v7"/>',
    trendDown: '<path d="M3 7 9 13l4-4 8 8"/><path d="M14 17h7v-7"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    bank: '<path d="M3 21h18M4 10h16M5 21V10M19 21V10M9 21V10M15 21V10M12 3 3 8h18z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    scale: '<path d="M12 3v18M7 7h10M5 7l-3 7h6zM19 7l-3 7h6zM7 21h10"/>',
    shield: '<path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M14 7a5 5 0 0 1 0 10"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-6 5-9 16-9 0 9-4 16-9 16z"/><path d="M11 13c2-3 4-4 7-5"/>',
    factory: '<path d="M3 21h18M4 21V9l6 4V9l6 4V5l4 2v14"/>',
    barChart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7"/><rect x="12" y="7" width="3" height="11"/><rect x="17" y="13" width="3" height="5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
    alertTri: '<path d="M12 3 2 20h20z"/><path d="M12 10v5M12 18v.5"/>',
    flame: '<path d="M12 2c2 4 6 5 6 10a6 6 0 0 1-12 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 0-6 2-9z"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
    check: '<path d="m5 12 5 5 9-9"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    handshake: '<path d="m11 17 2 2 4-4 3 3M3 12l4-4 4 4-2 2"/><path d="m13 8 3-3 4 4-3 3"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    oil: '<path d="M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>',
    doc2: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M12 3v13M7 8l5-5 5 5"/>',
    listChecks: '<path d="m3 7 2 2 3-3M3 17l2 2 3-3M11 8h10M11 16h10"/>',
    server2: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 9a1.5 1.5 0 0 0 1.3 2.2h11.4A1.5 1.5 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/><path d="M12 8v4l3 2"/>',
    dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    branch: '<circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="7" r="2.5"/><path d="M6 7.5v9M18 9.5c0 4-6 2-6 6.5"/>',
    link2: '<path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    xCircle: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  };
  NS.ic = (name, attrs = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${attrs}>${I[name] || ''}</svg>`;

  /* ---------- roles + nav config ---------- */
  const ALL = ['client', 'analyst', 'agent', 'verifier', 'admin'];
  const INTERNAL = ['analyst', 'agent', 'verifier', 'admin'];
  NS.ROLE_LABEL = { client: 'Client', analyst: 'Analyst', agent: 'Field Agent', verifier: 'Verifier', admin: 'Admin' };
  // Role is authoritative from the authenticated session: set at login from the
  // server and NOT user-switchable (prevents client-side privilege escalation).
  // Server-side RBAC enforces the real permissions regardless. Defaults to the
  // least-privileged role if somehow unset.
  NS.role = () => localStorage.getItem('afribn_role') || 'client';

  // [icon, label, href, group, roles, badge]
  const NAV = [
    ['home', 'Home', '/home', 'Intelligence', ALL],
    ['feed', 'Feed', '/feed', 'Intelligence', ALL],
    ['bell', 'Alerts', '/alerts', 'Intelligence', ALL, 4],
    ['star', 'Watchlist', '/watchlist', 'Intelligence', INTERNAL],
    ['globe', 'Country Intelligence', '/country', 'Intelligence', ALL],
    ['grid', 'Dashboards', '/dashboards', 'Intelligence', INTERNAL],
    ['file', 'Reports', '/reports', 'Intelligence', ALL],
    ['policy', 'Policy Monitor', '/policy', 'Intelligence', INTERNAL],
    ['deal', 'Deal Tracker', '/deal', 'Intelligence', INTERNAL],
    ['calendar', 'Event Tracker', '/event', 'Intelligence', ALL],
    ['gauge', 'Risk Dashboard', '/risk', 'Intelligence', INTERNAL],
    ['database', 'Sources', '/sources', 'Production', INTERNAL],
    ['refresh', 'Collection Jobs', '/jobs', 'Production', INTERNAL],
    ['inbox', 'Raw Articles', '/raw', 'Production', INTERNAL],
    ['edit', 'Intelligence Items', '/workspace', 'Production', INTERNAL],
    ['listChecks', 'Verification', '/verification', 'Production', INTERNAL],
    ['send', 'Published Intelligence', '/published', 'Production', INTERNAL],
    ['sliders', 'Admin / Operations', '/admin', 'Operations', ['admin']],
  ];

  /* ---------- shell ---------- */
  NS.shell = (active) => {
    const role = NS.role();
    const side = document.getElementById('sidebar');
    if (side) {
      const groups = ['Intelligence', 'Production', 'Operations'];
      let body = '';
      groups.forEach(g => {
        const items = NAV.filter(n => n[3] === g && n[4].includes(role));
        if (!items.length) return;
        if (g !== 'Intelligence') body += `<div class="nav-group">${g}</div>`;
        body += `<nav class="nav">` + items.map(([icon, label, href, grp, roles, badge]) => {
          if (role === 'client' && href === '/country') label = 'Country Brief';
          if (role === 'client' && href === '/event') label = 'Event Monitor';
          const on = icon === active ? ' active' : '';
          const bdg = badge ? `<span class="nav-badge">${badge}</span>` : '';
          return `<a class="nav-item${on}" href="${href}">${NS.ic(icon)}<span>${label}</span>${bdg}</a>`;
        }).join('') + `</nav>`;
      });
      side.innerHTML = `
        <div class="brand">${NS.logo()}</div>
        <div class="nav-scroll">${body}</div>
        <div class="nav-sep"></div>
        <nav class="nav">
          <a class="nav-item" href="#">${NS.ic('settings')}<span>Settings</span></a>
          <a class="nav-item" href="/login?logout=1">${NS.ic('logout')}<span>Log out</span></a>
        </nav>`;
    }
    const top = document.getElementById('topbar');
    if (top) {
      top.innerHTML = `
        <button class="icon-btn menu-btn" id="menuBtn" title="Menu">${NS.ic('menu')}</button>
        <div class="search">
          ${NS.ic('search')}
          <input placeholder="Search countries, topics, companies..." />
          <span class="kbd">/</span>
        </div>
        <div class="topbar-actions">
          <div class="cpick" id="cpick">
            <button class="cpick-btn" id="cpickBtn" title="Select a country" aria-label="Select a country">${NS.ic('globe')}<span class="cpick-label">Countries</span>${NS.ic('chevDown', 'class="chev"')}</button>
            <div class="cpick-menu" id="cpickMenu">${NS.MARKETS.map((m) => `<a class="cpick-opt" href="${NS.countryHref(m.name)}">${NS.flag(m.flag)}<span>${m.name}</span></a>`).join('')}</div>
          </div>
          <button class="icon-btn readability-btn" id="readabilityBtn" title="Use larger text" aria-label="Use larger text" aria-pressed="false"><span>Aa</span></button>
          <a class="icon-btn" href="/alerts" title="Alerts">${NS.ic('bell')}<span class="dot"></span></a>
          <button class="icon-btn" id="messageBtn" title="Messages">${NS.ic('message')}<span class="badge-count" id="messageBadge">0</span></button>
          <div class="avatar" id="avatarBtn" tabindex="0">
            <img src="${NS.AVATAR}" alt="David" />
            <div class="av-meta"><div class="av-name">David Okoye</div><div class="av-role">${NS.ROLE_LABEL[role]}</div></div>
            ${NS.ic('chevDown')}
            <div class="av-menu" id="avMenu">
              <div class="av-head">Signed in as <span class="muted" style="font-weight:400">${NS.ROLE_LABEL[role] || 'Client'}</span></div>
              <div class="av-sep"></div>
              <a class="av-opt" href="/login?logout=1">${NS.ic('logout', 'width="15" height="15"')} Log out</a>
            </div>
          </div>
        </div>`;
      const inp = top.querySelector('.search input');
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== inp && !/input|textarea/i.test(document.activeElement.tagName)) {
          e.preventDefault(); inp.focus();
        }
        if (e.key === 'Escape') inp.blur();
      });
      const cp = top.querySelector('#cpick');
      if (cp) {
        cp.querySelector('#cpickBtn').addEventListener('click', (e) => { e.stopPropagation(); cp.classList.toggle('open'); });
        document.addEventListener('click', () => cp.classList.remove('open'));
      }
      const av = top.querySelector('#avatarBtn'), menu = top.querySelector('#avMenu');
      av.addEventListener('click', (e) => { e.stopPropagation(); av.classList.toggle('open'); });
      document.addEventListener('click', () => av.classList.remove('open'));
      const mb = top.querySelector('#menuBtn');
      if (mb) mb.addEventListener('click', () => document.querySelector('.app')?.classList.toggle('nav-open'));
      const rb = top.querySelector('#readabilityBtn');
      if (rb) {
        const syncReadableButton = () => {
          const on = document.documentElement.classList.contains('afribn-readable');
          rb.classList.toggle('active', on);
          rb.setAttribute('aria-pressed', String(on));
          rb.title = on ? 'Use standard text' : 'Use larger text';
          rb.setAttribute('aria-label', rb.title);
        };
        rb.addEventListener('click', () => {
          const next = !document.documentElement.classList.contains('afribn-readable');
          setReadableText(next);
          syncReadableButton();
          NS.toast?.(next ? 'Readable text enabled' : 'Standard text restored', 'info');
        });
        syncReadableButton();
      }
    }
  };

  NS.AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23b9763f'/%3E%3Cstop offset='1' stop-color='%237a4a26'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='72' height='72' fill='url(%23g)'/%3E%3Ccircle cx='36' cy='28' r='14' fill='%233a2415'/%3E%3Cellipse cx='36' cy='66' rx='24' ry='20' fill='%232c1b10'/%3E%3C/svg%3E";

  /* ---------- flags (simplified svg chips) ---------- */
  const F = {
    nigeria:   'v|#16834a,#fff,#16834a',
    senegal:   'v|#0b7a3b,#ffd200,#e3132f|*ffd200',
    mali:      'v|#0b7a3b,#ffd200,#e3132f',
    kenya:     'h|#111,#b30000,#0b7a3b|kenya',
    ethiopia:  'h|#0b9a3b,#ffd200,#e3132f|disc#0a3a8f',
    ghana:     'h|#e3132f,#ffd200,#0b7a3b|star#111',
    drc:       'drc',
    southafrica:'sa',
    sudan:     'h|#e3132f,#fff,#111|tri#0b7a3b',
    southsudan:'h|#111,#e3132f,#0b7a3b|tri#0a3a8f',
    morocco:   'solid#c1272d|star#0b7a3b',
    angola:    'h|#e3132f,#e3132f,#111',
    mozambique:'h|#0b9a3b,#111,#ffd200|tri#e3132f',
    uganda:    'uganda',
    somalia:   'solid#4aa3df|star#fff',
    zambia:    'solid#0b7a3b',
    egypt:     'h|#e3132f,#fff,#111|disc#caa14a',
    rwanda:    'h|#1a6fc4,#ffd200,#0b9a3b',
    tanzania:  'tanzania',
    cotedivoire:'v|#ff8a00,#fff,#0b9a3b',
    ivorycoast:'v|#ff8a00,#fff,#0b9a3b',
    mauritius: 'h4|#e3132f,#1a3aa0,#ffd200,#0b7a3b',
    botswana:  'bw',
    tunisia:   'solid#e3132f|disc#fff',
    morocco2:  'solid#c1272d',
  };
  function flagInner(spec) {
    const W = 24, H = 16;
    if (spec === 'drc') return `<rect width='24' height='16' fill='#1a6fc4'/><path d='M0 13 L24 3' stroke='#ffd200' stroke-width='5'/><path d='M0 13 L24 3' stroke='#e3132f' stroke-width='2.4'/>`;
    if (spec === 'sa') return `<rect width='24' height='16' fill='#0b7a3b'/><path d='M0 0 L11 8 L0 16 Z' fill='#111'/><path d='M0 0 L9 8 L0 16' fill='none' stroke='#ffd200' stroke-width='2'/><path d='M11 5 H24 M11 11 H24' stroke='#fff' stroke-width='3.4'/><path d='M11 5.5 H24 M11 10.5 H24' stroke='#e3132f' stroke-width='1.2'/>`;
    if (spec === 'uganda') return `<rect width='24' height='16' fill='#111'/><rect y='2.66' width='24' height='2.66' fill='#ffd200'/><rect y='8' width='24' height='2.66' fill='#e3132f'/><rect y='13.3' width='24' height='2.7' fill='#ffd200'/><rect x='8.5' y='5.5' width='7' height='5' rx='3' fill='#fff'/>`;
    if (spec === 'tanzania') return `<rect width='24' height='16' fill='#1eb53a'/><path d='M0 16 24 0' stroke='#fcd116' stroke-width='6'/><path d='M0 16 24 0' stroke='#111' stroke-width='3.5'/><path d='M0 16 24 0' stroke='#00a3dd' stroke-width='1.2' opacity='.9'/>`;
    if (spec === 'bw') return `<rect width='24' height='16' fill='#6cb7e6'/><rect y='5.5' width='24' height='5' fill='#fff'/><rect y='6.7' width='24' height='2.6' fill='#111'/>`;
    const parts = spec.split('|');
    const layout = parts[0];
    let out = '';
    const emblem = parts.find(p => /^(disc|star|tri|kenya)/.test(p)) || (parts[2] && parts[2][0] === '*' ? parts[2] : '');
    if (layout.startsWith('solid')) {
      out += `<rect width='24' height='16' fill='${layout.slice(5)}'/>`;
    } else if (layout === 'v') {
      const cols = parts[1].split(',');
      cols.forEach((c, i) => out += `<rect x='${i * W / cols.length}' width='${W / cols.length}' height='16' fill='${c}'/>`);
    } else if (layout === 'h') {
      const cols = parts[1].split(',');
      cols.forEach((c, i) => out += `<rect y='${i * H / cols.length}' width='24' height='${H / cols.length}' fill='${c}'/>`);
    } else if (layout === 'h4') {
      const cols = parts[1].split(',');
      cols.forEach((c, i) => out += `<rect y='${i * 4}' width='24' height='4' fill='${c}'/>`);
    }
    parts.forEach(p => {
      if (p.startsWith('disc')) out += `<circle cx='12' cy='8' r='3.2' fill='${p.slice(4) || '#fff'}'/>`;
      if (p.startsWith('tri')) out += `<path d='M0 0 L8 8 L0 16 Z' fill='${p.slice(3)}'/>`;
      if (p.startsWith('star')) out += starPath(12, 8, 3.2, p.slice(4) || '#fff');
      if (p.startsWith('*')) {} // handled by layout
      if (p === 'kenya') { out += `<path d='M0 6 H24 V10 H0 Z' fill='#fff' opacity='.0'/>`; out += `<path d='M12 3 L13.4 8 L12 13 L10.6 8 Z' fill='#fff'/><path d='M12 3.6 L13 8 L12 12.4 L11 8 Z' fill='#b30000'/>`; }
    });
    return out;
  }
  function starPath(cx, cy, r, fill) {
    let d = '';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      const a2 = a + Math.PI / 5;
      d += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1);
      d += 'L' + (cx + r * 0.4 * Math.cos(a2)).toFixed(1) + ' ' + (cy + r * 0.4 * Math.sin(a2)).toFixed(1);
    }
    return `<path d='${d}Z' fill='${fill}'/>`;
  }
  NS.flag = (name, cls = 'flag') => {
    const key = (name || '').toLowerCase().replace(/[^a-z]/g, '');
    const alias = { drcongo: 'drc', southafrica: 'southafrica', southsudan: 'southsudan' };
    const spec = F[alias[key] || key];
    if (!spec) {
      return `<span class="${cls}" style="display:inline-grid;place-items:center;background:#1b1b21;color:#85858e">${NS.ic('globe', 'width="13" height="13"')}</span>`;
    }
    return `<svg class="${cls}" viewBox="0 0 24 16" preserveAspectRatio="none">${flagInner(spec)}</svg>`;
  };

  /* ---------- charts ---------- */
  // sparkline path
  NS.spark = (vals, { w = 120, h = 36, color = '#E8252D', fill = false, sw = 1.6 } = {}) => {
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
    const pts = vals.map((v, i) => [i * w / (vals.length - 1), h - 4 - ((v - mn) / rng) * (h - 8)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const id = 'sg' + Math.random().toString(36).slice(2, 7);
    const fillEl = fill
      ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
         <path d="${d} L${w} ${h} L0 ${h} Z" fill="url(#${id})"/>`
      : '';
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" style="display:block">${fillEl}<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };

  // donut: segs = [{value,color}]
  NS.donut = (segs, { size = 180, thick = 26, gap = 3 } = {}) => {
    const r = (size - thick) / 2, c = size / 2, circ = 2 * Math.PI * r;
    const total = segs.reduce((s, x) => s + x.value, 0) || 1;
    let off = 0;
    const rings = segs.map(s => {
      const len = (s.value / total) * circ;
      const dash = Math.max(0, len - gap);
      const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thick}" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})" stroke-linecap="butt"/>`;
      off += len;
      return el;
    }).join('');
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${rings}</svg>`;
  };

  // multi-series line chart (svg). series=[{color,vals}], labels
  NS.lineChart = (series, labels, { w = 640, h = 260, max = 100, pad = 34 } = {}) => {
    const n = series[0].vals.length;
    const px = i => pad + i * (w - pad - 12) / (n - 1);
    const py = v => h - 26 - (v / max) * (h - 26 - 12);
    let grid = '';
    for (let g = 0; g <= max; g += max / 5) {
      const y = py(g);
      grid += `<line x1="${pad}" y1="${y}" x2="${w - 12}" y2="${y}" stroke="rgba(255,255,255,0.05)"/><text x="${pad - 8}" y="${y + 4}" fill="#5c5c64" font-size="11" text-anchor="end">${g}</text>`;
    }
    let labelEls = labels.map((l, i) => `<text x="${px(i * (n - 1) / (labels.length - 1))}" y="${h - 6}" fill="#85858e" font-size="11" text-anchor="middle">${l}</text>`).join('');
    const lines = series.map(s => {
      const d = s.vals.map((v, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1)).join(' ');
      const id = 'lc' + Math.random().toString(36).slice(2, 6);
      const area = s.fill ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".28"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${px(n - 1)} ${h - 26} L${pad} ${h - 26} Z" fill="url(#${id})"/>` : '';
      const dots = s.dots ? s.vals.map((v, i) => `<circle cx="${px(i)}" cy="${py(v)}" r="2.6" fill="${s.color}"/>`).join('') : '';
      return area + `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` + dots;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block">${grid}${lines}${labelEls}</svg>`;
  };

  /* ---------- Africa dotted network map ---------- */
  NS.AFRICA_PATH = "M44.5 6 L52 5 L58.5 7 L62 6.5 L65.5 9 L66 13 L69 16 L70.5 21 L73 25 L77 28 L82 33 L85.5 38 L84 42 L78 41.5 L72.5 40 L69 43 L65 47 L63.5 53 L62 60 L60.5 67 L57.5 76 L54 85 L50 95 L47 99 L45 96.5 L44 89 L43 82 L40.5 77 L38 73 L35.5 69 L32 66 L28 64.5 L24 62 L19 58 L14.5 53 L11 47.5 L9.5 42 L12 38 L16 38 L19 36 L21 31 L22.5 25 L24 18 L27 12 L31 8 L37 6 Z";

  NS.africaMap = (opts = {}) => {
    const { w = 520, h = 560, nodes = [], links = [], mono = '#ff4d4d', glow = true } = opts;
    const uid = 'af' + Math.random().toString(36).slice(2, 6);
    // scale africa path (defined in 0..100 / 0..110 space) to viewbox
    const sx = w / 90, sy = h / 105;
    const nodeEls = nodes.map(nd => {
      const cx = nd.x * sx, cy = nd.y * sy, r = nd.r || 4;
      return `<g class="afnode">
        <circle cx="${cx}" cy="${cy}" r="${r * 3.4}" fill="${mono}" opacity="0.10"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="${mono}">${glow ? `<animate attributeName="opacity" values="1;0.5;1" dur="${2 + Math.random() * 2}s" repeatCount="indefinite"/>` : ''}</circle>
        <circle cx="${cx}" cy="${cy}" r="${r * 1.9}" fill="none" stroke="${mono}" stroke-width="0.8" opacity="0.5"/>
      </g>`;
    }).join('');
    const linkEls = links.map(([a, b]) => {
      const A = nodes[a], B = nodes[b];
      if (!A || !B) return '';
      const x1 = A.x * sx, y1 = A.y * sy, x2 = B.x * sx, y2 = B.y * sy;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.18;
      return `<path d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}" fill="none" stroke="${mono}" stroke-width="0.7" opacity="0.32"/>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block;overflow:visible">
      <defs>
        <radialGradient id="${uid}d" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stop-color="${mono}" stop-opacity="0.95"/>
          <stop offset="1" stop-color="${mono}" stop-opacity="0.45"/>
        </radialGradient>
        <pattern id="${uid}p" width="6.6" height="6.6" patternUnits="userSpaceOnUse">
          <circle cx="3.3" cy="3.3" r="1.25" fill="url(#${uid}d)"/>
        </pattern>
        <clipPath id="${uid}c"><path d="${NS.AFRICA_PATH}" transform="scale(${sx} ${sy})"/></clipPath>
      </defs>
      <g clip-path="url(#${uid}c)"><rect width="${w}" height="${h}" fill="url(#${uid}p)"/></g>
      ${linkEls}${nodeEls}
    </svg>`;
  };

  // simple red-shaded Africa silhouette (for small choropleth-style decorations)
  NS.africaSilhouette = (opts = {}) => {
    const { w = 300, h = 340, fill = '#3a0d10', stroke = 'rgba(232,37,45,0.4)' } = opts;
    const sx = w / 90, sy = h / 105;
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block"><path d="${NS.AFRICA_PATH}" transform="scale(${sx} ${sy})" fill="${fill}" stroke="${stroke}" stroke-width="0.6"/></svg>`;
  };

  /* ---------- procedural editorial scenes (image placeholders) ---------- */
  NS.scene = (kind, w = 400, h = 260) => {
    const tints = {
      bridge:  ['#1a2a3a', '#0c1722', '#e8a23d'],
      city:    ['#241a2a', '#0e0a14', '#c44a6a'],
      energy:  ['#2a1810', '#140a06', '#ff8a3d'],
      security:['#1c1418', '#0a0608', '#e5252a'],
      finance: ['#102018', '#06100a', '#3fb950'],
      industry:['#1a1410', '#0c0906', '#e3b341'],
      gas:     ['#101a22', '#060c12', '#4493f8'],
      tech:    ['#101626', '#070a14', '#6fb0ff'],
    };
    const t = tints[kind] || tints.city;
    const u = 'sc' + Math.random().toString(36).slice(2, 7);
    let scene = '';
    const ground = h * 0.72;
    if (kind === 'bridge') {
      const p1 = w * 0.34, p2 = w * 0.64, top = h * 0.2;
      scene = `
        <rect y="${ground}" width="${w}" height="${h - ground}" fill="#0a1019"/>
        <path d="M0 ${ground} H${w}" stroke="${t[2]}" stroke-width="1.5" opacity="0.5"/>
        <line x1="${p1}" y1="${top}" x2="${p1}" y2="${ground}" stroke="#243240" stroke-width="5"/>
        <line x1="${p2}" y1="${top}" x2="${p2}" y2="${ground}" stroke="#243240" stroke-width="5"/>
        ${[...Array(7)].map((_, i) => `<line x1="${p1}" y1="${top}" x2="${p1 - 60 + i * 20}" y2="${ground}" stroke="${t[2]}" stroke-width="0.7" opacity="0.45"/>`).join('')}
        ${[...Array(7)].map((_, i) => `<line x1="${p2}" y1="${top}" x2="${p2 - 60 + i * 20}" y2="${ground}" stroke="${t[2]}" stroke-width="0.7" opacity="0.45"/>`).join('')}
        <rect x="0" y="${ground - 4}" width="${w}" height="4" fill="#2c3a48"/>`;
    } else if (kind === 'energy' || kind === 'industry' || kind === 'gas') {
      scene = `<rect y="${ground}" width="${w}" height="${h - ground}" fill="#0b0805"/>
        ${[0.12, 0.3, 0.5, 0.68, 0.84].map((x, i) => {
          const bw = w * 0.07, bh = h * (0.22 + (i % 3) * 0.14), bx = w * x;
          return `<rect x="${bx}" y="${ground - bh}" width="${bw}" height="${bh}" fill="#1c1610"/><rect x="${bx}" y="${ground - bh}" width="${bw}" height="3" fill="${t[2]}" opacity="0.7"/>`;
        }).join('')}
        <circle cx="${w * 0.5}" cy="${h * 0.34}" r="${h * 0.12}" fill="${t[2]}" opacity="0.18"/>
        <path d="M${w * 0.84} ${ground - h * 0.5} q8 -14 0 -28 q-8 14 0 28" fill="${t[2]}" opacity="0.6"/>`;
    } else if (kind === 'finance') {
      const cx = w * 0.5, cw = w * 0.5, base = ground;
      scene = `<rect y="${ground}" width="${w}" height="${h - ground}" fill="#070d09"/>
        <rect x="${cx - cw / 2}" y="${h * 0.3}" width="${cw}" height="8" fill="#16261c"/>
        <path d="M${cx - cw / 2 - 10} ${h * 0.3} L${cx} ${h * 0.16} L${cx + cw / 2 + 10} ${h * 0.3} Z" fill="#16261c"/>
        ${[...Array(6)].map((_, i) => `<rect x="${cx - cw / 2 + 6 + i * (cw - 12) / 5}" y="${h * 0.3 + 8}" width="6" height="${base - h * 0.3 - 8}" fill="#13201a"/>`).join('')}
        <rect x="${cx - cw / 2}" y="${base - 6}" width="${cw}" height="6" fill="#1c3026"/>`;
    } else { // city / default
      scene = `<rect y="${ground}" width="${w}" height="${h - ground}" fill="#0a0710"/>
        ${[0.05, 0.16, 0.27, 0.38, 0.5, 0.62, 0.73, 0.84].map((x, i) => {
          const bw = w * 0.09, bh = h * (0.18 + ((i * 7) % 5) * 0.1), bx = w * x;
          return `<rect x="${bx}" y="${ground - bh}" width="${bw}" height="${bh}" fill="#15101c"/>` +
            [...Array(3)].map((_, r) => `<rect x="${bx + 4}" y="${ground - bh + 8 + r * 14}" width="${bw - 8}" height="3" fill="${t[2]}" opacity="0.25"/>`).join('');
        }).join('')}`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${t[0]}"/><stop offset="1" stop-color="${t[1]}"/></linearGradient>
        <radialGradient id="${u}g" cx="0.7" cy="0.2" r="0.8"><stop offset="0" stop-color="${t[2]}" stop-opacity="0.3"/><stop offset="1" stop-color="${t[2]}" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#${u})"/>
      <rect width="${w}" height="${h}" fill="url(#${u}g)"/>
      ${scene}
      <rect width="${w}" height="${h}" fill="#000" opacity="0.12"/>
    </svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  };

  /* ---------- shared UI helpers ---------- */
  // circular score ring
  NS.ring = (value, { size = 96, stroke = 9, color = '#E8252D', track = 'rgba(255,255,255,0.08)', max = 100, label = '' } = {}) => {
    const r = (size - stroke) / 2, c = size / 2, circ = 2 * Math.PI * r;
    const dash = (Math.max(0, Math.min(value, max)) / max) * circ;
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${dash} ${circ}" transform="rotate(-90 ${c} ${c})"/>
      <text x="${c}" y="${c - 2}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-family="Archivo,sans-serif" font-weight="800" font-size="${size * 0.3}">${value}</text>
      ${label ? `<text x="${c}" y="${c + size * 0.2}" text-anchor="middle" fill="#85858e" font-size="${size * 0.11}">${label}</text>` : ''}
    </svg>`;
  };

  // global toast
  NS.toast = (msg, kind) => {
    let t = document.getElementById('afribn-toast');
    if (!t) { t = document.createElement('div'); t.id = 'afribn-toast'; t.className = 'toast'; document.body.appendChild(t); }
    const icon = kind === 'ok' ? NS.ic('check', 'width="15" height="15"') : kind === 'warn' ? NS.ic('alertTri', 'width="15" height="15"') : '';
    t.innerHTML = (icon ? `<span style="color:${kind === 'ok' ? 'var(--green)' : 'var(--amber)'}">${icon}</span> ` : '') + msg;
    t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2400);
  };

  // status pill helper
  NS.statusPill = (text, color) =>
    `<span class="spill" style="background:${color}22;color:${color}"><span class="spill-dot" style="background:${color}"></span>${text}</span>`;

  if (!document.querySelector('script[data-afribn-backend]')) {
    const script = document.createElement('script');
    script.src = '/assets/backend.js';
    script.defer = true;
    script.dataset.afribnBackend = '1';
    document.head.appendChild(script);
  }

})();
