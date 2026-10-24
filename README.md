<div align="center">

# Progress Hub

**Comunidade para desenvolvedores com acompanhamento de contribuições, progresso e participação**

Plataforma web em evolução que explora a integração com o GitHub e mecanismos de engajamento para tornar a atividade de desenvolvimento mais visível e colaborativa.

[Projeto](#sobre-o-projeto) · [Recursos](#funcionalidades-e-evolução) · [Tecnologias](#tecnologias) · [Desenvolvimento local](#desenvolvimento-local)

</div>

---

## Sobre o projeto

O **Progress Hub** é uma iniciativa de evolução de uma plataforma open-source para um espaço de comunidade e acompanhamento de atividades de desenvolvimento de software.

A proposta reúne **perfis, contribuições do GitHub, classificações, objetivos, conquistas e interação entre participantes**, com foco em engajamento e progresso contínuo.

**Status:** desenvolvimento ativo. O repositório ainda se chama `QuestLog` porque utiliza esse projeto como base; o nome do produto em evolução é **Progress Hub**.

## Funcionalidades e evolução

As áreas trabalhadas na evolução do projeto incluem:

| Área | Escopo do Progress Hub |
| --- | --- |
| Perfil | Apresentação do desenvolvedor, projetos e contribuições |
| Classificação | Visões global e comunitária, com temporadas |
| Atividades | Missões, objetivos e conquistas |
| Comunidade | Publicações, interações e espaços de colaboração |
| Integração | Autenticação e dados relacionados ao GitHub |
| Experiência | Interface web responsiva e navegação por seções |

A tabela descreve os módulos e objetivos do projeto; não deve ser interpretada como garantia de que cada funcionalidade esteja pronta, integralmente integrada ou disponível em produção.

## Tecnologias

Tecnologias identificadas no código e nas configurações do repositório:

| Camada | Tecnologias |
| --- | --- |
| Interface | React, JavaScript, Tailwind CSS |
| Componentes | Lucide React, Framer Motion |
| Servidor | Node.js, Express |
| Dados e sessões | MongoDB, express-session, connect-mongo |
| Infraestrutura local | Docker, Docker Compose |
| Implantação | Vercel (ambiente de publicação utilizado no projeto) |

Algumas configurações do repositório ainda pertencem à base QuestLog, incluindo referências a autenticação Google, Todoist e TickTick. Elas não devem ser confundidas com a experiência planejada para o Progress Hub.

## Arquitetura geral

```text
Navegador
   |
   v
React / Interface web
   |
   v
Node.js / Express
   |
   +---- MongoDB
   |
   +---- Serviços e integrações
```

O repositório está organizado em `client/`, `server/` e configurações Docker para o ambiente de desenvolvimento.

## Desenvolvimento local

### Pré-requisitos

- Node.js e npm.
- Docker com Docker Compose.
- Credenciais válidas para as integrações exigidas pela versão utilizada.

### Preparação

```bash
git clone https://github.com/phzl0/QuestLog.git
cd QuestLog
cp example.env .env
```

Edite o arquivo `.env` com credenciais próprias, segredos de sessão e URLs adequadas ao ambiente. **Os valores ilustrativos de `example.env` não são credenciais reais.**

### Execução com Docker

```bash
docker compose --env-file .env up --build
```

A configuração do Compose declara:

- Interface: `http://localhost:3000`
- API: `http://localhost:3001`
- MongoDB: porta `27017`

**Atenção:** as configurações herdadas da base QuestLog podem exigir ajustes para a autenticação e os fluxos atuais do Progress Hub. O comando acima descreve o ambiente definido no repositório; não garante que todas as integrações funcionem sem configuração adicional.

## Direções de desenvolvimento

- Consolidar os fluxos de autenticação com GitHub.
- Validar a coleta e o tratamento de contribuições de forma consistente.
- Definir regras transparentes para classificações, conquistas e recompensas.
- Melhorar testes, observabilidade, documentação e processo de implantação.
- Remover ou substituir integrações e textos legados que não pertençam ao produto.
- Garantir persistência e comportamento consistente entre sessões e atualizações.

## Origem e créditos

O Progress Hub foi desenvolvido **a partir do [QuestLog, de hussaino03](https://github.com/hussaino03/QuestLog)**, um projeto open-source originalmente voltado à produtividade e organização de tarefas.

Este repositório acompanha a adaptação e evolução dessa base para uma proposta de comunidade de desenvolvedores. As funcionalidades do projeto original e as alterações introduzidas neste fork devem ser diferenciadas ao documentar novas versões.

## Autor e manutenção

Evolução do projeto e documentação: [phzl0](https://github.com/phzl0).

> Projeto em desenvolvimento. O código e o histórico de commits são as referências para verificar o estado de cada funcionalidade.
