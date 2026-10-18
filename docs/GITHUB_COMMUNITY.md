# Comunidade GitHub — MVP local

Aplicação: `/community` ou `/`. Código legado de tarefas: `/app`. Mantém React, Express, Passport, MongoDB e Docker. Tarefas manuais não contam na comunidade. Esta entrega não publica nem altera ambientes Vercel.

## Carreira e temporadas

- **Carreira permanente:** soma dos registros mensais conhecidos, nível, título e conquistas acumuladas. Curva de nível do QuestLog: 200 XP, mais 400, mais 600, etc. Explorador; Construtor no nível 5; Veterano no nível 10.
- **Temporada mensal UTC:** pontuação e ranking do mês; começa uma nova disputa na virada. A carreira não reinicia.
- **Histórico privado:** até 120 registros na aba Temporadas, com XP, posição final, participantes registrados, situação e cobertura. A carreira considera todos os registros, mesmo além dos 120 exibidos.
- **Fechamento:** janela de 48 horas após o mês terminar para reconciliar contribuições com GitHub; depois resultados e posições ficam congelados. Empate por ID GitHub em ordem textual, como no ranking atual. Falhas mantêm o último retrato e marcam a cobertura como parcial. Posições parciais valem entre os participantes efetivamente registrados, sem reconstruir uma classificação antiga desconhecida.
- **Migração:** importa o último retrato legado de cada conta uma única vez; seu XP fica protegido como piso na temporada correspondente. O ajuste aparece no extrato se necessário. Meses que nunca foram registrados não são inventados. Importações após o fechamento ficam sem posição histórica e com cobertura parcial.

A coleção `communitySeasons` tem índice único `(githubId, period)`: cada sincronização substitui o retrato daquele mês, nunca soma outro retrato igual. Carreira é recalculada a partir desses registros. Conquistas já desbloqueadas são preservadas. Correções de contribuições podem alterar pontos do mês aberto e, portanto, o XP da carreira; não há reset mensal de carreira. Resultados encerrados não são recalculados.

## Pontuação v2

| Atividade | Regra |
| --- | --- |
| Commit público reconhecido pelo perfil GitHub | 10 XP; máximo de 20 por dia UTC, somando repositórios |
| PR público mesclado, de autoria do participante | Base de 50 XP |
| Mesmo PR, com merge feito por outro usuário humano | +25 XP (total 75) |
| Merge pelo próprio autor, bot ou identidade indisponível | Sem bônus; mantém 50 XP |
| Issues, tarefas manuais, estrelas, criação de repositório | Sem XP nesta versão |

Até 100 PRs/mês, selecionados pela data de criação mais antiga na busca GitHub (`sort:created-asc`). A busca é limitada às datas de merge do mês consultado, incluindo a consulta de meses anteriores. O extrato apresenta o bônus de colaboração e eventual ajuste legado. A lista de PRs mostra até 100 resultados considerados.

Commits usam `contributionsCollection.commitContributionsByRepository`, não toda atividade Git em qualquer branch. Aplicam-se critérios de autoria/branch do GitHub. Importação de menos de 100 repositórios por mês; ao alcançar o limite ou receber dados parciais, não publica um novo total incompleto. Quantidade e aprovação por outra conta não comprovam qualidade técnica; contas alternativas, colaboração combinada e spam ainda precisam de evolução futura. Não usar o MVP para prêmios financeiros.

## Atualização automática local

O Compose inicia **community-worker**, processo separado que consulta as contas conectadas a cada dez minutos, sequencialmente. Requer computador ligado, rede e Docker rodando; independe do navegador. Pode haver atraso quando o ciclo demora ou quando GitHub limita/falha. O painel mostra atividade recente do serviço e a última sincronização real.

O worker tem uma concessão global renovável no MongoDB. Cada conta também tem uma trava, compartilhada com o botão HTTP, que evita gravações concorrentes. Escritores lentos são rejeitados; o banco mantém o último resultado em falhas e o worker tenta novamente em um ciclo posterior. Tokens nunca são incluídos nos logs. Na virada, o worker reconcilia retratos anteriores antes do fechamento, sempre que as APIs permitirem. Desligamentos prolongados e dados já indisponíveis no GitHub podem deixar o histórico parcial.

A página consulta os resultados a cada dez minutos e ao voltar à aba. Se o serviço não for detectado, a página faz uma sincronização de apoio enquanto visível. O botão permite sincronização após 30 segundos. O perfil de terceiros só consulta resultados salvos; não sincroniza contas de terceiros.

### Atualizar a instalação existente

Na pasta do projeto, depois de parar o antigo Compose em primeiro plano:

```bash
git pull --ff-only comunidade feat/github-community-mvp
sudo docker compose --env-file .env.test up -d --build
```

`-d` mantém os serviços em segundo plano, mesmo após fechar o terminal. Os volumes existentes permanecem. Abra `http://localhost:3000/community`. Para conferir o worker:

```bash
sudo docker compose --env-file .env.test logs --tail=30 community-worker
```

## Primeira configuração

1. Crie uma OAuth App exclusiva em https://github.com/settings/developers.
2. Homepage `http://localhost:3000`; callback `http://localhost:3001/api/community/auth/callback`.
3. Copie `example.env` para `.env.test` somente se ainda não tiver configuração.
4. Configure:

```dotenv
CLIENT=http://localhost:3000
REACT_APP_PROD=http://localhost:3001/api
GITHUB_CLIENT_ID=seu_client_id
GITHUB_CLIENT_SECRET=seu_client_secret
GITHUB_CALLBACK_URL=http://localhost:3001/api/community/auth/callback
GITHUB_TOKEN_KEY=64_caracteres_hexadecimais
SESSION_SECRET=outro_segredo_aleatorio_de_pelo_menos_32_caracteres
```

Use `openssl rand -hex 32` duas vezes para gerar segredos independentes. Não publique `.env.test`. Variáveis REACT_APP são públicas no build; nunca coloque segredos nelas. Trocar GITHUB_TOKEN_KEY exige novo login. O worker usa os tokens salvos; se revogados/expirados, o usuário precisa reconectar. Renovação automática de tokens com expiração ainda não foi implementada.

Google é opcional. O código usa `usersDB` para aplicação; o seed `questlog_test` não é o banco de aplicação. Índices parciais únicos permitem contas Google e GitHub separadas. Não há vínculo automático por e-mail.

## Perfis e privacidade

