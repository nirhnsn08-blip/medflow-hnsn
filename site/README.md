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

- `index.html` — a página inteira, sem dependência de build. Fontes vêm do
  Google Fonts; todo o resto (estilos, ícones, o filme) está dentro do arquivo.
- `hero-clinica.png` — a foto do topo.

⚠️ **O botão "Acessar Plataforma" aponta para `https://www.valentrax.com.br`.**
Se um dia o endereço do sistema mudar, tem que mudar aqui também — são dois
lugares no arquivo (o cabeçalho e o rodapé).

## O filme

O filme institucional é feito em HTML/CSS dentro da própria página, sem vídeo
gravado. A locução ainda não existe: quando houver o MP3, preencher `TRILHA` e
`MARCAS` no topo do `<script>` no fim do arquivo — com a trilha preenchida, o
áudio passa a comandar a virada das cenas.

O palco do filme é 16:9 e **tudo lá dentro é medido em `cqw`** (porcentagem da
largura do palco), nunca em `vw` nem em pixel fixo. É isso que faz o conteúdo
encolher junto com a moldura em telas estreitas. Mexer nessa régua volta a
cortar as cenas no celular.
