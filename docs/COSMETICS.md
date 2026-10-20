# Meu baú — primeira coleção

O menu do avatar abre por clique, fecha por clique fora ou Escape e oferece o Meu baú. O perfil também mantém o atalho Personalizar aparência. A janela tem prévia e seis categorias: molduras, avatares simbólicos, títulos, cards de perfil, assinatura de chat e capas. Personagens completos ficam para outra etapa.

A coleção permanente inicial fica disponível nesta fase, preservando todas as escolhas antigas. Inclui foto do GitHub, Pulso, Semente e Explorador; estilos Prestígio, Brasa e Bosque; e as molduras/capas anteriores. Os títulos são opções do catálogo, sem HTML ou scripts enviados pelo usuário. Os cosméticos não concedem XP.

Energia é a primeira coleção temporária: o usuário precisa clicar Receber coleção. Uma atualização condicional no MongoDB registra recebimento e expiração uma única vez. São sete dias corridos desde o recebimento, mesmo sem usar. Equipar, reabrir e repetir a requisição não renovam o prazo. Não há TTL removendo o registro: ele precisa permanecer para impedir novo recebimento.

GET /api/community/cosmetics retorna catálogo, disponibilidade, vencimento, aparência e hora do servidor; não concede itens. POST /cosmetics/welcome concede a coleção para a conta autenticada com proteção de origem. POST /cosmetics valida IDs e posse consultando o usuário atual no banco; ignora XP, posição e datas fornecidas pelo cliente. O servidor registra somente o vencimento autorizado em communityAppearance.expiresAt. Os DTOs públicos usam esse mapa para descartar efeitos vencidos, sem expor o inventário privado. O navegador também remove efeitos já carregados em até 30 segundos, com um relógio compartilhado apenas para aparências temporárias; a decisão autoritativa é do servidor.

Top 1, 2 e 3 da temporada recebem coroa numerada e destaque conforme a posição atual, tanto no perfil quanto no pódio. Não são itens equipáveis e não devem ser tratados como recompensa permanente. Os banners próprios e públicos ficaram maiores. Animações são discretas e respeitam movimento reduzido.

## Validação

Testes cobrem escolhas antigas, posse, datas forjadas, limite de expiração, fallback público, repetição e concorrência no MongoDB, ausência de alteração de XP, menu por clique, modal, bloqueio antes do recebimento, equipar e expiração em uma tela já aberta. Build de produção e verificações HTTP do Vite também fazem parte da validação. OAuth real e inspeção visual no navegador do usuário ainda precisam de conferência local.

Não foram adicionadas dependências nem assets de terceiros. As formas são SVG/CSS nativos e ícones do lucide já utilizado no projeto.

## Biblioteca gratuita — 90 escolhas adicionais

Foram selecionados 30 itens em cada categoria, mantendo os cosméticos antigos:

- Molduras de avatar: 30 peças do Portrait Frame Pack, de Screaming Brain Studios. Cinco materiais (madeira, pedra, mármore, metal e resina/plástico), seis acabamentos por material. Os PNGs têm 256 × 256; o fundo magenta foi convertido em transparência. Não foram contadas duas resoluções da mesma peça.
- Cards de perfil: 20 contornos diferentes de Kenney Fantasy UI Borders e dez painéis de Kenney UI Pack Adventure.
- Chat: dez contornos adicionais de Fantasy UI Borders, 12 painéis/faixas de UI Pack Adventure e oito faixas de UI Pack Sci-Fi (quatro formas com versões lisas e rebitadas).

São 90 opções de catálogo e 84 arquivos gráficos distintos: seis painéis são aproveitados tanto em cards como em chat. Dentro de cada categoria, os 30 arquivos têm hashes distintos. Há diferenças de material e acabamento entre molduras; não são 90 ilustrações desenhadas do zero. As bordas dos painéis usam `border-image`, mantendo os cantos ao adaptar o comprimento da mensagem ou o tamanho do perfil. Não há bibliotecas de interface novas nem dependências de runtime novas. Não foi incorporado código do Magic UI ou conteúdo dos pacotes pagos. Os outros pacotes da pesquisa ficaram reservados para avaliação futura.

Fontes e licenças verificadas:

- Screaming Brain Studios: https://screamingbrainstudios.itch.io/portrait-frame-pack
- Download alternativo do autor, CC0: https://opengameart.org/content/portrait-frame-pack
- Kenney Fantasy UI Borders: https://kenney.nl/assets/fantasy-ui-borders
- Kenney UI Pack Adventure: https://kenney.nl/assets/ui-pack-adventure
- Kenney UI Pack Sci-Fi: https://kenney.nl/assets/ui-pack-sci-fi
- Espelho dos vetores Kenney: https://github.com/Tiddybub/2d-assets/tree/main/ui

As quatro licenças originais estão em `client/public/cosmetics/licenses`. `provenance.json` registra origem e SHA-256 dos arquivos selecionados. `scripts/prepare_cosmetic_library.py` permite gerar novamente os assets e os dois manifestos a partir do cache de fontes documentado no script. As fontes comerciais, imagens com marca d'água e conteúdo restrito dos outros autores não foram usados.

### Liberação de conta

A conta proprietária `phzl0`, identificador GitHub `125362257`, tem todos os itens liberados de forma permanente, inclusive Energia. O servidor usa o identificador autenticado, nunca um login ou flag enviados no corpo da requisição. A lista pode ser substituída pela variável de servidor `COMMUNITY_COSMETIC_GITHUB_IDS` (IDs separados por vírgulas); valor vazio desativa a exceção. O Compose repassa essa configuração, mantendo o proprietário como padrão.

Para as outras contas, a coleção inicial mantém seu acesso anterior, Energia segue o recebimento de sete dias e a nova biblioteca aparece bloqueada para equipar. Futuras recompensas podem conceder itens específicos em `communityCosmetics.unlockedItems`, como `frames:portrait-metal-a`, sem conceder acesso ao catálogo inteiro. Ainda não foi adicionada interface administrativa de concessão nem vínculo novo com missões. O mapa público `permanentEffects`, produzido pelo servidor ao equipar um efeito temporário permanentemente liberado, preserva esse efeito sem divulgar o inventário ou a lista de contas autorizadas. Flags equivalentes enviadas pelo navegador são ignoradas.

### Rolagem e conferência

O baú agora tem cabeçalho fixo, altura limitada à janela e uma área interna com `min-height: 0`, `overflow-y: auto` e rolagem por toque/teclado. Foi removida a rolagem concorrente da grade de itens. A aparência do conteúdo também recebe as variáveis e regras de avatar que antes se perdiam por causa do portal do modal.

Validação: 305 testes frontend, 107 testes backend com MongoDB real, consistência dos manifestos, 30 hashes distintos por categoria, integridade dos arquivos/licenças, bloqueio de concessão forjada e manutenção do estado de itens antigos. Conferência em Chrome headless com 1440 × 900 e 420 × 820: roda do mouse movimenta o conteúdo; cabeçalho permanece fixo; filtros funcionam; moldura, card e chat equipam; Escape fecha e libera a rolagem da página; sem estouro horizontal ou erros de página/recursos. As chamadas dessa conferência visual usam respostas simuladas e o validador real do servidor; não substituem login OAuth real. Os testes com MongoDB são executados separadamente.
