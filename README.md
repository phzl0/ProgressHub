# Progress Hub — Beta

> **Projeto em fase beta.** Interface, regras de pontuação e integrações estão em evolução. O produto se chama **Progress Hub**; o repositório ainda se chama `QuestLog`.

## Comece aqui: usar ou executar

| O que você quer fazer | Caminho |
| --- | --- |
| Participar da comunidade já hospedada | Acesse o endereço da interface fornecido pelo responsável; veja abaixo. |
| Rodar uma cópia no Linux ou Windows | Use o passo a passo Docker deste README. |
| Conectar/publicar sua própria cópia no servidor | Configure Vercel + Render + MongoDB Atlas na seção de servidor. |

**Branch da comunidade: [`feat/github-community-mvp`](https://github.com/phzl0/QuestLog/tree/feat/github-community-mvp).** A `main` ainda contém a base antiga. Os comandos abaixo selecionam a versão do Progress Hub; clonar apenas a `main` não entrega a mesma aplicação.

### Acessar a comunidade pelo servidor — Linux e Windows

1. Obtenha com o responsável a **URL HTTPS da interface na Vercel**. O acesso é pelo navegador, igual nos dois sistemas; não precisa instalar Docker, acessar SSH ou conhecer senhas do banco.
2. Abra essa URL e use o botão de acesso pelo **GitHub**. Confira a autorização solicitada e conclua o retorno para a aplicação.
3. Após entrar, confira seu perfil e a sincronização. Escolha na interface se deseja participar da classificação pública.
4. Se o servidor estiver indisponível, o responsável precisa conferir a configuração e o deploy descritos abaixo. Recarregar a página não corrige credenciais OAuth ou banco ausentes.

**Situação de referência:** o repositório configura a API em `https://progress-hub-api-q9hc.onrender.com`, mas isso é o backend, não a página de entrada. Na conferência de 28/10/2026, `/api/health` respondeu HTTP 503. A URL definitiva da interface não está confirmada neste README; não trate o ambiente como pronto até validar saúde, proxy e login reais. Consulte o [registro da publicação](https://github.com/phzl0/QuestLog/blob/feat/github-community-mvp/docs/PUBLISH_STATUS.md).

### Rodar no Linux

**1. Instale Git e Docker Engine com o plugin Compose.** Use o [guia da sua distribuição](https://docs.docker.com/engine/install/). Node.js e MongoDB são executados dentro dos containers.

**2. Baixe a branch correta e copie a configuração de exemplo:**

```bash
git clone --branch feat/github-community-mvp https://github.com/phzl0/QuestLog.git
cd QuestLog
cp example.env .env.test
```

Faça a cópia apenas na primeira instalação. Se `.env.test` já existir, preserve seu conteúdo. Se o repositório for privado, sua conta GitHub precisa ter acesso; quem já usa SSH pode trocar somente a URL do clone por `git@github.com:phzl0/QuestLog.git`.

**3. Configure sua conta GitHub e os segredos** conforme a seção **Configuração local obrigatória** abaixo. Edite `.env.test` no editor de sua preferência.

**4. Inicie e confira os serviços:**

```bash
sudo docker compose --env-file .env.test up --build -d
sudo docker compose --env-file .env.test ps
sudo docker compose --env-file .env.test logs -f server community-worker
```

Aguarde o servidor conectar ao MongoDB. `Ctrl+C` sai dos logs sem parar os serviços. Se seu usuário já tem acesso ao Docker, pode omitir `sudo`.

**5. Abra [http://localhost:3000/community](http://localhost:3000/community)** e entre pelo GitHub. Saúde da API: [http://localhost:3001/api/health](http://localhost:3001/api/health).

### Rodar no Windows — PowerShell

**1. Instale [Git](https://git-scm.com/downloads) e [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/).** Use o backend WSL 2 com containers Linux e siga os requisitos do instalador. Abra o Docker Desktop e aguarde o mecanismo iniciar.

**2. No PowerShell, baixe a branch e copie o exemplo:**

```powershell
git clone --branch feat/github-community-mvp https://github.com/phzl0/QuestLog.git
cd QuestLog
Copy-Item example.env .env.test
notepad .env.test
```

Copie o arquivo somente na primeira instalação; não sobrescreva uma configuração existente. Node.js e MongoDB rodam nos containers.

**3. Preencha a configuração obrigatória** da próxima seção, salve e feche o editor.

**4. Construa e inicie:**

```powershell
docker compose --env-file .env.test up --build -d
docker compose --env-file .env.test ps
docker compose --env-file .env.test logs -f server community-worker
```

Use `Ctrl+C` para sair dos logs. Não use `sudo` no PowerShell.

**5. Abra [http://localhost:3000/community](http://localhost:3000/community)** e entre pelo GitHub. O Docker Desktop precisa permanecer em execução.

### Configuração local obrigatória — ambos os sistemas

1. No GitHub, abra **Settings → Developer settings → OAuth Apps → New OAuth App** ([atalho](https://github.com/settings/developers)). Crie uma aplicação exclusiva para esta cópia local.
2. Defina **Homepage URL** como `http://localhost:3000` e **Authorization callback URL** exatamente como `http://localhost:3001/api/community/auth/callback`.
3. Copie o Client ID e o Client Secret para `.env.test`. Gere dois segredos diferentes para sessão e criptografia. O comando abaixo usa Node dentro de um container temporário e funciona no terminal Linux e no PowerShell; no Linux, acrescente `sudo` se necessário:

```bash
docker run --rm node:22-alpine node -e "const c=require('node:crypto'); console.log('SESSION_SECRET='+c.randomBytes(32).toString('hex')); console.log('GITHUB_TOKEN_KEY='+c.randomBytes(32).toString('hex'))"
```

4. Em `.env.test`, ajuste estas linhas com **seus próprios valores**:

```dotenv
MONGODB_URI=mongodb://mongodb:27017/usersDB
CLIENT=http://localhost:3000
REACT_APP_PROD=http://localhost:3001/api
GITHUB_CLIENT_ID=SEU_CLIENT_ID
GITHUB_CLIENT_SECRET=SEU_CLIENT_SECRET
GITHUB_CALLBACK_URL=http://localhost:3001/api/community/auth/callback
SESSION_SECRET=COLE_O_PRIMEIRO_SEGREDO_GERADO
GITHUB_TOKEN_KEY=COLE_O_SEGUNDO_SEGREDO_GERADO
```

Os textos `SEU_...` e `COLE_...` são instruções, não valores prontos. `GITHUB_TOKEN_KEY` precisa ter 64 caracteres hexadecimais. As credenciais ilustrativas do exemplo não autenticam contas reais. Google, Todoist, TickTick e IA não são necessários para usar a comunidade GitHub.

Não publique `.env.test` ou segredos. Preserve a chave de tokens junto do backup: trocá-la impede ler tokens já salvos e exige reconectar contas. Para outras opções, veja o [guia da comunidade](https://github.com/phzl0/QuestLog/blob/feat/github-community-mvp/docs/GITHUB_COMMUNITY.md).

### Atualizar, parar e conferir

Na pasta `QuestLog`, já na branch da comunidade:

```bash
git pull --ff-only
docker compose --env-file .env.test up --build -d
```

No Linux, use `sudo` nos comandos Docker se necessário. `git pull` atualiza os arquivos; o Compose reconstrói e executa a nova versão.

Para parar sem remover o banco:

```bash
docker compose --env-file .env.test down
```

Não acrescente `-v`, pois remove o volume do MongoDB. O worker local só sincroniza enquanto Docker e computador estiverem ligados. Falhas de OAuth pedem conferir a URL de retorno; falhas de dados pedem conferir os logs de `server` e `community-worker`.

## Conectar sua própria cópia ao servidor — responsável técnico

A arquitetura preparada usa **Vercel para a interface**, **Render para API e sincronização** e **MongoDB Atlas para persistência**. O navegador usa a origem da interface; o caminho `/api` é encaminhado até o Render. Não coloque a URI do Atlas ou o Client Secret no frontend.

### 1. Banco e GitHub OAuth

- Prepare seu banco Atlas com usuário restrito à aplicação e acesso de rede compatível com os endereços de saída do Render. O banco usado pela aplicação é `usersDB`.
- Crie uma OAuth App para o ambiente hospedado, separada da local. A homepage é a URL HTTPS da interface; o callback é essa mesma origem seguida de `/api/community/auth/callback`.
- Para migrar uma instalação existente, preserve `GITHUB_TOKEN_KEY` e siga [backup e restauração](https://github.com/phzl0/QuestLog/blob/feat/github-community-mvp/docs/BACKUP_RESTORE.md). Clonar o repositório não transfere usuários, histórico ou demos.

### 2. API no Render

Para uma instalação nova, use o [`render.yaml`](https://github.com/phzl0/QuestLog/blob/feat/github-community-mvp/render.yaml) da branch da comunidade, ou configure um Web Service Docker com Dockerfile `server/Dockerfile` e contexto `server`. Se o serviço já existir, atualize sua configuração em vez de criar outro. Confirmar a criação de um Blueprint inicia a primeira publicação.

No ambiente do serviço, configure:

| Variável | Valor / finalidade |
| --- | --- |
| `NODE_ENV` | `production` |
| `COMMUNITY_WORKER_MODE` | `embedded`, para API e sincronização no mesmo serviço |
| `MONGODB_URI` | Sua conexão privada Atlas |
| `MONGODB_DB` | `usersDB` |
| `CLIENT` | Origem HTTPS exata da sua interface, sem caminho ou barra final |
| `GITHUB_CALLBACK_URL` | `CLIENT` seguido de `/api/community/auth/callback` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth App desse ambiente |
| `SESSION_SECRET`, `GITHUB_TOKEN_KEY` | Segredos privados; preserve os existentes numa migração |
| `COMMUNITY_ADMIN_GITHUB_IDS` | IDs numéricos GitHub dos administradores, separados por vírgula |
| `TRUST_PROXY` | Quantidade validada de proxies no caminho real; não copie um número sem verificar |

O Render fornece `PORT`. O health check é `/api/health`: deve retornar HTTP 200 com `{"status":"ok"}` antes de testar o login. Um serviço criado ou uma URL existente não comprova que o backend esteja funcionando.

### 3. Interface na Vercel e conexão com a API

Com **Node.js 22.12 ou superior** instalado, execute na raiz da sua cópia, substituindo o exemplo pela origem HTTPS real da sua API Render, sem `/api`:

```bash
node scripts/prepare-vercel.mjs https://SUA-API.onrender.com
```

Esse comando gera `client/vercel.json` com o encaminhamento de `/api`; não executa deploy. Em uma cópia própria, confira a origem gerada antes de publicá-la. O arquivo atual do projeto aponta para a API de referência citada acima; substitua-a se estiver criando outro servidor.

Na Vercel, use a branch `feat/github-community-mvp`, pasta raiz `client`, instalação `npm ci`, build `npm run build` e saída `build`. Deixe `REACT_APP_PROD` sem configuração para o build usar `/api`. Depois de confirmar a URL pública, atualize `CLIENT`, o callback no Render e o callback da OAuth App com essa mesma origem.

**Não basta mudar `.env.test` para apontar um frontend local à API hospedada:** a origem permitida, cookies e o callback também precisam combinar. Para participar do servidor existente, use a interface oficial; para desenvolver isoladamente, use a instalação Docker local.

### 4. Validar o ambiente

Confira API saudável, login/logout reais pelo domínio público, persistência no Atlas, sincronização e acesso com duas contas. O Blueprint e a configuração Vercel mantêm deploy automático desligado; commits não são uma confirmação de publicação. Esta documentação não executa deploy nem altera serviços.

No [Render Free](https://render.com/docs/free), o serviço pode pausar após 15 minutos sem tráfego. Enquanto pausado, o worker embutido não sincroniza; no próximo acesso pode haver espera de inicialização. Veja [Render e suas limitações](https://github.com/phzl0/QuestLog/blob/feat/github-community-mvp/docs/RENDER_FREE.md) e [preparação de produção](https://github.com/phzl0/QuestLog/blob/feat/github-community-mvp/docs/PRODUCTION_READINESS.md).

## Sobre o projeto

O **Progress Hub é uma comunidade competitiva de desenvolvedores conectada ao GitHub**. A proposta é transformar contribuições de desenvolvimento em progresso visível: carreira, temporadas, classificações, missões e conquistas, junto de espaços para interação e colaboração.

A competição busca incentivar constância e participação. XP é uma regra de engajamento da plataforma, não uma certificação de qualidade técnica ou experiência profissional. Na beta, regras e cobertura dos dados podem mudar.

### Áreas da beta

| Área | Proposta |
| --- | --- |
| Perfil | Identidade, carreira, projetos e conquistas |
| GitHub | Login e sincronização de contribuições elegíveis |
| Competição | XP, níveis, classificações e temporadas |
| Missões | Objetivos com progresso e recompensas de participação |
| Comunidade | Feed, interações, grupos e colaboração |
| Preferências | Aparência, privacidade e notificações |

A disponibilidade depende da versão e da configuração do ambiente. Limites e falhas das APIs do GitHub podem atrasar a sincronização. Consulte as [regras de pontuação e privacidade](https://github.com/phzl0/QuestLog/blob/feat/github-community-mvp/docs/GITHUB_COMMUNITY.md) antes de interpretar os rankings.

## Tecnologias e organização

| Camada | Tecnologias |
| --- | --- |
| Interface | React, JavaScript, Vite, CSS, Lucide React, Framer Motion |
| Backend | Node.js, Express, Passport, sessões |
| Banco e sessões | MongoDB, connect-mongo |
| Ambiente local | Docker e Docker Compose; worker separado |
| Hospedagem preparada | Vercel + Render + MongoDB Atlas; worker embutido no Render |

`client/` contém a interface; `server/`, a API e os processos de sincronização. As integrações e telas antigas de produtividade pertencem à base QuestLog e não definem a proposta atual da comunidade.

## Origem e créditos

O Progress Hub evolui a partir do [QuestLog, de hussaino03](https://github.com/hussaino03/QuestLog), originalmente voltado à produtividade gamificada. O nome do repositório e partes do código preservam essa origem.

Adaptação e manutenção: [phzl0](https://github.com/phzl0). Consulte a [licença do repositório](https://github.com/phzl0/QuestLog/blob/feat/github-community-mvp/LICENSE) e os guias técnicos da branch da comunidade.
