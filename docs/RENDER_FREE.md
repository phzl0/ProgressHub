# Render Free — API e sincronização no mesmo serviço

## O que mudou

`COMMUNITY_WORKER_MODE=embedded` inicia o agendador dentro do processo HTTP, depois de conectar e preparar o MongoDB. Ele tenta um ciclo ao iniciar, continua a cada dez minutos e verifica notificações a cada minuto. Não cria outro serviço Render.

Sem essa variável, o padrão continua `separate`: o Docker Compose local e a arquitetura com worker separado continuam válidos. Importar `community-worker.js` não inicia trabalho; o comando `node community-worker.js` continua funcionando como processo independente.

O agendador impede sobreposição de uma mesma tarefa no processo; a sincronização mantém o lease MongoDB para coordenar processos diferentes. As regras existentes de crédito idempotente não foram substituídas. No SIGTERM/SIGINT, a API para de aceitar requisições, o agendador deixa de lançar tarefas, espera o trabalho em andamento e só então fecha o MongoDB. Após dez segundos, o processo pode ser encerrado à força; a recuperação usa os leases e registros persistentes existentes. Um lease de processo interrompido pode precisar expirar antes do próximo ciclo.

## Limitações do plano gratuito

O serviço gratuito adormece após quinze minutos sem tráfego de entrada. Enquanto parado, não executa sincronizações nem notificações agendadas. Ao receber um acesso, o Render reinicia o processo e o ciclo inicial tenta retomar os dados disponíveis. Não há garantia de executar a cada dez minutos com todos desconectados; APIs do GitHub também têm janelas e limites de recuperação de atividade histórica. Nenhum mecanismo de ping artificial foi adicionado.

No primeiro acesso após uma pausa pode haver espera ou erro temporário enquanto o backend inicia. Os dados persistem no Atlas; não dependem do disco temporário do Render. O plano gratuito tem outras cotas e não é hospedagem de produção com disponibilidade garantida.

Fontes: https://render.com/docs/free e https://render.com/docs/blueprint-spec .

## Configuração preparada, ainda sem publicar

O `render.yaml` na raiz descreve um único Web Service Docker com `plan: free`, `COMMUNITY_WORKER_MODE=embedded` e deploys automáticos desligados. Não define banco Render, disco pago ou worker pago. O Render fornece a porta pelo ambiente e a API já respeita `PORT`.

**Importar e confirmar o Blueprint inicia a primeira publicação**, mesmo com deploy automático desligado. Não fazer isso antes da aprovação final. O arquivo por si só não cria recursos.

Antes de publicar, preencher no painel do Render:

- `CLIENT`: origem HTTPS real do frontend Vercel, sem barra no final.
- `GITHUB_CALLBACK_URL`: mesma origem seguida de `/api/community/auth/callback`.
- `MONGODB_URI`: conexão privada Atlas com autenticação e banco `usersDB`.
- `SESSION_SECRET`, `GITHUB_TOKEN_KEY`: manter as chaves locais existentes para preservar tokens/sessões na migração; não gerar outra chave de tokens sobre dados antigos.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: credenciais GitHub OAuth.
- `COMMUNITY_ADMIN_GITHUB_IDS`: ID numérico GitHub dos administradores.
- `TRUST_PROXY`: número validado de proxies até a API; conferir IP de cliente e HTTPS tanto pelo endereço Render quanto pelo proxy Vercel antes de liberar uso público. Não copiar um número sem verificar.

Selecionar somente Free e manter upgrades desligados. Usar o hostname gratuito `onrender.com`; o frontend usa o endereço gratuito Vercel. A lista de rede do Atlas precisa incluir os intervalos de saída exibidos pelo serviço Render. Não abrir acesso universal por conveniência. A origem Render deve ser passada ao gerador `scripts/prepare-vercel.mjs` antes do deploy da interface.

Os demos existentes permanecem locais até migrarmos o banco. A configuração não apaga nem cria demos automaticamente. Não subir arquivos `.env` nem colocar a URI nos arquivos do frontend.

## Verificações

Testes do agendador cobrem execução inicial, intervalos, bloqueio de sobreposição, retry após erro e espera no encerramento. Um teste com MongoDB real inicia API+worker, recupera um job persistido com lease expirado, reinicia o processo, repete a recuperação e verifica preservação de um usuário demo e XP. Os testes existentes de créditos duplicados e concorrência continuam necessários. Não houve acesso ao seu Atlas nem deploy real nesta alteração.

Resultado local: 125 testes do backend passaram com MongoDB isolado, sem testes ignorados. O Blueprint passou na validação do JSON Schema oficial do Render. Não foram adicionadas dependências de runtime. A pausa real do Render, o proxy Vercel e o login OAuth continuam pendentes do teste após configurar os serviços.