Participar do ranking disponibiliza `/community#profile/ID_GITHUB`. Perfil público mostra apenas avatar, login, carreira, conquistas e resumo mensal. Ao sair, novas consultas ao perfil retornam 404. Histórico pessoal, e-mail, tokens, tarefas e atividade detalhada não entram no perfil. Dados já visualizados não podem ser recolhidos.

OAuth usa state descartável de dez minutos e PKCE S256. Tokens AES-256-GCM no banco; nunca no frontend. Escopo OAuth vazio; autorizações ampliadas são rejeitadas. Usar uma OAuth App exclusiva. POSTs exigem Origin igual a CLIENT. Limite geral de dez requisições/minuto/IP; perfis públicos têm limite separado de 30/minuto/IP. Limites HTTP são locais por instância; travas de sincronização ficam no banco.

## Endpoints

- GET `/api/community/auth` e `/auth/callback`: OAuth.
- GET `/api/community/me`: perfil privado, carreira, temporada e posição atual.
- POST `/api/community/sync`: sincronização da conta da sessão.
- POST `/api/community/participation`: participação pública da conta da sessão.
- GET `/api/community/leaderboard`: Top 100 por XP mensal, com nível/título da carreira.
- GET `/api/community/profiles/:githubId`: resumo público de participante.
- GET `/api/community/seasons`: histórico privado.
- GET `/api/community/sync-status`: situação recente do processo automático, sem dados de contas.

## Verificação e limites da entrega

`npm test` em server executa testes de regras, migração e proteção de campos. A suíte de integração MongoDB é opt-in: configure MONGODB_TEST_URI para um servidor de teste descartável. Ela cria um banco com nome aleatório e apaga somente esse banco ao terminar. Testa unicidade, migração, falha da API, concorrência e congelamento de classificação. O workflow Community MVP checks roda com MongoDB isolado no GitHub Actions e também testa/builda o frontend.

No frontend: `CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/components/Community/Community.test.js` e `npm run build`.

Nesta etapa não há publicação. A execução integrada com MongoDB/worker deve ser confirmada no ambiente Docker. O ambiente do assistente bloqueou a inicialização do MongoDB de teste com `Operation not permitted`; testes unitários e de interface não substituem essa verificação. O vercel.json legado ainda exige revisão de domínio, CORS e arquitetura de execução do worker antes de uma futura publicação.

## Missões numeradas e Meu perfil

A aba Missões tem cinco objetivos diários, cinco semanais e cinco mensais, identificados apenas por número. Cada linha mostra requisitos, progresso, prazo UTC, bônus e uma mensagem do que falta. A conclusão é detectada automaticamente e o bônus é recebido pelo botão à direita. A tela consulta o resultado salvo a cada minuto; a coleta/validação GitHub acompanha a sincronização de dez minutos.

| Frequência / número | Requisito | Bônus |
| --- | --- | --- |
| Diária 1 | 1 commit público elegível | 300 XP |
| Diária 2 | 1 PR público aberto com alteração de conteúdo | 300 XP |
| Diária 3 | 1 PR próprio mesclado | 500 XP |
| Diária 4 | Revisão enviada em PR de outra pessoa | 300 XP |
| Diária 5 | PR próprio mesclado que fechou uma issue vinculada | 500 XP |
| Semanal 1 | Commits em 3 dias | 1.000 XP |
| Semanal 2 | 10 commits em pelo menos 2 dias | 1.000 XP |
| Semanal 3 | 3 PRs próprios mesclados | 1.500 XP |
| Semanal 4 | Revisões em 3 PRs distintos de outras pessoas | 1.000 XP |
| Semanal 5 | 2 PRs próprios mesclados por outros usuários humanos | 1.500 XP |
| Mensal 1 | Commits em 12 dias | 2.000 XP |
| Mensal 2 | 30 commits em pelo menos 3 semanas | 2.000 XP |
| Mensal 3 | 8 PRs próprios mesclados em pelo menos 2 semanas | 3.000 XP |
| Mensal 4 | 4 PRs próprios aceitos por outros humanos em pelo menos 2 repositórios | 3.000 XP |
| Mensal 5 | Release própria com 20 commits em 5 dias, 5 PRs próprios mesclados, README e implementação na mesma versão | 5.000 XP |

Dia/mês usam UTC; semana começa segunda-feira às 00:00 UTC. O prazo é exclusivo: uma ação exatamente no início do próximo período conta no próximo. Ações podem avançar várias frequências simultaneamente. O prêmio é único por conta, missão, versão de regra e período, com chave única no MongoDB. O botão Receber fica indisponível até a conclusão; após o recebimento, mostra Recebido e não permite repetir. Bônus entram no ranking e na carreira, além do XP normal, separados no extrato. Entram na temporada em que forem recebidos; uma confirmação atrasada não reabre rankings encerrados.

`missionsStartedAt` é gravado uma única vez quando a conta entra no sistema de missões, pela primeira sincronização ou visita à aba. Ações anteriores não contam. Há até 48 horas após cada período para validar evidências atrasadas; não é concedido um histórico antigo de recompensas. Bônus já creditados permanecem mesmo se a evidência posteriormente deixar de estar acessível. A carreira é recalculada a partir de temporadas; o bônus salvo substitui o total anterior, sem incrementos duplicados.

### Evidências e limites

- Commits: autoria associada à conta, presentes na branch padrão pública consultada, com adições/remoções, datas de autoria e commit posteriores à ativação; merge commits automáticos são excluídos. SHA repetido não multiplica a contagem entre forks. São critérios mais específicos que o resumo legado de contribuições.
- PR aberto: não rascunho, autoria própria, conteúdo alterado e data de criação elegível. PR mesclado: autoria própria, alteração de conteúdo e data de merge elegível. O bônus por merge de outro humano usa os mesmos critérios do sistema normal.
- Revisões: enviadas, não rascunhos, em PRs de outros autores. Revisões repetidas no mesmo PR não multiplicam o objetivo semanal.
- Issue: precisa estar fechada e o evento de fechamento apontar para aquele PR mesclado. Apenas escrever `fixes` no texto ou fechar a issue manualmente não basta.
- Release: publicada pelo participante, sem draft/prerelease. O commit da tag precisa conter os commits próprios considerados e pelo menos cinco commits de merge dos PRs considerados (verificação de ancestralidade). README raiz de tamanho não zero e arquivo de implementação são verificados na árvore dessa versão. Dependências vendorizadas, builds, arquivos minificados e diretórios de documentação/imagens não comprovam implementação. Forks são permitidos, mas trabalho herdado anterior à ativação não satisfaz os objetivos. Isso verifica estrutura e eventos, não funcionamento ou qualidade do projeto.
- A coleta tem orçamento de tempo de 70 segundos, até 24 repositórios por consulta, 100 commits por histórico consultado, 100 PRs abertos/mesclados e 100 contribuições de revisão, além das três releases recentes por repositório consultado. Os eventos confirmados são guardados entre consultas. Ao atingir limites/falhas, a tela avisa que o progresso pode estar parcial; não inventa evidências ou bloqueia os pontos básicos já calculados.

