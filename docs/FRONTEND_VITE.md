# Frontend com Vite

O frontend preserva React 18, os componentes existentes, as rotas e as regras da comunidade. Vite substitui Create React App/CRACO; não há migração do backend ou do banco.

## Execução

Requer Node 22.12 ou superior, na linha 22 usada no Docker/CI.

```bash
cd client
npm ci
npm start
```

O endereço permanece `http://localhost:3000`. O comando falha se a porta estiver ocupada em vez de escolher uma porta diferente e quebrar OAuth/origens.

No Docker, o comando existente continua válido na raiz:

```bash
sudo docker compose --env-file .env.test up -d --build
```

O frontend escuta em `0.0.0.0` dentro do container; Compose continua publicando apenas em `127.0.0.1:3000`. Não é necessário alterar callbacks GitHub ou `.env.test` por causa desta migração.

## Configuração pública

Preservadas as duas variáveis públicas existentes: `REACT_APP_PROD` (URL base da API, padrão `http://localhost:3001/api`) e `REACT_APP_GOOGLE_CLIENT_ID` (compatibilidade do código herdado). Apenas essas chaves são substituídas nos componentes; nenhuma variável privada do servidor é exposta. Em produção os valores ficam incorporados no build: alterá-los exige novo build. Não inserir secrets em variáveis públicas.

`index.html` fica na raiz de `client`; arquivos públicos continuam em `public`. JSX em arquivos `.js` é compilado explicitamente, sem renomear todos os componentes.

## Verificação

```bash
npm test -- --watchAll=false --runInBand
npm run build
npm run test:tooling
```

Jest 30 com Babel/jsdom preserva a suíte existente. O launcher fixa UTC apenas no processo dos testes para não depender do fuso da máquina. `test:tooling` depende do build anterior e verifica HTTP/SPA, arquivos públicos, compilação dos componentes, configuração pública e referências aos assets gerados.

O resultado continua em `client/build`. `npm run preview` permite conferir o build local na porta 3000; pare `npm start` antes. Preview e servidor de desenvolvimento não substituem a hospedagem final com HTTPS.

Nesta migração passaram 300 testes do frontend e dois testes da ferramenta. Build local passou. Não foi feito login real no GitHub nem verificação visual em navegador nesta execução; estados de autenticação e chamadas da API são cobertos pela suíte existente e testes HTTP. Docker foi ajustado, mas não executado neste ambiente sem daemon.

## Dependências e próximos ajustes

Removidas CRA/CRACO e dependências exclusivas de seu pipeline. `uuid` agora é dependência explícita do frontend, pois código legado o importava indiretamente. Auditoria caiu de 103 alertas para 27 (22 moderados, cinco altos, nenhum crítico), conforme consulta npm nesta execução. Restam alertas em ferramentas, incluindo Tailwind 3; não foi aplicado `audit fix --force`, que implica mudança de versão principal. Esses números são pontuais, não garantia de segurança.

Vite sinaliza o bundle principal ainda grande. A migração não elimina o custo dos componentes carregados pela aplicação. Próximos trabalhos: analisar dependências restantes, dividir carregamento por páginas e medir desempenho com dados reais, mantendo testes de navegação.
