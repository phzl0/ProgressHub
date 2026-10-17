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