Coleções: `missionEvents` (evidências por ID), `missionRewards` (livro de bônus com chave única e mês de crédito). GET `/api/community/missions` é privado e retorna somente objetivos e resumo dos bônus da sessão. A sincronização usa a trava de conta já existente; o prazo da trava agora é de cinco minutos para comportar a coleta adicional. Falhas de missões preservam o XP normal e os bônus anteriores.

A aba Meu perfil reúne foto/nome GitHub, título, nível permanente, XP, posição atual/melhor posição e conquistas. Quando a participação pública está ativa, há link para visualizar como os demais usuários veem o perfil. Quando desativada, a visualização pessoal continua disponível e o perfil público retorna 404. Não foram criados itens cosméticos, upload de avatar ou conquistas fictícias.

A paleta usa superfícies pretas com detalhes verdes; verde claro permanece como destaque de progresso, com azul, roxo e dourado em atividades e status.

Validação desta etapa: build de produção passou; 25 testes de backend e 8 testes de interface passaram. As consultas foram validadas contra o esquema GraphQL publicado do GitHub. As duas suítes MongoDB (temporadas e bônus) continuam opt-in e não foram executadas localmente pelo bloqueio do banco neste ambiente. A validação com a conta real e os serviços Docker continua necessária; não houve publicação.

### Recebimento das missões

A sincronização salva evidências e atualiza o progresso, sem pagar novos bônus automaticamente. `POST /api/community/missions/claim` recebe apenas `missionId` e `periodKey`; o servidor revalida conclusão e prazo e calcula o XP. Exige sessão GitHub e mesma origem. O recibo único impede pagamento repetido e a trava compartilhada evita concorrência com sincronizações. Bônus automáticos anteriores continuam recebidos.

Missões concluídas do período anterior aparecem por até 48 horas para recebimento. O XP entra na temporada do recebimento. A interface atualiza missões após sincronizar e atualiza carreira e ranking após receber.

### Personalização do perfil

Meu perfil permite editar descrição (até 300 caracteres), dois links opcionais com nome (até 30 caracteres) e endereço HTTP/HTTPS, e banner enviado pelo computador. O navegador recorta o centro em 1600 × 500 e converte para WebP com até 300 KB. Entradas aceitas: JPG, PNG e WebP de até 8 MB. É possível remover o banner e voltar à capa padrão.

`POST /api/community/profile` exige sessão GitHub e mesma origem. Valida e grava apenas `bio`, `links` e `banner` em `users.communityProfile`, sem editar a identidade GitHub ou os pontos. O limite de JSON maior (450 KB) é restrito a esse caminho. Banner fica no MongoDB, sem serviço externo de armazenamento nesta etapa. A resposta pública inclui esses campos somente quando a participação pública está ativa.

Paleta atual: grafite neutro, verde esmeralda como identidade e destaques secundários discretos. O health check do MongoDB no GitHub Actions usa aspas externas duplas para preservar o comando interno do mongosh.

### Metas pessoais, resumo semanal e desafio coletivo

- Metas pessoais: GET/POST `/api/community/goals`, privados. Uma escolha imutável por conta e semana UTC (segunda 00h), garantida pela chave `_id=githubId:weekKey` em `personalGoals`, inclusive sob requisições concorrentes. Objetivos: dias com commits (1–7), commits elegíveis (1–100), PRs próprios mesclados (1–20), revisões em PRs distintos de outras pessoas (1–20). Apenas evidências posteriores à escolha contam. Não há XP adicional por meta. Progresso usa `missionEvents`, com os mesmos limites de coleta já documentados.
- Resumo semanal: GET `/api/community/weekly-summary`, privado, dentro de Progresso. Soma commits/PRs detalhados das temporadas que cobrem a semana e bônus pela data de recebimento; revisões usam evidências das missões. Uma semana pode atravessar dois meses. Mostra cobertura parcial quando falta detalhamento de um mês ou a coleta de missões está parcial. Valores refletem as evidências salvas e podem mudar com a reconciliação; não representam uma contabilidade de créditos por instante. Não é exibida evolução da posição, pois esse histórico não existe.
- Desafio coletivo: GET `/api/community/challenge`, privado para contas GitHub. Primeiro objetivo recorrente: 100 commits elegíveis na semana UTC. Agrega evidências de contas com participação pública ativa; sair da participação retira suas contribuições do agregado. Mostra quantidade, participantes, progresso e contribuição pessoal; nenhum bônus, cosmético ou conquista adicional é concedido nesta etapa. A coleta começa na ativação das missões e pode ser parcial. Um mesmo SHA por conta não multiplica a contagem. Consulta de resultado salvo a cada minuto e após sincronizar.
- As três leituras têm limite separado de 30 consultas/minuto para não consumir o limite de login/sincronização.

Perfil: os quatro indicadores pessoais ficam dentro do cartão de identidade, abaixo da descrição. Conquistas usam cartões compactos. A vitrine permite até três projetos, cada um com nome (60 caracteres), descrição opcional (180), endereço HTTP/HTTPS e um dos ícones estrela, fogo, raio, código, foguete e bandeira. A vitrine é editada com o perfil e pública apenas com participação ativada. Links e projetos são declarados pelo participante, sem XP, validação de autoria ou declaração de conclusão automática. Campos de banner, descrição e redes continuam preservados ao salvar o novo editor.

### Revisão: consultas, missões e metas de projeto

Os limites de consultas foram separados: leituras da comunidade (120/minuto), gravações (30/minuto), autenticação (10/minuto) e perfis públicos (60/minuto). Respostas 429 são JSON com mensagem legível. O frontend também trata respostas 429 em texto e falhas sem JSON, preservando o último resultado salvo. Eventos de retorno à aba têm intervalo mínimo de dez segundos; respostas de leitura anteriores a uma gravação não substituem seu resultado.

