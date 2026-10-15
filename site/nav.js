/* ══════════════════════════════════════════════════════════════
   NAVEGAÇÃO — o que a página faz enquanto a pessoa rola

   - menu do celular: é um <details>, abre sem JavaScript; aqui ele só fecha
     ao tocar num link, ao apertar Esc e ao tocar fora do painel;
   - cabeçalho ganha sombra depois que a página sai do topo;
   - o link do menu da seção que está na tela fica aceso;
   - as seções abaixo da dobra entram com um fade curto.

   Tudo é acabamento: sem este arquivo a página funciona igual.
   ══════════════════════════════════════════════════════════════ */
(function(){
  var header = document.querySelector('header');
  var menu = document.querySelector('details.menu');

  /* ── menu do celular ── */
  if (menu) {
    menu.addEventListener('click', function(e){
      if (e.target.closest('.painel a')) menu.open = false;
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
    });
    document.addEventListener('click', function(e){
      if (menu.open && !menu.contains(e.target)) menu.open = false;
    });
    menu.addEventListener('toggle', function(){
      menu.querySelector('summary').setAttribute('aria-label', menu.open ? 'Fechar menu' : 'Abrir menu');
    });
  }

  /* ── sombra do cabeçalho ── */
  function sombra(){ if (header) header.classList.toggle('rolou', window.scrollY > 8); }
  window.addEventListener('scroll', sombra, { passive: true });
  sombra();

  if (!('IntersectionObserver' in window)) return;

  /* ── link aceso ── */
  var links = [].slice.call(document.querySelectorAll('nav.main a.nl'));
  var alvos = links.map(function(a){ return document.querySelector(a.getAttribute('href')); });
  var espiao = new IntersectionObserver(function(entradas){
    entradas.forEach(function(en){
      if (!en.isIntersecting) return;
      links.forEach(function(a, k){ a.classList.toggle('atual', alvos[k] === en.target); });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  alvos.forEach(function(s){ if (s) espiao.observe(s); });

  /* ── entrada das seções ──
     Só marca o que está ABAIXO da tela na hora da carga: o que já está à vista
     não pisca, e quem chega por um link com âncora vê a seção pronta. */
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  /* A posição vem do próprio observador (primeira leitura de cada bloco), e
     não de getBoundingClientRect na carga — aquilo forçava um layout extra
     que o Lighthouse apontava como reflow. */
  var blocos = [].slice.call(document.querySelectorAll(
    'main section .sec-head, .personas, .mods, .painel-alertas, .passos, .preco, #filme, .facts, .br, .faq, .demo'));
  var jaLido = typeof WeakSet === 'function' ? new WeakSet() : null;
  if (!jaLido) return;
  var vigia = new IntersectionObserver(function(entradas){
    entradas.forEach(function(en){
      var el = en.target;
      if (!jaLido.has(el)) {
        jaLido.add(el);
        if (!en.isIntersecting && en.boundingClientRect.top > window.innerHeight) { el.classList.add('surge'); return; }
        vigia.unobserve(el); return;                 /* já estava à vista: fica como está */
      }
      if (en.isIntersecting) {
        /* dois quadros: o navegador precisa pintar o estado escondido antes */
        requestAnimationFrame(function(){ requestAnimationFrame(function(){ el.classList.add('visto'); }); });
        vigia.unobserve(el);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  blocos.forEach(function(el){ vigia.observe(el); });
})();
