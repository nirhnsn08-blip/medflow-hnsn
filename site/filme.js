/* O filme institucional da página — ver site/README.md, seção "O filme". */
(function(){
  /* ══════════════════════════════════════════════════════════════
     LOCUÇÃO — quando houver o MP3 gravado, é só preencher aqui:
       TRILHA = "narracao.mp3"  (publicado junto com esta página)
       MARCAS = [0, 8.5, 18, 22.8, ...]  ← segundo em que CADA cena
                entra, na ordem. Com a trilha, o áudio comanda o filme.
                Vazio, roda pelos tempos de cada cena.
     ══════════════════════════════════════════════════════════════ */
  var TRILHA = "";
  var MARCAS = null;

  var root = document.getElementById('filme');
  if (!root) return;
  var scenes = [].slice.call(root.querySelectorAll('.scene'));
  var says   = scenes.map(function(s){ return s.getAttribute('data-say') || ''; });
  var durs   = scenes.map(function(s){ return parseInt(s.getAttribute('data-d'), 10) || 5000; });
  var cc     = root.querySelector('.cc');
  var ccFora = root.querySelector('.cc-fora');   /* a legenda legível no celular */
  var prog   = root.querySelector('.prog');
  var clock  = root.querySelector('.clock');
  var pp     = root.querySelector('.pp');
  var rp     = root.querySelector('.rp');
  var lg     = root.querySelector('.lg');
  var poster = root.querySelector('.poster');

  var caption = true;
  var i = 0, playing = false, done = false, timer = null, tick = null;
  var sceneAt = 0, left = 0, t0 = 0, elapsed = 0, lastWithin = 0;

  var track = null;
  if (TRILHA && MARCAS && MARCAS.length === scenes.length){
    track = new Audio(TRILHA);
    track.preload = 'auto';
    track.addEventListener('timeupdate', function(){
      if (!playing) return;
      var t = track.currentTime, n = 0;
      for (var k = 0; k < MARCAS.length; k++){ if (t >= MARCAS[k]) n = k; }
      if (n !== i) enter(n);
    });
    track.addEventListener('ended', finish);
  }

  function fmt(ms){
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function paint(){
    var within = playing ? Math.min(1, (Date.now() - sceneAt) / durs[i]) : lastWithin;
    if (playing) lastWithin = within;
    var pct = done ? 100 : ((i + within) / scenes.length) * 100;
    prog.style.width = pct.toFixed(2) + '%';
    clock.textContent = 'cena ' + (i + 1) + ' / ' + scenes.length + ' · ' + fmt(elapsed + (playing ? Date.now() - t0 : 0));
  }
  function clearTimers(){ clearTimeout(timer); timer = null; }

  function enter(n, resumeMs){
    clearTimers();
    i = n;
    for (var k = 0; k < scenes.length; k++) scenes[k].classList.remove('on');
    void scenes[i].offsetWidth;              /* reinicia as animações da cena */
    scenes[i].classList.add('on');
    cc.textContent = says[i];
    if (ccFora) ccFora.textContent = says[i];
    sceneAt = Date.now();
    left = resumeMs || durs[i];
    if (!playing || track) return;           /* com trilha, quem vira a cena é o áudio */
    timer = setTimeout(advance, left);
  }
  function advance(){
    if (!playing) return;
    if (i + 1 < scenes.length){
      var nx = i + 1;
      timer = setTimeout(function(){ if (playing) enter(nx); }, 300);
    } else {
      finish();
    }
  }
  function finish(){
    playing = false; clearTimers();
    done = true;
    root.classList.remove('pausado');
    if (track) { try { track.pause(); } catch (e) {} }
    elapsed += Date.now() - t0;
    root.classList.remove('playing');
    poster.querySelector('.plabel').textContent = 'Ver de novo';
    setBtn(); paint();
  }
  function setBtn(){
    /* ícone em SVG: os caracteres ► e ❚❚ mudavam de tamanho e de altura em cada sistema */
    pp.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg><span>Pausar</span>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6L19 12z"/></svg><span>Reproduzir</span>';
  }
  function start(){
    if (playing) return;
    done = false;
    playing = true; t0 = Date.now();
    root.classList.add('playing');
    root.classList.remove('pausado');
    setBtn();
    enter(i, left);
    if (track) { try { track.play(); } catch (e) {} }
    if (!tick) tick = setInterval(paint, 250);
  }
  function pause(){
    if (!playing) return;
    playing = false;
    elapsed += Date.now() - t0;
    left = Math.max(600, durs[i] - (Date.now() - sceneAt));
    clearTimers();
    root.classList.add('pausado');          /* "Pausar" congela também as animações */
    if (track) { try { track.pause(); } catch (e) {} }
    setBtn(); paint();
  }
  function restart(){
    playing = false; clearTimers();
    i = 0; left = durs[0]; elapsed = 0; lastWithin = 0; done = false;
    if (track) { try { track.pause(); track.currentTime = 0; } catch (e) {} }
    poster.querySelector('.plabel').textContent = 'Assistir';
    start();
  }

  poster.addEventListener('click', function(){ if (!playing) { done ? restart() : start(); } });
  pp.addEventListener('click', function(){ playing ? pause() : (done ? restart() : start()); });
  rp.addEventListener('click', restart);
  lg.addEventListener('click', function(){
    caption = !caption;
    lg.setAttribute('aria-pressed', String(caption));
    cc.classList.toggle('off', !caption);
    if (ccFora) ccFora.classList.toggle('off', !caption);
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && playing) pause(); });

  /* botões "Assista ao vídeo" do topo da página */
  [].slice.call(document.querySelectorAll('[data-play]')).forEach(function(b){
    b.addEventListener('click', function(e){
      e.preventDefault();
      var sec = document.getElementById('filmsec');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function(){ if (!playing) { done ? restart() : start(); } }, 520);
    });
  });

  cc.textContent = says[0];
  if (ccFora) ccFora.textContent = says[0];
  paint();
})();