`GET /missions` retorna exatamente as 15 missões atuais em `missions` e apenas bônus antigos concluídos e não recebidos em `pendingRewards`. Bônus pendentes ficam recolhidos em seção própria. Uma missão recebida continua verde, bloqueada e no mesmo lugar até a renovação do período UTC; sincronizar não reinicia a missão. Na renovação, a próxima missão do mesmo número pode ser cumprida novamente. O prazo aparece na borda direita do cartão e cada objetivo tem uma explicação breve. O prazo de 48 horas para receber bônus antigos foi preservado.

A vitrine aceita somente endereços de repositórios no formato `https://github.com/usuario/repositorio`; aceita `.git` e endereço sem esquema começando por `github.com/`. Perfis, arquivos, outras redes, credenciais e parâmetros são rejeitados com mensagem no campo, sem limpar o formulário. Os dois links sociais continuam aceitando HTTP/HTTPS. A validação confirma o formato do endereço, não existência, autoria ou funcionamento do repositório. Projetos antigos com URLs externas deixam de ser exibidos; banner, descrição e redes são preservados.

A nova versão de `/goals` usa `projectGoals`, um documento por identificador GitHub. Substitui a meta semanal por uma meta de projeto ativa por vez, sem reinício semanal e sem XP adicional. A coleção anterior `personalGoals` permanece intacta como histórico legado, sem ser utilizada pela nova interface.

Projetos sugeridos: e-commerce, pagamentos em ambiente de testes, gestão de estoque e agendamento. Roteiros são definidos pelo servidor. Meta própria: título (80 caracteres), descrição (600), de 1 a 12 etapas (160 cada), prazo opcional e repositório opcional. `POST /goals/update` salva uma etapa, prazo/repositório ou arquiva a meta. Todas as etapas marcadas tornam a meta concluída por autoavaliação; desmarcar reabre a meta atual. A versão otimista impede sobrescrever alterações concorrentes. É possível começar outra após concluir/arquivar, preservando até dez metas anteriores. Essas informações são privadas e não conferem XP, conquistas ou declaração de qualidade técnica.

### Coleção inicial de cosméticos e ranking comunitário

Meu perfil → Personalizar aparência oferece uma prévia antes de equipar. Molduras: Essencial, Circuito, Terminal, Cristal e Prestígio. Capas: Aurora, Malha digital e Órbita, além de Meu banner para usar a imagem enviada ou o fundo padrão. Títulos cosméticos: Aprendendo em público, Ideias em código e Construindo meu caminho, com opção sem título.

A coleção está liberada nesta fase de avaliação visual. Regras de desbloqueio, loja e recompensas de cosméticos ainda não foram definidas. Todos os elementos são estáticos em CSS/SVG; não há imagens licenciadas de terceiros, geração de XP, animações contínuas ou dependências novas. Títulos cosméticos não substituem títulos de carreira ou conquistas.

GET/POST `/api/community/cosmetics` exige sessão GitHub; gravação exige mesma origem. Somente identificadores válidos do catálogo são persistidos em `users.communityAppearance`; o servidor não aceita CSS, URLs ou XP nesse campo. Perfil privado/público, avatar do dashboard e rankings mostram a moldura equipada. Capas e títulos aparecem nos perfis; títulos também aparecem nos rankings. A troca de capa preserva o banner enviado. Enviar uma nova imagem em Editar perfil seleciona Meu banner e mantém moldura e título.

Ranking tem seletores Global e Comunitário. `/community#ranking/community` abre a classificação do desafio; GET `/api/community/community-ranking` retorna os primeiros 100 e a posição do usuário mesmo fora da lista. Mantém a unidade vigente do desafio: commits públicos elegíveis por semana UTC, sem limites novos. Ordena por quantidade decrescente, horário em que a quantidade atual foi atingida (data do último evento único reconhecido no GitHub) crescente e identificador estável caso ambos sejam idênticos. Não usa horário da sincronização. Eventos repetidos do mesmo SHA/autor não multiplicam a contagem; somente participantes públicos aparecem, e campos privados são excluídos. A contagem segue até o prazo semanal, mesmo após atingir 100.

O bolão, a distribuição de XP e a mudança para múltiplos tipos de contribuição ficam adiados. Esta etapa não muda pontuação, premiação ou desempate do ranking global.

### Bolão comunitário semanal

O serviço automático cria um bolão de 40.000 XP por semana UTC, com meta de 100 commits elegíveis, encerramento segunda 00h UTC e janela de validação de 48 horas. A quantidade continua contando depois de atingir a meta. O resultado é congelado após a janela; sem atingir 100, não há prêmio. Com um participante elegível atingindo a meta, ele pode receber o bolão integral.

A regra de participação começa na ativação desta versão (`communityPoolConfig.activatedAt`), sem reconstruir retroativamente um histórico público que não foi registrado. Contas públicas existentes são inscritas na ativação; entradas e saídas posteriores são intervalos em `users.communityParticipation`, gravados atomicamente com a opção pública. Apenas ações dentro desses intervalos entram. Sair preserva contribuições anteriores; atividades enquanto a participação estiver desativada não são acrescentadas depois de voltar. Para os outros usuários, a identidade de quem saiu é ocultada na classificação; a própria conta continua vendo sua participação e recebendo o bônus devido.

Evidências de missões têm `confirmedAt` para excluir dados recebidos após o fechamento. A distribuição usa `floor(40000 × contribuições pessoais / total)`: contribuições iguais recebem o mesmo XP inteiro. Sobra de arredondamento fica registrada em `unusedXP`, sem beneficiar arbitrariamente alguém em empate. Os valores apresentados antes do fechamento são estimativas condicionadas à meta coletiva.

`communityPools` guarda resultado, orçamento, totais e estado; `communityPoolShares` guarda uma alocação única por semana/conta e seu pagamento. O worker congela o resultado, paga automaticamente sob a mesma trava por conta das sincronizações e retoma pagamentos interrompidos. A reconciliação substitui totais a partir do livro de bônus, sem incrementos repetidos. `communityXP` fica separado de `missionXP` e `baseXP`, tanto no extrato quanto nas temporadas. Carreira e ranking global incluem o bônus no mês do crédito; um resultado mensal já encerrado não é reaberto. IDs de recibos incluídos permitem recuperar interrupções sem duplicar XP; se um crédito ainda não aplicado ficou associado a mês encerrado, ele é redirecionado ao mês atual.

