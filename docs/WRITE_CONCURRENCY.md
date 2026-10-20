# Escritas simultâneas e integridade de XP

## Escopo

Arquivo: `server/services/community/write-concurrency.integration.test.js`, executado pela suíte `npm test` do backend. As ações chamam os serviços reais da aplicação sobre MongoDB real, usando dados fictícios em bancos aleatórios `progresshub_writes_<ID>`, removidos ao terminar. Não usam o banco `usersDB` nem a API GitHub.

O objetivo é conferir integridade e idempotência, não medir capacidade máxima ou tempos de resposta HTTP. A autenticação, a validação de origem e os limites HTTP continuam cobertos pelos testes existentes; esta rodada pressiona os serviços de escrita e o banco diretamente. Não houve alteração de interface ou regras de XP.

## Cenários

### Publicações, comentários e reações

- 40 contas publicam simultaneamente, com três cópias da mesma solicitação por conta.
- Rejeições temporárias de publicação são classificadas como 429; a mesma identidade de tentativa é repetida após a escrita original concluir.
- O resultado deve conter exatamente 40 publicações.
- São enviados 120 comentários e 120 respostas distintas, com duas cópias por tentativa. Devem existir exatamente 120 registros de cada tipo.
- Respostas devem marcar a conversa e criar somente 117 notificações, excluindo as três respostas do próprio dono do comentário.
- 800 tentativas concorrentes de reação (400 em post e 400 em comentário) devem resultar em somente uma reação por usuário/alvo: 40 em cada coleção.
- Remoções posteriores devem zerar essas reações.
- O XP das contas precisa continuar intacto: atividade social não cria temporadas ou recompensas de missão/conquista.

### Grupos e chat geral

- 25 participantes enviam seis mensagens distintas cada, com duas cópias por tentativa: 300 envios devem produzir exatamente 150 mensagens e IDs estáveis nas repetições.
- No chat geral, uma conta envia 20 solicitações distintas no mesmo instante: uma é aceita, 19 são rejeitadas pelo intervalo de cinco segundos.
- 20 repetições da solicitação aceita devem devolver o mesmo ID, sem outra mensagem.
- Outras 39 contas conseguem enviar uma mensagem cada no mesmo instante: o intervalo é por conta, não um bloqueio global.
- Atividade de chat não concede XP.

### Missão recebida durante sincronização

Uma sincronização é mantida em andamento por uma barreira controlada. Durante esse intervalo, 20 pedidos de recebimento devem ser recusados com 409, sem criar recibo. Depois de liberar a sincronização, 20 recebimentos concorrentes da missão e novas tentativas devem produzir um único recibo de 300 XP.

A conferência compara XP base, missão, conquistas, temporada, carreira e cache da conta. Conquistas devem ter identidades únicas e status pago. Uma sincronização seguinte, com dez XP base adicionais, precisa aumentar o total em exatamente dez, preservando o bônus anterior.

### Escrita interrompida

É injetada uma falha no primeiro update de bônus, depois que o recibo já foi persistido. O bloqueio da conta precisa ser liberado mesmo com erro. Vinte novas tentativas e uma repetição final devem recuperar o crédito a partir do recibo existente, sem criar outro recibo ou duplicar conquistas.

## Como executar

No ambiente de testes, com MongoDB local dedicado:

```bash
cd server
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 node --test services/community/write-concurrency.integration.test.js
```

Sem `MONGODB_TEST_URI`, esses testes são explicitamente ignorados. Os quatro casos são habilitados no GitHub Actions com MongoDB 7. O pool usa dez conexões. Nenhuma variável de produção ou `.env.test` é carregada pelo arquivo de teste.

## Como interpretar

429 de intervalo e 409 de conta ocupada são recusas esperadas: não significam que uma ação foi aceita e perdida. O cliente deve preservar a tentativa e repeti-la depois, com o mesmo identificador. Os testes verificam essa repetição após o bloqueio, além da contagem final no banco.

Requisições conflitantes não precisam retornar todas sucesso. O requisito é que ações confirmadas permaneçam, repetições não criem cópias e bônus não sejam creditados duas vezes. Reações opostas enviadas simultaneamente por uma mesma conta não têm ordem de intenção garantida sem um protocolo próprio; os cenários usam a mesma intenção e uma remoção posterior explícita.

O ensaio não cobre queda real do servidor, partição de rede, expiração de leases de cinco minutos, múltiplas réplicas, reconexão de navegador ou grandes uploads. A falha de bônus é injetada antes do update, não uma simulação de todos os possíveis pontos de falha. As verificações existentes de anexos, pagamento comunitário e moderação permanecem na suíte, mas não foram transformadas em teste de carga nesta rodada.
