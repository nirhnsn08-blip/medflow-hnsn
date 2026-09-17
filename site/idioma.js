/* Idioma da demonstração. O site continua em português: isto só troca a
   mensagem que vai no WhatsApp/e-mail e o rótulo dos dois botões, para a
   pessoa dizer em que língua quer a demo sem ter que escrever nada. */
(function(){
  var cta = document.getElementById('contato');
  if (!cta) return;
  var botoes = [].slice.call(cta.querySelectorAll('.seg button'));
  var wa    = document.getElementById('ctaWa');
  var mail  = document.getElementById('ctaMail');
  var waTxt = wa && wa.querySelector('.t');
  if (!botoes.length || !wa || !mail || !waTxt) return;

  var FONE = '5551993476688', EMAIL = 'Valentrax.ai@gmail.com';
  var idiomas = {
    pt: {
      zap:      'Olá! Gostaria de conhecer a Valentrax e agendar uma demonstração.',
      assunto:  'Demonstração da Valentrax',
      corpo:    'Olá! Gostaria de agendar uma demonstração da Valentrax, em português.',
      rotuloZap:'Agendar pelo WhatsApp',
      rotuloMail:'Enviar e-mail'
    },
    en: {
      zap:      'Hello! I would like to know Valentrax and schedule a demo in English.',
      assunto:  'Valentrax demo (in English)',
      corpo:    'Hello! I would like to schedule a Valentrax demo, in English.',
      rotuloZap:'Schedule on WhatsApp',
      rotuloMail:'Send an email'
    }
  };

  function aplicar(lang){
    var t = idiomas[lang] || idiomas.pt;
    wa.href = 'https://wa.me/' + FONE + '?text=' + encodeURIComponent(t.zap);
    mail.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(t.assunto) +
                '&body=' + encodeURIComponent(t.corpo);
    waTxt.textContent = t.rotuloZap;
    mail.textContent = t.rotuloMail;
    botoes.forEach(function(b){
      var ligado = b.getAttribute('data-lang') === lang;
      b.classList.toggle('on', ligado);
      b.setAttribute('aria-pressed', String(ligado));
    });
  }

  botoes.forEach(function(b){
    b.addEventListener('click', function(){ aplicar(b.getAttribute('data-lang')); });
  });
  aplicar('pt');
})();
