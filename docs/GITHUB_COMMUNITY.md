# Comunidade GitHub — primeira versão

A rota `/community` (também apresentada em `/`) adiciona uma comunidade competitiva ao QuestLog. Mantém React, Tailwind, a barra de progresso, Express, Passport, sessões e MongoDB existentes. A aplicação de tarefas original continua em `/app`. Seus pontos nunca entram na competição.

## Escopo

- Login GitHub com OAuth authorization code, state descartável de dez minutos e PKCE S256.
- Identidade pelo ID numérico estável, não por e-mail ou nome de usuário. Contas Google e GitHub permanecem separadas: não há vínculo automático por e-mail.
- Tokens AES-256-GCM no banco, com chave exclusiva de ambiente; nunca enviados ao frontend.
- Ranking global público dos participantes, Top 100, com consentimento explícito no botão de participação.
- Temporadas mensais UTC. XP, nível, títulos e conquistas são da temporada, não vitalícios.
- Abertura da página sincroniza dados antigos; botão permite nova sincronização após cinco minutos. Não há cron, webhook ou atualização com o usuário ausente nesta versão.

## Pontuação v1

| Atividade | Regra |
| --- | --- |
| Commit reconhecido pelo perfil GitHub em repositório público | 10 XP; máximo de 20 commits por dia UTC |
| PR público de autoria do participante, mesclado no mês | 50 XP; máximo de 100 PRs por mês |
| Tarefas manuais, issues, criação de repositórios, estrelas | Sem pontos nesta versão |

Commits vêm de `contributionsCollection.commitContributionsByRepository`; o total é somado por dia antes de aplicar o limite. Somente repositórios públicos entram. Os critérios de contribuição do GitHub continuam valendo (por exemplo, associação de autoria e branch elegível). Não é uma contagem de todos os commits em todas as branches. PRs vêm de busca GraphQL por autoria, visibilidade pública e data de merge.

O nível reutiliza a curva do QuestLog: 200 XP para passar do nível 1, mais 400 para passar do 2, etc. Títulos: Explorador, Construtor (nível 5) e Veterano (nível 10). Conquistas iniciais: primeiro commit, primeiro PR mesclado, 50 commits no mês e nível 5.

A pontuação é um retrato recalculado, substituído atomicamente após consulta completa. Sincronizar novamente não soma o mesmo resultado outra vez. Uma trava com identificador e validade evita gravações simultâneas; erros preservam o último retrato. Empates são resolvidos pelo ID GitHub (ordem textual) para estabilidade.

Limitações: menos de 100 repositórios de contribuições por mês; ao atingir o limite, a atualização falha explicitamente em vez de gravar dados parciais. GitHub pode atrasar contribuições e indexação de PRs. Retratos podem diminuir se as contribuições mudarem. Quantidade não comprova qualidade, e os limites apenas reduzem abuso: não eliminam spam, contas alternativas ou manipulação de autoria. Não usar esta versão para prêmios financeiros. Histórico de temporadas e análise de relevância ficam para depois.

## Configuração local

1. Crie uma OAuth App própria em https://github.com/settings/developers (OAuth Apps → New OAuth App).
2. Homepage URL: `http://localhost:3000`.
3. Authorization callback URL: `http://localhost:3001/api/community/auth/callback`.
4. Use uma aplicação exclusiva para este MVP, sem autorização `repo` ou escopos privados. A implementação pede escopo vazio e rejeita autorizações com escopos ampliados. Se habilitar tokens com expiração, será necessário reconectar após expirar; renovação automática ainda não está implementada.
5. Copie `example.env` para `.env.test` apenas se ainda não tiver configuração e preencha:

```dotenv
CLIENT=http://localhost:3000
REACT_APP_PROD=http://localhost:3001/api
GITHUB_CLIENT_ID=seu_client_id
GITHUB_CLIENT_SECRET=seu_client_secret
GITHUB_CALLBACK_URL=http://localhost:3001/api/community/auth/callback
GITHUB_TOKEN_KEY=chave_hexadecimal_de_64_caracteres
SESSION_SECRET=outro_segredo_aleatorio_com_pelo_menos_32_caracteres
```

Execute `openssl rand -hex 32` duas vezes para gerar valores independentes de GITHUB_TOKEN_KEY e SESSION_SECRET. Não publique esses valores. Trocar a chave de tokens exige novo login GitHub. Variáveis REACT_APP são públicas no build: nunca coloque segredos nelas.

O Google é opcional para a comunidade. Remova as variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET se não for usar o login legado. Ao executar fora do Docker, configure as variáveis também no ambiente dos respectivos processos.

Depois de configurar, `sudo docker compose --env-file .env.test up --build` reconstrói frontend e backend. Abra `http://localhost:3000/community`. MongoDB e portas da aplicação ficam vinculados ao localhost no Compose desta branch.

O banco de aplicação continua sendo `usersDB`, preservando o comportamento legado. O seed `questlog_test` não é utilizado pela aplicação. Sessões usam o banco da URI de conexão. Na inicialização, o índice Google antigo é migrado para único parcial; um índice GitHub único parcial permite contas sem googleId. Falhas nessa migração interrompem a inicialização para evitar contas duplicadas.

## Endpoints

- GET `/api/community/auth` — inicia OAuth.
- GET `/api/community/auth/callback` — conclui OAuth e cria sessão.
- GET `/api/community/me` — perfil privado com pontuação da temporada atual; nunca retorna token.
- POST `/api/community/sync` — sincroniza apenas a conta da sessão.
- POST `/api/community/participation` — define `{ "optedIn": true/false }` apenas para a conta da sessão.
- GET `/api/community/leaderboard` — Top 100 público da temporada atual.

POSTs exigem Origin igual ao CLIENT configurado. Limite inicial de dez requisições por minuto/IP neste router, em memória por instância; em produção distribuída, migrar para armazenamento compartilhado. Também há intervalo de sincronização e trava no MongoDB por usuário.

## Publicação e validação

Nenhuma publicação faz parte desta entrega. O vercel.json legado contém domínio do autor original; antes de hospedar, revisar CORS, cookies, callback, região do banco, roteamento SPA `/community`, segredos e limites de plataforma. Preferir frontend e API sob a mesma origem para reduzir problemas de cookies entre sites.

Esta implementação não foi validada com login real, MongoDB ou navegador. Testes de execução foram adiados por solicitação do usuário. Antes de disponibilizar: validar consentimento negado, callback inválido, login repetido, mês novo, contas empatadas, opt-out, falhas/rate limits do GitHub e duas sincronizações simultâneas. Próximas entregas: sincronização agendada, histórico de temporadas, paginação além do Top 100, desconexão/exclusão da conta, critérios de contribuição e política de privacidade própria.
