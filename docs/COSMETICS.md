# Meu baú — primeira coleção

O menu do avatar abre por clique, fecha por clique fora ou Escape e oferece o Meu baú. O perfil também mantém o atalho Personalizar aparência. A janela tem prévia e seis categorias: molduras, avatares simbólicos, títulos, cards de perfil, assinatura de chat e capas. Personagens completos ficam para outra etapa.

A coleção permanente inicial fica disponível nesta fase, preservando todas as escolhas antigas. Inclui foto do GitHub, Pulso, Semente e Explorador; estilos Prestígio, Brasa e Bosque; e as molduras/capas anteriores. Os títulos são opções do catálogo, sem HTML ou scripts enviados pelo usuário. Os cosméticos não concedem XP.

Energia é a primeira coleção temporária: o usuário precisa clicar Receber coleção. Uma atualização condicional no MongoDB registra recebimento e expiração uma única vez. São sete dias corridos desde o recebimento, mesmo sem usar. Equipar, reabrir e repetir a requisição não renovam o prazo. Não há TTL removendo o registro: ele precisa permanecer para impedir novo recebimento.

GET /api/community/cosmetics retorna catálogo, disponibilidade, vencimento, aparência e hora do servidor; não concede itens. POST /cosmetics/welcome concede a coleção para a conta autenticada com proteção de origem. POST /cosmetics valida IDs e posse consultando o usuário atual no banco; ignora XP, posição e datas fornecidas pelo cliente. O servidor registra somente o vencimento autorizado em communityAppearance.expiresAt. Os DTOs públicos usam esse mapa para descartar efeitos vencidos, sem expor o inventário privado. O navegador também remove efeitos já carregados em até 30 segundos, com um relógio compartilhado apenas para aparências temporárias; a decisão autoritativa é do servidor.

Top 1, 2 e 3 da temporada recebem coroa numerada e destaque conforme a posição atual, tanto no perfil quanto no pódio. Não são itens equipáveis e não devem ser tratados como recompensa permanente. Os banners próprios e públicos ficaram maiores. Animações são discretas e respeitam movimento reduzido.

## Validação

Testes cobrem escolhas antigas, posse, datas forjadas, limite de expiração, fallback público, repetição e concorrência no MongoDB, ausência de alteração de XP, menu por clique, modal, bloqueio antes do recebimento, equipar e expiração em uma tela já aberta. Build de produção e verificações HTTP do Vite também fazem parte da validação. OAuth real e inspeção visual no navegador do usuário ainda precisam de conferência local.

Não foram adicionadas dependências nem assets de terceiros. As formas são SVG/CSS nativos e ícones do lucide já utilizado no projeto.
