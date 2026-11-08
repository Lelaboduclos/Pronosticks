/* ==========================================================
   Écran d'introduction « Le Labo du Clos » (splash)
   - s'affiche 3 secondes au chargement, puis s'efface en fondu
   - un appui sur l'écran le ferme tout de suite
   ========================================================== */
(function () {
  var splash = document.getElementById('splash');
  if (!splash) return;                 // rien à faire si le bloc HTML est absent

  var DUREE = 3000;                    // durée d'affichage, en millisecondes
  var NB_ETINCELLES = 14;

  // 1. Étincelles dorées et cyan qui montent
  var zone = splash.querySelector('.spl-sparks');
  for (var i = 0; i < NB_ETINCELLES; i++) {
    var s = document.createElement('div');
    s.className = 'spl-spark' + (Math.random() > 0.5 ? ' spl-cyan' : '');
    s.style.left = (10 + Math.random() * 80) + '%';
    s.style.bottom = (5 + Math.random() * 20) + '%';
    s.style.animationDuration = (4 + Math.random() * 5) + 's';
    s.style.animationDelay = (Math.random() * 6) + 's';
    zone.appendChild(s);
  }

  // 2. Fermeture : fondu puis suppression du bloc
  var ferme = false;
  function fermer() {
    if (ferme) return;
    ferme = true;
    splash.classList.add('splash-out');
    setTimeout(function () {
      if (splash.parentNode) splash.parentNode.removeChild(splash);
    }, 700);
  }
  splash.addEventListener('click', fermer);

  // 3. Le compte à rebours de 3 s démarre quand le logo est affiché
  var img = splash.querySelector('img');
  function demarrer() { setTimeout(fermer, DUREE); }
  if (!img || img.complete) { demarrer(); }
  else {
    img.addEventListener('load', demarrer);
    img.addEventListener('error', demarrer);
  }
  setTimeout(fermer, DUREE + 4000);    // sécurité : jamais plus de 7 s au total
})();
