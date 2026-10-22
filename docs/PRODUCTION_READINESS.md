# Preparação de produção — Progress Hub

## Arquitetura proposta

- Vercel: frontend estático React/Vite, pasta raiz `client`, saída `build`, Node 22.
- API: imagem `server/Dockerfile`, processo Node contínuo atrás de HTTPS.
- Worker: mesma imagem, comando `node community-worker.js`, sincronização a cada dez minutos e processamento de notificações.
- MongoDB externo persistente: usuários, sessões, XP, demos e anexos. API e worker usam a mesma URI, chave de tokens e `MONGODB_DB` (padrão preservado: `usersDB`).

O navegador acessa tudo por um endereço público, por exemplo `https://progress-hub.vercel.app`. `/api` passa pela Vercel até o backend. O computador do desenvolvedor pode ficar desligado. Nenhuma infraestrutura foi criada ou publicada nesta preparação.

## Por que manter API e worker contínuos

O worker atual não é uma função HTTP: executa ciclos e mantém leases no Mongo. Cron gratuito Hobby da Vercel permite execução diária; não atende ao ciclo de dez minutos. Functions têm limite de payload de 4,5 MB, enquanto o app permite anexos de 10 MB. Preservar os serviços evita reescrever sincronização e uploads nesta etapa. O limite efetivo de upload através do proxy externo ainda deve ser validado no ambiente real.

Referências: https://vercel.com/docs/functions/limitations e https://vercel.com/docs/cron-jobs/usage-and-pricing .

## Configuração preparada

1. Escolher um provedor que mantenha API e worker ativos. O arquivo `deploy/compose.production.yml` é uma base para servidor Docker; usa porta local e exige proxy HTTPS. Não pressupõe serviço gratuito ou contrata recursos.
2. Provisionar MongoDB, com usuário restrito à aplicação e acesso de rede controlado. Atlas Free tem capacidade limitada; anexos ficam no banco e podem consumir rapidamente a cota. Backups devem ser configurados separadamente.
3. Copiar `deploy/production.env.example` para um arquivo privado `.env.production` dentro de `deploy`, ou configurar os nomes no painel do provedor. Nunca enviar segredos ao chat ou ao Git. Manter a mesma `GITHUB_TOKEN_KEY` ao migrar usuários existentes, para conseguir descriptografar os tokens.
4. Migrar o banco local com o fluxo de backup/restauração de `docs/BACKUP_RESTORE.md`. Os demos existentes serão mantidos; um banco novo não recebe esses dados automaticamente. Confirmar banco e contagens antes de trocar a conexão. Os scripts de backup atuais trabalham com `usersDB`: manter esse nome nesta migração; outro nome exige adaptar e validar o fluxo de backup primeiro.
5. Definir os endereços públicos. Rodar `node scripts/prepare-vercel.mjs https://ORIGEM-DA-API` na raiz. O arquivo atual usa deliberadamente domínio `.invalid`; não publicar sem substituir. Não colocar `/api` no argumento.
6. Configurar projeto Vercel com raiz `client`, instalação `npm ci`, build `npm run build`, saída `build`. Deixar `REACT_APP_PROD` sem valor para usar `/api`. A configuração mantém deploy automático por Git desativado até aprovação.
7. GitHub OAuth: Homepage URL e CLIENT usam o endereço público; callback exato `https://SEU-SITE/api/community/auth/callback`. Chaves ficam apenas no backend/worker.
8. Verificar `TRUST_PROXY` conforme o caminho real dos proxies do provedor. O valor não pode ser escolhido pelo número aparente de domínios. Conferir IP dos clientes e rejeição de cabeçalhos falsificados antes de liberar acesso público.

O antigo `server/vercel.json` do QuestLog não faz parte desta arquitetura; foi removido para evitar o deploy acidental com CORS de outro domínio.

## Alterações nesta revisão

Entrada pública exclusiva do Progress Hub; fontes antigas preservadas. Removido Tailwind inutilizado da cadeia de build, substituído por reset CSS explícito. Cookies seguros de produção com SameSite Lax, sessões no mesmo banco da aplicação, logout POST com verificação de origem, respostas da API sem cache, configuração obrigatória de proxy e validação de chaves ao iniciar. Limites autenticados separados por conta. Container sem usuário root. Worker encerra os ciclos antes de fechar o banco, com prazo de dez segundos.

## Validação obrigatória antes da publicação

- Login/logout reais com GitHub pelo domínio público, renovação de sessão e callback.
- Upload de até 10 MB, downloads privados, feed e grupos através do proxy Vercel.
- Worker ativo com navegador fechado; XP, missões e ranking consistentes.
- Testar duas contas e validar IP de origem, permissões administrativas e bloqueios.
- Backup externo e restauração de ensaio; confirmar demos, usuários e histórico após migração.
- Logs sem tokens, monitoramento de erros, alarmes e cotas do banco/hosting.

Os testes locais não comprovam comportamento dos provedores ainda não configurados. A publicação precisa de aprovação final e dos endereços/recursos reais.

## Resultados desta preparação

- Backend: 120 testes passaram com MongoDB isolado, sem testes ignorados.
- Frontend: 316 testes passaram; build e dois testes de tooling passaram.
- Gerador Vercel: dois testes passaram.
- Navegador: bundle de produção conferido a 1440 e 390 pixels, com respostas de API simuladas, sem erros JavaScript ou overflow horizontal na tela inicial. Isso não substitui o teste do proxy/login reais.
- Auditoria npm: zero alertas conhecidos no frontend e nas dependências de produção do backend na data da revisão.
- Demos preservados. Nenhuma migração de dados ou publicação executada.
