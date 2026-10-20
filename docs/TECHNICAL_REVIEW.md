# Revisão técnica — 19/10/2026

Escopo: API ativa, autenticação, MongoDB, sincronização/XP, ferramentas de execução e consultas da comunidade. Revisão de código e testes automatizados; não constitui auditoria independente, teste de invasão ou certificação de capacidade.

## Correções aplicadas

- API ativa centralizada em `server/routes/active.js`. Rotas originais de colaboração modificavam projetos sem autenticação; `/ai/health` podia consumir chamadas externas sem autenticação. APIs antigas de tarefas, IA, feedback, ranking antigo, Google e integrações não são mais montadas. Seus arquivos permanecem para consulta, mas não são funcionalidades suportadas. Reativar exige revisão própria de autorização, origem e limites; dependências exclusivas antigas podem precisar de reinstalação.
- Sessão: servidor recusa configuração ausente/fraca em vez de usar chave fixa de emergência. O login GitHub já exigia segredo com 32 caracteres. Sessões válidas não são alteradas por esta revisão.
- MongoDB: um pool por processo e uma tentativa compartilhada durante inicialização; removido ping em cada chamada. Driver administra reconexões transitórias. Banco `usersDB` preservado, sem migração ou exclusão de dados. Encerramento do HTTP aguarda requisições e fecha pool, com limite de dez segundos.
- Erros de parsing e tamanho retornam JSON, sem corpo da requisição ou stack. Removido log de identificação em cada consulta autenticada; removido cabeçalho de identificação Express.
- Falha de registro analítico não invalida resposta de perfil. Datas inválidas do resumo retornam 400.
- Docker usa Node 22, mesma versão principal do CI. Contextos têm `.dockerignore` próprios: arquivos de ambiente, dependências e builds locais não entram na imagem. Cliente reinicia com Docker. Instalações e CI usam `npm ci` com locks atualizados.
- Dependências: atualizações compatíveis aplicadas após `npm audit`; removidos `nodemailer` e `uuid` do backend, usados apenas em funções antigas ou sem importação. Não há uso de `audit fix --force`.

## Pontuação e permissões revisadas

- Regras preservadas: 10 XP/commit reconhecido pelo GitHub, até 20/dia UTC; 50 XP/PR próprio mesclado, até 100/mês; 25 XP adicionais por colaboração elegível. Missões e conquistas continuam separadas.
- Temporadas são recalculadas, não somadas a cada sincronização. Recompensas possuem identificadores e reconciliação; testes existentes verificam repetição, concorrência e fechamento.
- Commits são contagens diárias reconhecidas pela API, não hashes individuais. Não prometer contabilização de qualquer commit em qualquer branch, atividade privada ou contribuição ainda não indexada.
- Grupos/anexos exigem associação; aprovação de ajuda e estado resolvido são validados no servidor. Administração consulta conta atual, não apenas estado visual.

## Pendências antes da publicação e expansão

1. **Backup/restauração**: automatizar cópia criptografada externa e ensaiar restauração em banco separado. Incluir `usersDB`, sessões quando necessário e arquivos binários; guardar `GITHUB_TOKEN_KEY` separadamente, com recuperação segura. Não foi feito backup do computador do usuário nesta execução.
2. **MongoDB `latest`**: não trocar imagem automaticamente sobre volume existente. Identificar versão/FCV atual, fazer backup, testar restauração e então fixar versão compatível. Nunca usar `docker compose down -v` para atualizar.
3. **Carga**: medir API, pool, consultas, memória e latência com polling e usuários simultâneos. Limites atuais por IP podem afetar redes compartilhadas e são locais a cada processo; antes de múltiplas réplicas, usar controle compartilhado e limites por conta. `trust proxy` deve refletir exclusivamente o proxy real do ambiente.
4. **Ranking/relatórios**: ranking de carreira agrega temporadas por participante; relatórios agregam coleções históricas. Medir com dados representativos, `explain`, índices e limites de tempo; projetar resumos/materializações reconciliáveis quando necessário. Não substituir por cache de XP desatualizado sem validação.
5. **Worker**: sincronização é sequencial e ciclos podem exceder dez minutos com muitas contas. Acrescentar métricas de atraso/falha e fila com concorrência controlada respeitando a API GitHub. Logs e leases não equivalem a monitoramento/alertas operacionais.
6. **Anexos**: arquivos de até 10 MB estão no MongoDB. Antes de escala, quotas atômicas, varredura de arquivos, armazenamento privado externo e política de retenção. Validação de assinatura não garante ausência de conteúdo malicioso.
7. **Frontend**: CRA/dev server não é o servidor final de produção. Separar atualização das ferramentas de build e hospedagem dos arquivos estáticos. Há componentes grandes e CSS com sobreposições; extrair gradualmente com testes, sem reescrever o produto inteiro.
8. **Segurança operacional**: HTTPS, cookies/proxy, origens, secrets, recuperação de conta, retenção/exclusão, termos, limites de uploads e resposta à moderação devem ser verificados no ambiente final. Não houve teste de login real, verificação visual nem carga nesta revisão.

## Validação

Novos testes cobrem concorrência da conexão, retry e encerramento, segredo de sessão, erros HTTP JSON e ausência das APIs herdadas. A suíte existente verifica permissões de grupos, moderação e recompensas em MongoDB real no GitHub Actions. Localmente testes MongoDB são explicitamente ignorados quando `MONGODB_TEST_URI` não está disponível. Consultar o workflow do commit desta revisão para resultados finais.

### Dependências nesta execução

- Backend: auditoria final sem vulnerabilidades conhecidas após atualizações compatíveis e remoção das duas dependências antigas. Isso é resultado pontual do registro npm, não garantia de ausência de falhas.
- Frontend: auditoria inicial apontou 111 alertas, incluindo quatro críticos. Atualizações compatíveis removeram os críticos; ainda restaram 103 alertas (3 baixos, 37 moderados, 63 altos), incluindo cadeia de build/dev server do CRA. Não aplicar a recomendação automática `react-scripts@0.0.0`: ela quebra a ferramenta de build. A migração controlada das ferramentas e a análise de quais pacotes entram no bundle são prioritárias antes de publicar. Não expor o dev server à internet.

## Atualização posterior: migração para Vite

A pendência de substituição do CRA foi tratada em uma etapa separada, documentada em `FRONTEND_VITE.md`. Após a migração a consulta npm apontou 27 alertas no frontend, sem críticos; os 103 alertas acima descrevem a revisão anterior. Alertas remanescentes, carga e backup/restauração continuam pendentes.

## Atualização posterior: preparação de backup

Adicionados scripts de cópia criptografada e ensaio isolado, documentados em `BACKUP_RESTORE.md`. O CI testa dados sintéticos em Docker; o backup real do computador, armazenamento externo e agendamento dependem de configuração/execução local e não foram realizados pelo agente. Não há restauração destrutiva sobre a instância da aplicação.