Missões e ranking comunitário exibem estimativa, percentual e histórico pessoal de até oito bolões (validação, pagamento, pago ou meta não atingida). Os processos Docker precisam estar ativos para sincronizar e pagar; o prazo é de validação, não promessa de execução exata em caso de indisponibilidade. A coleta limitada pode produzir cobertura parcial e só evidências confirmadas entram no fechamento. Não foram adicionados PRs/revisões à unidade deste desafio nem funcionalidades sociais.

A faixa grande de sincronização foi removida. O botão de atualização manual fica na barra superior, apenas com ícone e descrição acessível; a atualização automática e o intervalo manual de 30 segundos foram preservados.

## Progress Hub: conquistas permanentes e identidade

A marca da comunidade passa a ser Progress Hub. Logo vetorial e favicon próprios em `client/public/progress-hub.svg`; os créditos e a licença MIT do QuestLog permanecem. Nenhum nome de repositório, volume ou variável de ambiente foi alterado.

O catálogo tem 38 conquistas, incluindo os quatro marcos anteriores. Cada bônus é automático, único por conta e versão, e soma XP de carreira e da temporada do recebimento. Evidências existentes podem liberar bônus na primeira sincronização após esta atualização. Conquistas não reiniciam mensalmente. Não há recompensa por editar metas pessoais ou cosméticos.

| Conquista | Critério | XP único |
| --- | --- | ---: |
| Primeiro commit | Acumule 1 commits elegíveis na carreira. | 300 |
| Código em movimento | Acumule 10 commits elegíveis na carreira. | 300 |
| Construindo o caminho | Acumule 50 commits elegíveis na carreira. | 500 |
| Cem passos à frente | Acumule 100 commits elegíveis na carreira. | 1000 |
| Ritmo de construção | Acumule 250 commits elegíveis na carreira. | 1500 |
| Meio milhar de passos | Acumule 500 commits elegíveis na carreira. | 2000 |
| Mil contribuições | Acumule 1000 commits elegíveis na carreira. | 5000 |
| Primeiro PR mesclado | Acumule 1 PRs próprios mesclados e pontuados. | 300 |
| Cinco entregas | Acumule 5 PRs próprios mesclados e pontuados. | 500 |
| Dez entregas | Acumule 10 PRs próprios mesclados e pontuados. | 1000 |
| Entrega constante | Acumule 25 PRs próprios mesclados e pontuados. | 1500 |
| Cinquenta entregas | Acumule 50 PRs próprios mesclados e pontuados. | 2000 |
| Cem entregas | Acumule 100 PRs próprios mesclados e pontuados. | 5000 |
| Dia de construir | Acumule 1 dias UTC diferentes com commits pontuados; não precisam ser consecutivos. | 300 |
| Sete dias de código | Acumule 7 dias UTC diferentes com commits pontuados; não precisam ser consecutivos. | 500 |
| Quinze dias de evolução | Acumule 15 dias UTC diferentes com commits pontuados; não precisam ser consecutivos. | 1000 |
| Trinta dias de jornada | Acumule 30 dias UTC diferentes com commits pontuados; não precisam ser consecutivos. | 1500 |
| Sessenta dias em ação | Acumule 60 dias UTC diferentes com commits pontuados; não precisam ser consecutivos. | 2000 |
| Cem dias construindo | Acumule 100 dias UTC diferentes com commits pontuados; não precisam ser consecutivos. | 3000 |
| Um olhar que ajuda | Acumule 1 PRs distintos de outras pessoas revisados e acompanhados pela plataforma. | 300 |
| Cinco olhares | Acumule 5 PRs distintos de outras pessoas revisados e acompanhados pela plataforma. | 500 |
| Revisor presente | Acumule 15 PRs distintos de outras pessoas revisados e acompanhados pela plataforma. | 1000 |
| Revisor da comunidade | Acumule 30 PRs distintos de outras pessoas revisados e acompanhados pela plataforma. | 2000 |
| Construindo junto | Acumule 1 PRs próprios mesclados por outra pessoa humana, reconhecidos pela pontuação. | 500 |
| Cinco colaborações | Acumule 5 PRs próprios mesclados por outra pessoa humana, reconhecidos pela pontuação. | 1000 |
| Colaboração que cresce | Acumule 15 PRs próprios mesclados por outra pessoa humana, reconhecidos pela pontuação. | 2000 |
| Primeiro bônus de missão | Acumule 1 missões concluídas e recebidas. | 300 |
| Dez objetivos cumpridos | Acumule 10 missões concluídas e recebidas. | 1000 |
| Trinta objetivos cumpridos | Acumule 30 missões concluídas e recebidas. | 2000 |
| Cem objetivos cumpridos | Acumule 100 missões concluídas e recebidas. | 5000 |
| Uma versão para o mundo | Acumule 1 releases próprias verificadas: 20 commits, 5 PRs incluídos, README e arquivo de implementação. | 2000 |
| Três versões entregues | Acumule 3 releases próprias verificadas: 20 commits, 5 PRs incluídos, README e arquivo de implementação. | 5000 |
| A jornada continua | Acumule 2 meses diferentes com commits ou PRs pontuados. | 1000 |
| Seis capítulos | Acumule 6 meses diferentes com commits ou PRs pontuados. | 3000 |
| Nível 5 | Alcance o nível 5 de carreira. | 500 |
| Nível 10 | Alcance o nível 10 de carreira. | 1500 |
| Nível 20 | Alcance o nível 20 de carreira. | 3000 |
| 50 commits no mês | Faça 50 commits pontuados em um mesmo mês, uma vez na carreira. | 500 |

Commits e PRs respeitam os limites normais de pontuação. Dias são UTC distintos, não consecutivos. Revisões contam PRs distintos de outras pessoas, não várias revisões no mesmo PR. Releases exigem as evidências verificadas já usadas pelo coletor de missões. Meses ativos exigem ações pontuadas, não apenas bônus. A cobertura é a acompanhada pela plataforma; não se promete importar todo o histórico do GitHub. Níveis podem avançar com bônus, mas cada marco paga uma vez e a avaliação é limitada ao catálogo.

Persistência: `achievementRewards`, chave `${githubId}:${achievementId}:v1`, valores definidos pelo servidor. A sincronização e o recebimento de missões usam a mesma trava por conta. O total é reconciliado por soma do livro de recompensas, sem incrementos repetidos. Os IDs de recompensas e seu XP ficam no mesmo snapshot mensal para recuperar interrupções, inclusive após virar o mês. Um bônus ainda não aplicado pode migrar ao mês atual; um bônus já aplicado conserva seu mês original. Temporadas fechadas não são reabertas.

