# Ensaio de desempenho da API

## Escopo e isolamento

O ensaio executa as rotas reais do backend sobre uma base sintética com nome aleatório `progresshub_perf_<UUID>`, criada e removida pelo próprio processo. Não carrega `.env.test`, não usa `MONGODB_URI` da aplicação, não inicia sincronização GitHub e não modifica `usersDB`.

A conexão exige `MONGODB_PERF_URI` explícita com host `127.0.0.1` ou `localhost`, sem usuário, senha, parâmetros ou nome de banco. O servidor de ensaio escuta somente em `127.0.0.1` e porta temporária. A substituição de identidade e conexão ao banco existe apenas em `server/performance/run.js`; não é montada no servidor da aplicação.

Dataset padrão: 1.000 contas públicas, 12.000 temporadas, 5.000 posts, 25.000 comentários, 25.300 mensagens e 20.000 reações concentradas nos 20 posts recentes. O grupo tem 50 membros, respeitando o limite atual. Os nomes e conteúdos são fictícios. As temporadas incluem detalhes de PRs e dias de commits para representar o custo dos históricos.

## Carga e métricas

Após aquecimento, são executados cenários de 1, 10 e 25 clientes simultâneos, com 12 requisições por cliente. Cada cliente faz duas leituras de cada recurso: ranking de carreira, feed, perfil público, chat geral, ranking da temporada e grupo. Cada cenário usa endereços loopback distintos para os clientes Linux; os limitadores originais permanecem ativos. Uma verificação adicional faz 125 consultas pelo mesmo IP e exige cinco respostas 429 do limite de 120/minuto.

As rotas usam identidade fictícia controlada, substituindo apenas OAuth/desserialização de sessão. Não há bypass de autenticação no produto. Isso mede consultas, rotas, serialização e HTTP local; não mede login real ou custo de armazenamento/leitura das sessões.

O relatório registra por cenário:

- Requisições, códigos HTTP, duração e vazão.
- Mediana (p50), p95 e máximo por recurso. p95 significa que 95% das amostras ficaram abaixo desse valor.
- CPU do processo Node, pico de RSS amostrado e atraso do event loop.
- Número de comandos MongoDB e volume BSON aproximado das respostas, contabilizados no driver. A instrumentação tem custo e está ativa nos dois lados da comparação.
- Versões, CPU, memória do runner, pool de dez conexões e tamanho dos dados sintéticos.

## Alterações comparadas

1. Ranking de carreira: substituída uma agregação correlacionada por participante pela combinação de contas públicas e totais de temporadas em uma única agregação. A soma continua vindo dos registros de temporada, sem cache ou escrita de XP. Usuários sem histórico usam o saldo legado; saldo de temporada igual a zero continua sendo autoritativo. Perfis privados e IDs sem conta pública são excluídos.
2. Carreira/perfil: a consulta de temporadas projeta somente período, posição, status, totais e conquistas. Não transfere arrays detalhados de PRs/dias quando o consumidor só precisa do resumo.
3. Feed: contagens de reações são agrupadas por post/tipo no MongoDB. Deixa de transferir uma entrada por curtida, mantendo contagem total, reação pessoal e registros antigos sem tipo (coração).

Os testes de regressão verificam essas regras, além da suíte existente de temporadas, bônus, privacidade e grupos. Nenhuma regra de pontuação foi alterada.

## Reproduzir

Requer Node 22 e MongoDB local separado para o teste. Não é necessário abrir o site nem usar contas reais. A execução usa recursos do MongoDB indicado, mesmo trabalhando em banco separado; prefira uma instância dedicada para não disputar CPU/memória com dados em uso.

```bash
cd server
npm ci
MONGODB_PERF_URI=mongodb://127.0.0.1:27017 PERF_LABEL=current node performance/run.js
```

O JSON fica em `server/performance-current.json`. `PERF_USERS` aceita de 100 a 5.000; o padrão é 1.000. Se alterar o tamanho, não compare diretamente com outro dataset.

No CI, checkout inclui o histórico Git e o ensaio executa duas versões no mesmo runner: baseline `485925cfca085b826713ceec355a101ab82cc5c8` e implementação atual. O baseline carrega somente os três serviços comparados diretamente do commit histórico, dentro do processo isolado, sobre as mesmas dimensões sintéticas. Não troca arquivos da aplicação nem altera a branch. O controle é `PERF_BASELINE_REF`, que aceita somente SHA completo.

