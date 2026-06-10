/* AFRIBN — legal doc renderer (TOC + numbered sections) */
(function () {
  const NS = window.AFRIBN || {};
  NS.legalDoc = function (sections) {
    const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const toc = document.getElementById('toc');
    const body = document.getElementById('body');
    if (toc) toc.innerHTML = sections.map((s, i) => `<a href="#${slug(s[0])}">${i + 1}. ${s[0]}</a>`).join('');
    if (body) body.innerHTML = sections.map((s, i) => {
      const paras = Array.isArray(s[1]) ? s[1] : [s[1]];
      return `<h2 id="${slug(s[0])}">${i + 1}. ${s[0]}</h2>` + paras.map(p =>
        p.startsWith('• ') ? `<ul>${p.split('\n').map(li => `<li>${li.replace(/^• /, '')}</li>`).join('')}</ul>` : `<p>${p}</p>`
      ).join('');
    }).join('');
  };
})();