`GET /api/community/achievements` é autenticado, somente leitura, e retorna critérios, progresso e recibos resumidos da própria conta. A consulta de perfis públicos continua usando a lista permitida de campos.

A coleção de conquistas fica em Progresso → Conquistas, com filtros. Meu perfil mostra a quantidade desbloqueada junto ao título e um link para a coleção. O extrato e o resumo semanal separam os bônus de conquistas dos demais ganhos.

## Navegação horizontal e interface compacta

O shell da comunidade agora ocupa toda a largura: cabeçalho global, conteúdo e rodapé como irmãos, sem coluna lateral permanente. Menu principal: Tela inicial, Ranking, Missões, Progresso e Metas pessoais. Meu perfil é um atalho com avatar à direita. As subabas aparecem nas respectivas áreas: Ranking → Temporadas e Progresso → Conquistas. Links anteriores `#dashboard`, `#seasons`, `#ranking/community` e `#profile/<id>` continuam válidos. Os novos links são `#home`, `#ranking/seasons` e `#progress/achievements`.

O botão de configurações abre uma lateral temporária para Configurações, Conta, Privacidade, Regras e ajuda e Sair. O menu começa fechado, mantém o foco enquanto aberto e pode ser fechado com Escape, botão ou clique fora. Conta mostra apenas a identidade GitHub disponível, sem campo de e-mail. Privacidade usa o controle de participação já existente. Nenhuma informação nova de autenticação é solicitada.

A tela inicial mantém Top 10 de carreira e cards resumidos. O antigo bloco de conquistas foi movido. Três banners internos em `HomeBanners.js` apresentam a comunidade, o desafio e as metas. Trocam a cada 3 segundos, com controles, pausa ao passar o mouse, ao usar teclado e em aba oculta. Movimento reduzido desativa a troca automática. Configurações oferece uma preferência persistida neste navegador (`ph-banner-autoplay`). Os banners são slots de conteúdo local, sem provedor externo de anúncios ou painel de administração nesta versão.

`site-layout.css` contém a composição nova e os ajustes de densidade: margens, preenchimentos e espaços menores, conteúdo sem o recuo da antiga lateral, cards de perfil, metas, missões e ranking compactos. Em telas menores o menu horizontal recolhe em um botão, preservando acesso às cinco áreas.

## Interface direta, missões recolhíveis e pódio

Os blocos de apresentação (sobretítulo, título e subtítulo) foram removidos de Tela inicial, Ranking, Missões, Progresso, Metas pessoais e Perfil público. O atalho do perfil encaminha visitantes diretamente ao login GitHub, preservando o acesso sem depender desses blocos. Avisos de falha na sincronização ficam no ícone de atualizar com indicador discreto e descrição; falhas de outras operações continuam visíveis no respectivo fluxo.

Na Tela inicial, os banners exibem apenas as setas de anterior/próximo e continuam alternando a cada 3 segundos. Não há play, stop ou indicadores de bolinhas. Pausam ao passar o mouse e ao focar o link do conteúdo; movimento reduzido e a preferência em Configurações continuam respeitados. Usar as setas não mantém a rotação permanentemente parada.

O bolão comunitário em Missões começa como um banner expansível. Detalhes e consulta de progresso são carregados ao abrir, incluindo regras, requisitos, contribuição própria, estimativas e pagamentos anteriores. Os cards de missões são menores, com instruções em Como fazer e regras gerais recolhidas. Recebimento, progresso e renovação mantêm as regras existentes.

O resumo XP acumulado das missões deste mês soma o livro de `missionRewards` por conta e `creditedPeriod` UTC. Inclui missões diárias e semanais de dias anteriores e pendências recebidas no mês; não depende da lista ativa nem do histórico recente de 15 recibos. Não inclui bônus de conquistas ou bolões. O endpoint de leitura retorna `monthlyXP` e `creditedMonth`; não altera pontuação.

O Top 3 mensal usa um pódio compacto com primeiro lugar ao centro, segundo à esquerda e terceiro à direita, mantendo a ordem semântica por classificação. Perfis, XP, nível, molduras e títulos equipados são reaproveitados. Classes por moldura permitem continuar o desenho depois; esta etapa não cria novos cosméticos, desbloqueios ou compras.

## Chat coletivo e refinamento visual

A aba Comunidade (`#community`) abre o Chat geral para contas GitHub autenticadas. Usa a sessão existente, sem novo provedor, escopo OAuth ou serviço externo. Textos simples, até 600 caracteres Unicode e 6 linhas; nenhuma mensagem gera XP ou eventos de missão. O envio mostra o aviso de que nome e avatar ficam visíveis no chat. Perfis privados podem conversar, mas não recebem link de perfil público. Autores e aparência são resolvidos pelo servidor com projeção explícita, sem expor e-mail, token ou o documento da conta.

`GET /api/community/chat`: 30 mensagens recentes por página, com paginação anterior via `before`. A visualização mantém até 180 mensagens carregadas. Ao subir, carrega anteriores até esse limite; há também botão manual. Atualiza a cada 5 segundos apenas com a tela aberta e visível. A lista `known` permite atualizar exclusões nas mensagens já carregadas. Ao ler mensagens antigas, novas mensagens não forçam rolagem; um botão retorna ao fim da conversa. Erros preservam o rascunho e a conversa disponível, com espera após limites de consulta.

`POST /api/community/chat`: sessão GitHub, origem do frontend validada, limites compartilhados da API e intervalo de 5 segundos por conta, aplicado atomicamente no MongoDB. Uma chave de tentativa gerada no cliente, combinada à conta e indexada como única, permite repetir um envio de resposta incerta sem duplicar a mensagem. A identidade não é aceita do corpo.

`POST /api/community/chat/delete`: somente o autor pode apagar sua mensagem. O texto é removido do documento e uma indicação de exclusão permanece; os demais clientes atualizam os registros carregados na próxima consulta. Não há edição, arquivos, mensagens privadas, notificações com navegador fechado ou moderação administrativa nesta primeira versão. Denúncias e moderação continuam como etapa anterior à abertura pública.

Persistência nova: `communityMessages`, índice único `requestKey`. O banco e o Docker existentes são reaproveitados; não são necessárias variáveis de ambiente novas. Testes de serviço cobrem validação, concorrência, repetição, exclusão, paginação e ausência de XP; testes HTTP cobrem sessão e origem.

