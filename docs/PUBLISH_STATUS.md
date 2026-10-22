# Publicação iniciada em 22/10/2026

Autorizada pelo proprietário, com orçamento zero. Ainda não concluída.

## Recursos criados

- Vercel: projeto `progress-hub`, ID `prj_Qi38vsn41WQUMJSoYcCbv7c5dULY`. Pasta `client`, Vite, `npm ci`, `npm run build`, saída `build`.
- Render: Web Service `progress-hub-api`, plano Free, Docker `server/Dockerfile`, contexto `server`, branch `feat/github-community-mvp`, deploy automático desligado.
- Painel Render: https://dashboard.render.com/web/srv-dbd9gfd9fdbs73ab3u60
- Origem reservada da API: https://progress-hub-api-q9hc.onrender.com — serviço ainda não funcional.
- Atlas: usuário de aplicação `progresshub_render`, restrito ao cluster `progress-hub`, somente `readWrite` em `usersDB`. Credencial gerada pelo Atlas e transferida diretamente para `MONGODB_URI` no Render, sem incluí-la no código ou documentação.

## Pendências que exigem acesso do proprietário

1. Vercel: a API permitiu criar o projeto, mas as consultas seguintes responderam 403 por falta de autorização no espaço `phzl0`. A ferramenta de autorização indicada na mensagem não está disponível nesta conexão. Liberar o acesso da integração a esse espaço/projeto pelo painel da Vercel.
2. Render Environment: copiar do ambiente local somente `SESSION_SECRET`, `GITHUB_TOKEN_KEY`, `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`. Não substituir a URI Atlas configurada por uma URI local. Manter a chave de tokens existente antes de importar o banco local.
3. Definir `CLIENT` e `GITHUB_CALLBACK_URL` quando o hostname real da interface for confirmado; validar `TRUST_PROXY` na topologia Vercel → Render. Confirmar o ID numérico do administrador em `COMMUNITY_ADMIN_GITHUB_IDS`.
4. Atlas: adicionar somente os intervalos de saída reais do serviço Render, exibidos no painel do serviço. Não confundir com a lista de entrada pública do Render e não liberar `0.0.0.0/0` por conveniência.
5. Migrar os dados locais com backup/restauração validado; demos e dados atuais não foram apagados nem migrados automaticamente.
6. Executar deploys finais, aguardar estado pronto/live e testar login, cookie seguro, upload, chat e sincronização no ambiente real. Criação de recurso não comprova funcionamento.

A primeira tentativa Render ocorreu durante a criação do serviço, antes de receber as credenciais locais. Não tratar falha de inicialização por configuração ausente como publicação concluída. O proxy do frontend já aponta para a origem real reservada da API. Nenhuma alteração foi feita nos serviços antigos Ecommerce/PgHero.