Os relatórios `performance-baseline.json` e `performance-optimized.json` são guardados no artefato `performance-results` do GitHub Actions. Contêm somente métricas e parâmetros sintéticos.

## Limites e próximas medições

Não transformar esses resultados em promessa de quantidade de usuários em produção. Os clientes operam sem pausas e sem renderização de navegador, internet, upload, escrita, OAuth, GitHub API ou workers em paralelo. CPU/RSS reportados são do processo Node, não do MongoDB ou de todo o servidor. O número de clientes concorrentes não é número máximo de contas suportadas.

São 50 amostras por recurso no cenário de 25 clientes, insuficientes para uma avaliação longa de estabilidade. A ordem baseline → otimizado, cache do MongoDB e variação do runner influenciam latências; repetir com ordem alternada e vários ciclos antes de definir metas contratuais. O teste não força limites de tempo baseados em uma máquina compartilhada; exige respostas corretas sem 429/5xx na carga e valida os limites separadamente.

Ficam pendentes: cargas sustentadas e maiores, escrita/reação/envio de mensagens, anexos, sessões reais, acesso de muitos usuários pelo mesmo IP, grande proporção de contas privadas, ranking com anos de histórico e comparação de planos `explain` com volume representativo do futuro servidor. O ranking continua agregando históricos e pode precisar de outra estratégia em escala maior; isso não foi substituído por cache potencialmente desatualizado nesta etapa.

## Resultado da comparação registrada

Execução: [GitHub Actions 39352576263](https://github.com/phzl0/QuestLog/actions/runs/39352576263), código `614e742b946b600da79216e501493e6ba11ecd9f`, comparação com baseline `485925cfca085b826713ceec355a101ab82cc5c8`. Mesmo runner AMD EPYC 7763 (4 CPUs lógicas e 15,61 GiB de RAM visível), Node v22.23.3 e MongoDB 7.0.45. Os números abaixo pertencem a essa execução; futuras execuções podem variar.

Cenário de 25 clientes, 300 requisições totais, 50 amostras por recurso:

| Recurso | p95 antes | p95 depois |
| --- | ---: | ---: |
| Ranking de carreira | 1.789,60 ms | 276,09 ms |
| Feed | 1.274,96 ms | 637,18 ms |
| Perfil público | 477,66 ms | 204,14 ms |
| Chat geral | 186,94 ms | 137,34 ms |
| Ranking da temporada | 90,13 ms | 51,19 ms |
| Chat de grupo | 1.163,27 ms | 326,65 ms |

| Métrica do cenário de 25 clientes | Antes | Depois |
| --- | ---: | ---: |
| Vazão da carga mista | 62,92 req/s | 138,44 req/s |
| Respostas BSON contabilizadas no driver | 20,375 MiB | 2,715 MiB |
| CPU acumulada do processo Node | 2.055,28 ms | 1.243,40 ms |
| Pico de RSS Node amostrado | 298,40 MiB | 294,36 MiB |
| HTTP 200 na carga | 300/300 | 300/300 |

No ranking de carreira, a redução de p95 foi de aproximadamente 85%. O volume BSON contabilizado caiu aproximadamente 87% e a vazão da carga mista foi cerca de 2,2 vezes a anterior. A pequena diferença de RSS não permite concluir uma melhoria relevante de memória; coleta de lixo e ordem das execuções influenciam o valor.

Nos três cenários (1, 10 e 25 clientes), todas as 432 requisições medidas por versão retornaram 200. A verificação separada de limitação obteve exatamente cinco respostas 429 nas 125 consultas do mesmo IP, em ambas as versões. Os testes de regressão com MongoDB, backup/restauração, 300 testes frontend, build e verificações Vite também passaram nessa execução.

O ensaio mostra ganho nesta carga sintética, sem afirmar capacidade máxima ou disponibilidade em produção. O feed continua sendo o recurso mais lento do conjunto otimizado sob 25 clientes; deve ser acompanhado em testes sustentados e com distribuição real de comentários/reações. O ranking continua lendo totais históricos; mantenha medições com crescimento de contas, temporadas e proporção de perfis privados.