Identidade: troféu alado vetorial simples na marca e no favicon, com verde de destaque. Base geral preta/grafite, superfícies neutras e acentos variados. A introdução de Meu perfil foi removida. Os textos de apoio e roteiro de Metas pessoais ficam sem card ou borda; controles e projeto ativo mantêm agrupamento. As missões foram compactadas novamente, preservando progresso, prazos e recebimento.

### Comunidade social

A Comunidade abre em Publicações: texto (novas publicações: até 200 caracteres; antigas preservadas), foto opcional convertida no navegador para WebP (até 300 KB), pedidos de ajuda, curtidas por conta e comentários de até 600 caracteres. Compartilhar usa o compartilhamento do dispositivo ou copia um link interno; o destinatário precisa entrar com GitHub. Há paginação de publicações e comentários em janela compacta com paginação de 30 por vez. Curtir, publicar e comentar não alteram XP. Exclusão de publicação é restrita ao autor; comentários podem ser apagados por seus autores.

Publicações, Chat geral, Pedidos de ajuda, Grupos, Contatos e Convites são caminhos separados. O chat continua atualizando a cada cinco segundos quando visível, sem moldura externa, com intervalo entre envios somente no chat geral. Mensagens gerais antigas continuam disponíveis. Grupos são privados para membros; convites precisam ser aceitos. Apenas o criador convida contatos previamente confirmados, até 50 membros/convites e dez grupos por criador. Nesta primeira versão o criador permanece no próprio grupo. Contatos são adicionados pelo login GitHub de usuários que já acessaram a plataforma. Não há indicação inventada de presença online.

O menu do avatar abre com mouse ou clique e oferece atalhos e contatos. Dados sociais reutilizam MongoDB e sessão existentes; índices são inicializados pelo servidor. Sem novos serviços, variáveis de ambiente ou dependências. Antes de uma abertura pública ampla, a moderação e as denúncias ainda precisam ser desenvolvidas.


### Interações e pedidos de ajuda

As reações disponíveis são coração, joia, risada e triste. Uma conta tem uma reação por publicação; trocar substitui a anterior e selecionar novamente remove. Curtidas antigas aparecem como coração. O seletor abre ao passar o mouse e também pelo botão de opções no celular/teclado. Fotos antigas e novas são exibidas em área compacta de 380 × 220 px (180 px de altura em telas pequenas), preservando a proporção. Novas fotos são reduzidas a até 800 px e 300 KB no navegador.

Comentários ficam em um diálogo de até 480 px de largura, com fechamento por Escape, foco contido, retorno ao botão de origem e carregamento de comentários anteriores. Os identificadores antigos de comentários permanecem compatíveis.

Pedidos de ajuda usam título de 80 e descrição de 2.000 caracteres. Criar o pedido já cria o grupo com o autor; aceitar adiciona o voluntário atomicamente, respeitando o limite escolhido de 2 a 20 pessoas (incluindo o autor). Cada autor pode ter até cinco pedidos não resolvidos. Apenas o autor altera Aberto/Pausado/Resolvido. Pausar ou resolver impede novas entradas, preservando a conversa dos membros. Convites comuns não permitem burlar o limite do pedido. O antigo chat livre de ajuda não aceita novos envios; seu histórico não foi apagado do banco.

### Caixa de correio e permissões

O ícone ao lado de atualizar consulta notificações ao entrar, a cada minuto enquanto a página está visível e após ações sociais. Mostra até 50 avisos recentes, total de não lidas e marcação de leitura do conjunto consultado. Convites de contato/grupo, aceitação de contato, entrada de voluntários e conclusão de ajuda geram avisos individuais. Mensagens não aparecem para outras contas. Avisos gerais são visíveis aos usuários conectados.

Para habilitar o envio de avisos gerais, configure opcionalmente `COMMUNITY_ADMIN_GITHUB_IDS=ID_NUMERICO_DO_GITHUB` em `.env.test` e reconstrua/recrie o servidor pelo Compose. IDs adicionais podem ser separados por vírgula. O ID aparece nas informações da conta; não use o login textual. Contas com `communityRole: "admin"` ou `"moderator"` atribuído diretamente no banco por um administrador também têm essa permissão. Nenhuma API permite promover a própria conta. O formulário de envio aparece dentro da caixa de correio apenas para contas autorizadas. As demais funcionalidades não precisam de novas variáveis.

### Arquivos em grupos

O clipe permite um anexo por mensagem, com ou sem texto: JPG, PNG, WebP, PDF, TXT ou ZIP, até 10 MiB. O upload binário evita aumentar o corpo em base64, valida extensão/conteúdo e persiste em coleção MongoDB separada, abaixo do limite de documento de 16 MiB. Fotos têm prévia pequena; documentos são baixados. A leitura exige sessão GitHub, vínculo com o grupo e mensagem não apagada. O nome do arquivo é validado e o download usa tipo verificado, `nosniff` e cache privado desabilitado. ZIPs não são extraídos nem executados pelo servidor.

Anexos não enviados expiram após 24 horas (índice TTL); no máximo dez uploads pendentes por conta. Apagar a própria mensagem remove seu anexo. Sair do grupo remove o acesso aos arquivos pelo servidor. Todos os dados continuam no volume MongoDB existente. Nesta versão o armazenamento de anexos usa o banco local; nenhuma cobrança ou serviço externo foi adicionado.


### Pesquisa, grupos e histórico de ajuda

A busca do cabeçalho consulta usuários com perfil público, publicações e pedidos de ajuda da comunidade, além de grupos dos quais a conta já participa. Não inclui grupos privados de terceiros nem perfis retirados do ranking. Exige sessão GitHub, de 2 a 80 caracteres, escapa caracteres especiais de expressão regular e retorna até cinco resultados por categoria. No navegador há espera de 350 ms após digitar e descarte de respostas antigas.

Grupos são listados como capa/nome/Entrar. Entrar apenas abre uma conversa em que a conta já é membro; convites continuam exigindo aceite. Dentro da sala estão Membros, Detalhes e, para o dono de um grupo comum, Convidar. O dono pode trocar a capa (WebP até 300 KB, reduzida pelo navegador) e editar a descrição. Nos grupos de ajuda, o dono altera o estado do pedido dentro de Detalhes. A sala tem área maior para mensagens; o número visível varia conforme texto e anexos.

