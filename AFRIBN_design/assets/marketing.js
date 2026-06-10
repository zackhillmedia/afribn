/* ============================================================
   AFRIBN — shared marketing chrome (nav + footer injector)
   Requires afribn.js (AFRIBN.logo, AFRIBN.ic) loaded first.
   ============================================================ */
(function () {
  const NS = window.AFRIBN || {};
  const ic = NS.ic;

  const NAVLINKS = [
    ['Product', 'product.html'],
    ['Solutions', 'solutions.html'],
    ['Pricing', 'pricing.html'],
    ['About Us', 'about.html'],
    ['Resources', 'resources.html'],
  ];

  NS.marketing = function (active) {
    const head = document.getElementById('mhead');
    if (head) {
      head.className = 'lnav';
      head.innerHTML = `
        <div class="wrap-m lnav-in">
          ${NS.logo()}
          <nav>${NAVLINKS.map(([l, h]) => `<a href="${h}"${l === active ? ' class="on"' : ''}>${l}</a>`).join('')}</nav>
          <div class="acts">
            <a class="btn btn-ghost btn-sm" href="login.html">Log in</a>
            <a class="btn btn-primary btn-sm" href="request-access.html">Request Access ${ic('arrowRight', 'width="16" height="16"')}</a>
          </div>
          <button class="mburger" id="mburger" aria-label="Menu">${ic('menu')}</button>
        </div>
        <div class="mmenu" id="mmenu">
          ${NAVLINKS.map(([l, h]) => `<a href="${h}">${l}</a>`).join('')}
          <a href="login.html">Log in</a>
          <a class="mm-cta" href="request-access.html">Request Access</a>
        </div>`;
      const burger = head.querySelector('#mburger'), menu = head.querySelector('#mmenu');
      burger.addEventListener('click', () => menu.classList.toggle('open'));
    }

    const foot = document.getElementById('mfoot');
    if (foot) {
      const COLS = [
        ['Product', [['Real-time Feed', 'product.html'], ['Country Intelligence', 'country.html'], ['Risk Dashboard', 'risk.html'], ['Executive Briefs', 'brief.html'], ['Pricing', 'pricing.html']]],
        ['Company', [['About Us', 'about.html'], ['Careers', 'careers.html'], ['Press', 'press.html'], ['Contact', 'contact.html']]],
        ['Resources', [['Methodology', 'methodology.html'], ['Sample Reports', 'sample-reports.html'], ['API', 'api.html'], ['Help Center', 'help.html']]],
      ];
      foot.innerHTML = `
        <div class="wrap-m">
          <div class="foot-grid">
            <div>
              ${NS.logo()}
              <p class="foot-blurb">Africa's strategic news intelligence network. Real-time monitoring across 54 countries for the people who shape the continent.</p>
              <div class="foot-social">
                <a href="#" aria-label="X">${ic('message')}</a>
                <a href="#" aria-label="LinkedIn">${ic('users')}</a>
                <a href="#" aria-label="Email">${ic('file')}</a>
              </div>
            </div>
            ${COLS.map(([h, links]) => `<div><h4>${h}</h4><ul>${links.map(([l, u]) => `<li><a href="${u}">${l}</a></li>`).join('')}</ul></div>`).join('')}
          </div>
          <div class="foot-bot">
            <span>© 2024 AFRIBN — Africa Bureau of News. All rights reserved.</span>
            <span class="foot-legal"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="security.html">Security</a></span>
          </div>
        </div>`;
    }
  };
})();
