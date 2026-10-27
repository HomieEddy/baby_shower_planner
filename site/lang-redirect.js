// Root page only: send a French-speaking browser to /fr/ on its first visit.
// An explicit choice from the language switch (stored by site.js) always wins.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('site-lang'); } catch (e) { /* storage blocked */ }
  if (saved === 'en') return;
  var lang = (navigator.language || '').toLowerCase();
  if (saved === 'fr' || (saved === null && lang.indexOf('fr') === 0)) {
    location.replace('/fr/' + location.hash);
  }
})();
