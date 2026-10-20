# Backup e restauração de teste — Progress Hub

O procedimento atende ao Docker Compose local atual: MongoDB sem autenticação no serviço `mongodb` e aplicação usando `usersDB`. Conexões externas, autenticadas ou com parâmetros customizados são recusadas. Não foi criado um comando de restauração sobre o banco em uso.

## Preparação no Ubuntu

Atualize a branch antes de executar. Ferramentas necessárias: Docker Engine/Compose, Python 3.9+ e GnuPG 2. Se Python/GnuPG não estiverem instalados:

```bash
sudo apt install python3 gnupg
```

Execute os scripts com seu usuário normal. Para quem usa `sudo docker`, execute `sudo -v` e acrescente `--sudo-docker`: somente os subprocessos Docker terão privilégios, mantendo chave e arquivos sob seu usuário. O comando usa `sudo -n`, portanto não tenta pedir senha no meio de uma cópia. Renove `sudo -v` antes de cada operação longa.

## 1. Criar uma cópia

Na raiz `~/Projetos/QuestLog`:

```bash
sudo -v
python3 scripts/backup.py create --sudo-docker
```

Se Docker já funciona sem sudo, omita a opção e `sudo -v`.

O comando:

1. Verifica se o Compose aponta para o MongoDB local suportado.
2. Cria uma chave aleatória em `~/.config/progress-hub/backup.key`, somente na primeira execução. Chave existente nunca é substituída.
3. Pausa backend e sincronizador que estavam ligados. O site fica temporariamente sem API; cliente e MongoDB permanecem ligados.
4. Bloqueia escritas no MongoDB, inclusive expiração TTL, durante a leitura do banco; copia documentos, binários e índices e libera o bloqueio.
5. Empacota banco, configuração `.env.test` e manifesto. Criptografa com GnuPG/AES-256 e publica arquivo com permissão 600 em `~/Backups/progress-hub/`.
6. Retoma apenas os serviços que estavam ligados, também em caso de erro tratado.

Um bloqueio local impede dois backups simultâneos do mesmo usuário. Não rode operadores/rotinas paralelas com usuários diferentes na mesma instância. Faça a cópia em um período tranquilo; o tempo depende do volume de dados.

O nome exato do arquivo e o comando para verificá-lo aparecem no terminal. Não há remoção automática de backups antigos nem agendamento nesta etapa.

Para outros locais, preservando pastas fora do repositório:

```bash
python3 scripts/backup.py create --env-file .env.test --key-file "$HOME/.config/progress-hub/backup.key" --output-dir "$HOME/Backups/progress-hub" --sudo-docker
```

A pasta de backups deve ter permissão 700 e não pode conter a chave. A chave deve ter permissão 600, pertencer ao usuário e ter ao menos 32 bytes. Não edite a chave gerada.

## 2. Testar a recuperação

Copie o comando exibido ao concluir o backup, ou substitua o caminho abaixo pelo arquivo real:

```bash
sudo -v
python3 scripts/backup.py verify "$HOME/Backups/progress-hub/NOME-DO-ARQUIVO.tar.gpg" --sudo-docker
```

A verificação descriptografa e confere a integridade antes de iniciar MongoDB. Cria um container novo, sem rede externa, portas publicadas ou volume do banco atual, usando a imagem exata do MongoDB que originou a cópia. Restaura ali e compara cada coleção por contagem, SHA-256 dos valores BSON completos e definições dos índices. Isso inclui o conteúdo binário dos anexos. O monitor TTL fica desligado no ambiente de teste para não apagar registros expirados antes da comparação.

Ao concluir, remove somente esse container e seus volumes temporários. O banco usado pela aplicação não recebe restauração, exclusão ou alteração. Não há opção `--drop` nem parâmetro para apontar a recuperação ao MongoDB atual.

Guarde a confirmação de sucesso juntamente com a data do ensaio. Arquivo criado não significa restauração testada: execute os dois passos.

## O que está incluído

- Todas as coleções normais de `usersDB`: usuários, temporadas, XP, recompensas, metas, conquistas, posts, comentários, grupos, mensagens, moderação, notificações e anexos binários.
- Índices e metadados exportados pelo `mongodump`.
- `.env.test` (ou o arquivo indicado) dentro do pacote criptografado. Inclui as chaves de recuperação e configurações que existirem nesse arquivo.
- Manifesto com versão do MongoDB, ID e digests da imagem, hashes e contagens. Não contém conteúdo dos documentos.

