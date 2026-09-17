/* ══════════════════════════════════════════════════════════════
   CONTATO — o pedido de demonstração

   O site é estático e não tem servidor para receber formulário. Em vez de
   depender de um serviço de terceiros, o formulário MONTA A MENSAGEM e abre o
   WhatsApp com ela pronta: quem pede a demonstração confere e envia. Nada do
   que foi preenchido fica gravado neste site.

   O idioma da demonstração (a escolha que já existia, feita pela Laura)
   continua valendo: ele decide a língua da mensagem, do e-mail e dos botões.
   ══════════════════════════════════════════════════════════════ */
(function(){
  var cta = document.getElementById('contato');
  var form = document.getElementById('formDemo');
  if (!cta || !form) return;

  var FONE = '5551993476688', EMAIL = 'Valentrax.ai@gmail.com';
  var botoes = [].slice.call(form.querySelectorAll('.seg button'));
  var enviar = form.querySelector('button[type="submit"] .t');
  var erro   = form.querySelector('.erro-form');
  var mail   = document.getElementById('ctaMail');
  var wa     = document.getElementById('ctaWa');
  var lang   = 'pt';

  var idiomas = {
    pt: {
      abertura: 'Olá! Gostaria de agendar uma demonstração da Valentrax.',
      rotulos:  { nome: 'Nome', cargo: 'Cargo', hospital: 'Hospital', natureza: 'Natureza', leitos: 'Leitos',
                  sistema: 'Sistema atual', modulos: 'Módulos de interesse', idioma: 'Idioma da demonstração' },
      idiomaValor: 'Português',
      assunto:  'Demonstração da Valentrax',
      botao:    'Pedir demonstração pelo WhatsApp',
      faltou:   'Preencha nome, cargo e hospital para montar o pedido.',
      zapDireto:'Olá! Gostaria de conhecer a Valentrax e agendar uma demonstração.'
    },
    en: {
      abertura: 'Hello! I would like to schedule a Valentrax demo, in English.',
      rotulos:  { nome: 'Name', cargo: 'Role', hospital: 'Hospital', natureza: 'Type', leitos: 'Beds',
                  sistema: 'Current system', modulos: 'Modules of interest', idioma: 'Demo language' },
      idiomaValor: 'English',
      assunto:  'Valentrax demo (in English)',
      botao:    'Request a demo on WhatsApp',
      faltou:   'Please fill in name, role and hospital.',
      zapDireto:'Hello! I would like to know Valentrax and schedule a demo in English.'
    }
  };

  function valor(nome){
    var el = form.elements[nome];
    return el && el.value ? String(el.value).trim() : '';
  }
  function modulos(){
    return [].slice.call(form.querySelectorAll('input[name="modulos"]:checked')).map(function(c){ return c.value; });
  }

  /* A mensagem só leva o que foi preenchido — linha vazia não vai. */
  function mensagem(){
    var t = idiomas[lang], r = t.rotulos, linhas = [t.abertura, ''];
    [['nome','nome'], ['cargo','cargo'], ['hospital','hospital'], ['natureza','natureza'], ['leitos','leitos'], ['sistema','sistema']]
      .forEach(function(p){ var v = valor(p[0]); if (v) linhas.push(r[p[1]] + ': ' + v); });
    var m = modulos();
    if (m.length) linhas.push(r.modulos + ': ' + m.join(', '));
    linhas.push(r.idioma + ': ' + t.idiomaValor);
    return linhas.join('\n');
  }

  function atualizarLinks(){
    var t = idiomas[lang];
    var preenchido = valor('nome') || valor('hospital');
    mail.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(t.assunto) +
                '&body=' + encodeURIComponent(preenchido ? mensagem() : t.zapDireto);
    wa.href = 'https://wa.me/' + FONE + '?text=' + encodeURIComponent(t.zapDireto);
  }

  function aplicarIdioma(novo){
    lang = idiomas[novo] ? novo : 'pt';
    enviar.textContent = idiomas[lang].botao;
    botoes.forEach(function(b){
      var ligado = b.getAttribute('data-lang') === lang;
      b.classList.toggle('on', ligado);
      b.setAttribute('aria-pressed', String(ligado));
    });
    if (!erro.hidden) erro.textContent = idiomas[lang].faltou;
    atualizarLinks();
  }

  botoes.forEach(function(b){
    b.addEventListener('click', function(){ aplicarIdioma(b.getAttribute('data-lang')); });
  });
  form.addEventListener('input', atualizarLinks);
  form.addEventListener('change', atualizarLinks);

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var faltando = ['nome', 'cargo', 'hospital'].filter(function(n){ return !valor(n); });
    if (faltando.length){
      erro.textContent = idiomas[lang].faltou;
      erro.hidden = false;
      var primeiro = form.elements[faltando[0]];
      if (primeiro) primeiro.focus();
      return;
    }
    erro.hidden = true;
    var url = 'https://wa.me/' + FONE + '?text=' + encodeURIComponent(mensagem());
    /* ⚠️ Sem 'noopener' nos parâmetros: com ele, window.open SEMPRE devolve
       null, e o teste abaixo abriria o WhatsApp de novo na mesma aba. O
       isolamento é feito à mão, zerando o opener. */
    var janela = window.open(url, '_blank');
    if (janela) { try { janela.opener = null; } catch (err) {} }
    else window.location.href = url;          /* bloqueador de pop-up: abre na mesma aba */
  });

  aplicarIdioma('pt');
})();