O intervalo fixo de cinco segundos existe somente no chat geral, no frontend e no backend. Grupos permitem envios contínuos; os limites gerais contra excesso de requisições continuam ativos. Anexos têm reserva por envio para impedir que duas mensagens concorrentes vinculem o mesmo arquivo a destinos diferentes; tentativas repetidas recuperam o envio existente.

Posts e comentários aceitam até três linhas; descrições de perfil, projetos, grupos, metas e pedidos de ajuda, até oito; mensagens, até seis. CRLF e separadores Unicode são normalizados, espaços vazios ao final são removidos e linhas vazias repetidas são reduzidas. O servidor valida os limites. Conteúdo antigo permanece salvo e áreas de texto longas têm rolagem limitada.

Posts sem categoria recebem Feed. Opções: Projeto, Aprendizado, Dúvida rápida, Conquista e Discussão. O filtro usa paginação por categoria; posts antigos marcados como progress aparecem em Projeto. São classificações de conteúdo, sem XP ou conquistas automáticas.

Pedidos de ajuda oferecem Ajudar, Comentar e Salvar. Comentar permite sugerir uma solução sem entrar no grupo. A estrela pertence apenas à conta que a marcou. Meu perfil inclui Meus pedidos, Ajudei e Salvos. A participação histórica continua registrada após sair do grupo, sem conservar acesso à conversa. No perfil público, apenas os pedidos criados são listados; salvos e a coleção Ajudei permanecem privados. Participantes que não têm perfil público ficam anônimos na lista pública de colaboradores. Pedidos individuais têm link #community/help/ID.

Reações coração/joia/risada/triste estão disponíveis em comentários de posts, sugestões em pedidos de ajuda e mensagens do chat geral/grupos. Trocar substitui a reação; selecionar a mesma remove. Reagir em grupos exige associação atual ao grupo. Mensagens apagadas não aceitam novas reações.

A janela de comentários tem estilos de avatar próprios porque seu portal fica fora do contêiner principal. Isso impede a foto de se expandir sobre os comentários e mantém o fechamento por Escape e retorno do foco.


### Confirmações de ações, respostas e busca de recursos

As mutações do cliente passam por `actionFeedback.js`: apresentam andamento e resultado confirmado pelo servidor, compartilham requisições idênticas ainda em andamento e emitem atualização dos recursos relacionados. Não há interceptação global de fetch nem repetição automática de gravações. A camada é reutilizada por perfil, cosméticos, metas, missões, participação, sincronização e ações sociais. Mensagens de chat e reações têm retorno na própria interface; erros também aparecem no canto, sem uma confirmação extra a cada mensagem ou curtida. Até três avisos aparecem ao mesmo tempo, sucessos somem após quatro segundos (pausam no foco/mouse) e erros podem ser fechados. O botão Voltar à ação foca o controle original quando ele ainda existe; uma falha de leitura após gravação oferece nova leitura, sem reenviar conteúdo. A caixa de correio persistente permanece separada.

Atualizações de dados afetam recursos relacionados, preservando formulários em edição. Um erro ao atualizar a visualização após uma gravação não transforma a gravação confirmada em uma falha. Tentativas de criar grupos usam requestId no cliente e chave única no servidor, evitando duplicação quando há nova tentativa após perda da resposta.

Comentários de publicações e sugestões em pedidos aceitam respostas. Responder uma resposta mantém o mesmo comentário principal, com menção ao destinatário, sem aumentar indefinidamente o recuo. São carregados até 30 comentários principais e dez respostas recentes por conversa; respostas adicionais têm paginação própria. Respostas devem apontar para um comentário existente no mesmo conteúdo; reações e autorização continuam compartilhadas. A exclusão remove o texto e mantém o contexto se houver respostas. Comentários antigos sem rootId continuam como principais.

Cada resposta a outra pessoa gera uma notificação idempotente, com link para a publicação/pedido e o comentário original. Não há notificação de resposta à própria conta. O link abre o diálogo e inclui o comentário original mesmo quando ele está além da primeira página. Salvar comentários e respostas não concede XP.

A pesquisa passa a incluir páginas e recursos da plataforma e o catálogo de conquistas, além das fontes anteriores. O catálogo usa normalização de acentos, palavras relacionadas, partes de palavras e tolerância a um pequeno erro de digitação. Exemplos: clas/posição → Ranking; onde vejo meu exp → Progresso; medalha → Conquistas; foto → Meu perfil. Consultas com várias palavras procuram os termos úteis e priorizam a intenção de buscar pessoas, grupos, posts ou ajuda. Há até cinco candidatos finais por fonte e vinte resultados no total, sem IA externa, API paga ou dependências novas. Resultados de usuários/grupos mantêm as restrições de privacidade. As setas navegam pelos resultados, Enter abre e Escape fecha. Links de conquistas destacam o item correspondente.

Esta etapa não altera hospedagem, permissões administrativas ou moderação. A separação entre camada de mutações, feedback transitório, notificações persistentes e serviços de comentários/pesquisa permite evoluir esses componentes na preparação para produção.

### Segurança da comunidade

Configurações inclui uma central pessoal de bloqueios, grupos silenciados e denúncias enviadas. Publicações, comentários, mensagens, pedidos de ajuda e perfis têm opções de denúncia/bloqueio. O servidor valida autoria, existência e acesso ao conteúdo, inclusive a participação no grupo para mensagens privadas. Denúncias guardam um registro privado do conteúdo, motivo e explicação opcional (1.000 caracteres, até 8 linhas), com envio idempotente e histórico paginado de 20 registros. A pessoa denunciada não recebe a identidade do denunciante. Nesta etapa o status é **Recebida**; não há punição automática nem painel administrativo de análise.

O bloqueio é uma preferência pessoal: oculta conteúdo do autor, impede convites entre as duas contas e cancela convites pendentes. Grupos compartilhados, ranking e XP continuam intactos. Contatos aceitos ficam ocultos, sem exclusão, e reaparecem ao desbloquear. Até 500 bloqueios por conta. O silenciamento esconde notificações existentes do grupo e impede novas notificações individuais dele; não remove membros, mensagens nem avisos gerais do sistema. Desbloquear e reativar notificações estão disponíveis na central e nos controles correspondentes.

Dados: `communityBlocks`, `communityGroupMutes` e `communityReports`, com índices por proprietário e chaves únicas para impedir duplicações. Leituras e alterações usam a sessão GitHub e as mesmas verificações de origem das demais ações da comunidade. O cliente não escolhe denunciante, autor denunciado ou status. Anexos de autores bloqueados também são protegidos na rota de download.