Sessões que estiverem em outro banco, logs, imagens Docker, código e banco de administração do MongoDB não são incluídos. Usuários podem precisar entrar novamente após uma recuperação. Views/coleções de sistema não são suportadas por este procedimento. O código está no GitHub, mas guarde a identificação da versão utilizada junto ao backup.

## Guardar com segurança

O arquivo `.tar.gpg` deve ser copiado para outro dispositivo/local de armazenamento confiável; apenas deixar no mesmo computador não protege contra perda do disco. Nenhum destino externo foi configurado nesta etapa.

Mantenha uma cópia da chave de backup em gerenciador de senhas ou mídia separada e protegida. Não coloque a chave junto aos arquivos de backup, no GitHub ou em mensagens. Sem ela, a cópia criptografada não pode ser recuperada.

A configuração criptografada contém `GITHUB_TOKEN_KEY`, necessária para ler os tokens GitHub já salvos, e `SESSION_SECRET`, entre outros valores existentes. A chave do backup é diferente dessas chaves da aplicação. Também é prudente guardar a configuração de recuperação separadamente em um cofre. Não envie valores de secrets para pedir ajuda.

A execução usa arquivos descriptografados em uma pasta temporária privada e apaga essa pasta ao terminar. Não é apagamento físico seguro; use disco criptografado e espaço livre suficiente. Há arquivos temporários com o dump e o pacote, além do arquivo criptografado final. A restauração usa espaço temporário no host e volumes Docker descartáveis.

## Outro computador e recuperação real

Os arquivos não incluem a imagem MongoDB. Para validar em outro computador, instale Docker/Python/GnuPG, transfira backup e chave separadamente e disponibilize a mesma imagem. O manifesto armazena o ID e digests para identificá-la; não atualize o MongoDB nem reutilize `latest` às cegas. Se a imagem exata não estiver disponível localmente, o teste falha antes de criar o container. A obtenção da imagem e compatibilidade devem ser conferidas numa recuperação assistida.

Recuperar a aplicação de verdade exige selecionar a cópia, validar a restauração isolada, conferir configurações/versões e planejar a troca do banco. O script não sobrescreve a instância atual. Faça esse procedimento como etapa própria, com cópia do estado atual.

## Falhas e interrupções

Erros de ferramentas não despejam documentos ou secrets no terminal. O script falha com saída diferente de zero; não trate esse caso como backup válido. Arquivo parcial não é publicado como cópia concluída. Chave errada, cópia truncada, formato inválido ou hash divergente impedem a validação.

Sinais normais de interrupção executam a limpeza e retomada. Queda de energia, `kill -9` ou indisponibilidade do Docker podem impedir a limpeza. Se o MongoDB ficar bloqueado após uma interrupção abrupta, confira que não existe backup ativo antes de liberar:

```bash
sudo docker compose --env-file .env.test exec -T mongodb mongosh --quiet --eval 'db.getSiblingDB("admin").fsyncUnlock()'
sudo docker compose --env-file .env.test start server community-worker
```

O segundo comando inicia os dois serviços; use apenas aqueles que deseja ligados. Containers de ensaio remanescentes podem ser identificados pela etiqueta `progresshub.restore-test`:

```bash
sudo docker ps -a --filter label=progresshub.restore-test
```

Inspecione o ID antes de remover um container temporário. Não execute `docker compose down -v` nem remova `mongodb_data` para atualizar ou testar recuperação.

## Validação automatizada

```bash
python3 -m unittest discover -s scripts -p 'test_backup.py' -v
```

Testes unitários verificam permissões, rejeição de URI externa, retomada de serviços, desbloqueio após falha e rejeição de caminhos maliciosos. O CI habilita GPG real e um MongoDB Docker dedicado, cria fixture com XP, datas, binários e índices, gera cópia criptografada, altera a origem, restaura em container separado e confirma que a origem continua intacta. A configuração também é conferida após descriptografia. Nenhum dado real do usuário é acessado por esses testes.

Neste ambiente local não há Docker e o agente GPG não pode iniciar; esses ensaios reais são executados no GitHub Actions. A cópia do seu computador só existe depois que você executar `create` localmente. Não há backup automático em servidor ou nuvem nesta entrega.
