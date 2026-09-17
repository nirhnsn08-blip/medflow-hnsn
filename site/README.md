# site/ — a página de apresentação da Valentrax

Isto **não faz parte do sistema**. É a página que quem pesquisa "Valentrax"
encontra: apresentação, módulos, o filme institucional e o contato.

## Por que numa pasta separada

O sistema roda em `www.valentrax.com.br` e o hospital acessa por ali todo dia.
A página de apresentação atende o domínio **sem www** (`valentrax.com.br`), que
hoje só redireciona para o www.

Os dois são publicados como **projetos diferentes na Vercel, a partir deste
mesmo repositório**. Assim a página de marketing muda sem tocar em uma linha do
que está no ar no hospital — nenhum arquivo do sistema, nenhum `vercel.json`,
nenhuma configuração de build compartilhada.

| endereço | o que responde | projeto Vercel | pasta |
|---|---|---|---|
| `www.valentrax.com.br` | o sistema | o de sempre | raiz do repositório |
| `valentrax.com.br` | esta página | um segundo projeto | `site/` |

## Como publicar (uma vez só)

Na Vercel, criar um projeto novo apontando para este mesmo repositório e:

- **Root Directory:** `site`
- **Framework Preset:** Other
- **Build Command:** deixar vazio (não há build — é HTML estático)
- **Output Directory:** deixar vazio
- **Domínio:** `valentrax.com.br` (tirando o redirecionamento que ele tem hoje)

Nada muda no registro.br: o registro do domínio sem www já existe, só passa a
apontar para este projeto em vez de redirecionar.

## Conteúdo

- `index.html` — a página, sem dependência de build. Estilos e ícones estão
  dentro do arquivo.
- `filme.js` e `contato.js` — os dois scripts da página: o filme, e o pedido de
  demonstração (o formulário monta a mensagem e abre o WhatsApp com ela pronta —
  o site não tem servidor e não guarda nada; a escolha do idioma da demonstração
  continua lá dentro e decide a língua da mensagem). Saíram de dentro do HTML para a política de segurança
  do `vercel.json` poder usar `script-src self` sem hash — hash quebraria a
  cada edição do script.
- `nav.js` — acabamento da navegação: fecha o menu do celular (que é um
  `<details>` e abre sem JS), sombra no cabeçalho ao rolar, link da seção
  visível aceso e entrada suave das seções abaixo da dobra. Sem ele a página
  funciona igual.
- `404.html` — a página que a Vercel mostra para endereço inexistente.
- `img/hero-clinica-v1-*.avif|webp|jpg` — a foto do topo em 4 larguras (20–60 KB
  cada). O `hero-clinica.png` original (1,85 MB) continua na pasta, mas a página
  não usa mais. Trocar a foto = gerar os arquivos com nome novo (`-v2-`): o
  cache de `/img/` é `immutable`.
- `og-valentrax.jpg` — a prévia de 1200×630 que aparece no WhatsApp.
- `fonts/` — as três fontes, servidas pelo próprio site (ver `fonts/LICENCAS.md`).
- `favicon.svg`, `apple-touch-icon.png`, `icon-512.png`, `robots.txt`, `sitemap.xml`.
- `vercel.json` — cabeçalhos de segurança e cache. A política de conteúdo está
  como `Content-Security-Policy-Report-Only`: publicar, abrir a página, conferir
  que o console não reclama e só então renomear para `Content-Security-Policy`.

⚠️ **O acesso ao sistema aponta para `https://www.valentrax.com.br`** em dois
lugares: o link "Entrar" do cabeçalho e o "Acessar" do rodapé. O botão em
destaque do cabeçalho é "Agendar demonstração" — quem chega pela busca ainda não
é usuário. Se o endereço do sistema mudar, os dois links mudam juntos.

## O filme

O filme institucional é feito em HTML/CSS dentro da própria página, sem vídeo
gravado. A locução ainda não existe: quando houver o MP3, preencher `TRILHA` e
`MARCAS` no topo de `filme.js` — com a trilha preenchida, o
áudio passa a comandar a virada das cenas.

O palco do filme é 16:9 e **tudo lá dentro é medido em `cqw`** (porcentagem da
largura do palco), nunca em `vw` nem em pixel fixo. É isso que faz o conteúdo
encolher junto com a moldura em telas estreitas. Mexer nessa régua volta a
cortar as cenas no celular.

## Desempenho: o que não desfazer

- `main > section:not(.hero)` tem `content-visibility:auto`. O layout inicial
  da página inteira custava ~500 ms num celular médio (trace com CPU 4× mais
  lenta); com isso caiu para ~150 ms. Efeito colateral conhecido: ferramenta
  que fotografa a página inteira sem rolar vê as seções de baixo em branco —
  no navegador de verdade elas montam ao chegar perto da tela.
- A entrada das seções (`.surge`) só marca o que está abaixo da tela na carga,
  e lê a posição pelo IntersectionObserver — `getBoundingClientRect` na carga
  forçava layout extra.
