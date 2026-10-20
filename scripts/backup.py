#!/usr/bin/env python3
"""Local Compose backup and isolated restore drill. No production restore command."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import shutil
import signal
import stat
import subprocess
import tarfile
import tempfile
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DB = 'usersDB'
LABEL = 'progresshub.restore-test'
SUDO_DOCKER = False


class BackupError(RuntimeError):
    pass


def run(args, **kwargs):
    if args[0] == 'docker' and SUDO_DOCKER:
        args = ['sudo', '-n', *args]
    result = subprocess.run(args, stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        # Tool output can contain documents, configuration or credentials.
        raise BackupError(f'Falha em {Path(args[0]).name}; detalhes privados não foram exibidos.')
    return result


def output(args):
    return run(args, stdout=subprocess.PIPE).stdout.decode().strip()


def mongo(container, script):
    return output(['docker', 'exec', container, 'mongosh', '--quiet', '--eval', script])


def fingerprint(container):
    # Hash complete BSON values (including binary attachments) without logging data.
    script = """
const crypto = require('crypto');
const database = db.getSiblingDB('usersDB');
const infos = database.getCollectionInfos().sort((a,b)=>a.name.localeCompare(b.name));
const rows = [];
for (const info of infos) {
  if (info.type !== 'collection' || info.name.startsWith('system.')) throw new Error('Unsupported collection');
  const col = database.getCollection(info.name);
  const hash = crypto.createHash('sha256');
  let count = 0;
  col.find().sort({_id:1}).forEach(doc => { hash.update(EJSON.stringify(doc, null, 0, {relaxed:false})); hash.update('\\n'); count++; });
  const indexes = col.getIndexes().sort((a,b)=>a.name.localeCompare(b.name));
  rows.push({name:info.name, count, sha256:hash.digest('hex'), indexes});
}
print(EJSON.stringify(rows, null, 0, {relaxed:false}));
"""
    return json.loads(mongo(container, script))


def private_key(path, create=False):
    path = Path(path).expanduser().absolute()
    if path.resolve().is_relative_to(ROOT):
        raise BackupError('Guarde a chave fora do repositório.')
    if create and not path.exists():
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as key:
            key.write(secrets.token_hex(32) + '\n')
        print(f'Chave criada em {path}. Guarde uma cópia separada e segura.')
    if path.is_symlink() or not path.is_file():
        raise BackupError('Chave ausente ou inválida.')
    info = path.stat()
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077 or info.st_size < 32:
        raise BackupError('A chave deve pertencer ao usuário, ter ao menos 32 bytes e permissão 600.')
    return path.resolve()


def gpg(key, *args, **kwargs):
    return run(['gpg', '--batch', '--no-tty', '--pinentry-mode', 'loopback',
                '--no-symkey-cache', '--passphrase-file', str(key), *args], **kwargs)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as data:
        for block in iter(lambda: data.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def snapshot(container, env_file, key, destination):
    """Caller must have stopped application writers. Lock also blocks Mongo TTL writes."""
    destination = Path(destination)
    if destination.exists():
        raise BackupError('O destino já existe; nenhum arquivo será sobrescrito.')
    image = json.loads(output(['docker', 'inspect', container]))[0]['Image']
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
        raise BackupError('Imagem MongoDB não identificada.')
    image_info = json.loads(output(['docker', 'image', 'inspect', image]))[0]
    locked = False
    partial = destination.with_name(destination.name + '.partial-' + secrets.token_hex(6))
    try:
        with tempfile.TemporaryDirectory(prefix='progresshub-backup-') as temporary:
            work = Path(temporary)
            # Recovery settings are encrypted with the dump, never printed.
            shutil.copyfile(env_file, work / 'config.env')
            os.chmod(work / 'config.env', 0o600)
            mongo(container, 'db.getSiblingDB("admin").fsyncLock()')
            locked = True
            collections = fingerprint(container)
            if not collections:
                raise BackupError('Banco usersDB vazio; confira a instância antes de copiar.')
            with open(work / 'database.archive.gz', 'xb') as archive:
                run(['docker', 'exec', container, 'mongodump', '--db', DB, '--archive', '--gzip'], stdout=archive)
            manifest = {'format': 1, 'database': DB, 'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                        'mongoVersion': mongo(container, 'db.version()'), 'image': image,
                        'imageDigests': image_info.get('RepoDigests', []), 'collections': collections,
                        'dumpSHA256': sha256(work / 'database.archive.gz')}
            (work / 'manifest.json').write_text(json.dumps(manifest), encoding='utf8')
            mongo(container, 'db.getSiblingDB("admin").fsyncUnlock()')
            locked = False
            with tarfile.open(work / 'bundle.tar', 'w') as bundle:
                for name in ['database.archive.gz', 'manifest.json', 'config.env']:
                    bundle.add(work / name, arcname=name)
            gpg(key, '--cipher-algo', 'AES256', '--compress-algo', 'none', '--output', str(partial),
                '--symmetric', str(work / 'bundle.tar'))
            os.chmod(partial, 0o600)
            # Hard link publishes atomically and refuses an existing destination.
            os.link(partial, destination)
        print(f'Backup criptografado concluído: {destination}')
    finally:
        try:
            if locked:
                mongo(container, 'db.getSiblingDB("admin").fsyncUnlock()')
        finally:
            partial.unlink(missing_ok=True)


def unpack(bundle, work):
    with tarfile.open(bundle, 'r:') as archive:
        members = archive.getmembers()
        expected = {'manifest.json', 'config.env', 'database.archive.gz'}
        if len(members) != 3 or {item.name for item in members} != expected or any(not item.isfile() for item in members):
            raise BackupError('Estrutura do backup inválida.')
        for member in members:
            if member.name != 'database.archive.gz' and member.size > 1024 * 1024:
                raise BackupError('Metadados do backup excedem o limite.')
            with archive.extractfile(member) as source, open(work / member.name, 'xb') as target:
                shutil.copyfileobj(source, target)
    manifest = json.loads((work / 'manifest.json').read_text())
    if manifest.get('format') != 1 or manifest.get('database') != DB or not re.fullmatch(r'sha256:[a-f0-9]{64}', manifest.get('image', '')):
        raise BackupError('Formato do backup não suportado.')
    if sha256(work / 'database.archive.gz') != manifest.get('dumpSHA256'):
        raise BackupError('O arquivo de banco está danificado.')
    return manifest


def verify(backup, key):
    container = None
    nonce = secrets.token_hex(16)
    with tempfile.TemporaryDirectory(prefix='progresshub-restore-') as temporary:
        work = Path(temporary)
        try:
            # Verify full encryption integrity before giving any content to MongoDB.
            gpg(key, '--output', str(work / 'bundle.tar'), '--decrypt', str(backup))
            manifest = unpack(work / 'bundle.tar', work)
            # Require the original image locally. Never run an arbitrary tag from a backup.
            output(['docker', 'image', 'inspect', manifest['image']])
            container = output(['docker', 'create', '--network', 'none', '--label', f'{LABEL}={nonce}',
                                manifest['image'], 'mongod', '--bind_ip', '127.0.0.1',
                                '--setParameter', 'ttlMonitorEnabled=false'])
            if not re.fullmatch(r'[a-f0-9]{64}', container):
                raise BackupError('Container temporário inválido.')
            run(['docker', 'start', container], stdout=subprocess.DEVNULL)
            for attempt in range(60):
                try:
                    mongo(container, 'db.adminCommand({ping:1})')
                    break
                except BackupError:
                    if attempt == 59:
                        raise BackupError('MongoDB temporário não iniciou.')
                    time.sleep(0.5)
            with open(work / 'database.archive.gz', 'rb') as source:
                run(['docker', 'exec', '-i', container, 'mongorestore', '--archive', '--gzip',
                     '--nsInclude', 'usersDB.*', '--stopOnError'], stdin=source, stdout=subprocess.DEVNULL)
            if fingerprint(container) != manifest['collections']:
                raise BackupError('A restauração não corresponde aos dados/índices do backup.')
            print(f'Restauração validada: {len(manifest["collections"])} coleções; conteúdo e índices conferidos. Banco atual intacto.')
            return manifest
        finally:
            if container:
                # Only remove the container created by this operation, with its own label.
                info = json.loads(output(['docker', 'inspect', container]))[0]
                if info['Config'].get('Labels', {}).get(LABEL) != nonce:
                    raise BackupError('Identidade do container temporário não confere; limpeza recusada.')
                run(['docker', 'rm', '-f', '-v', container], stdout=subprocess.DEVNULL)


def compose_for(env_file):
    command = ['docker', 'compose', '--project-directory', str(ROOT), '--env-file', str(env_file), '-f', str(ROOT / 'docker-compose.yml')]
    config = json.loads(output(command + ['config', '--format', 'json']))
    uri = config.get('services', {}).get('server', {}).get('environment', {}).get('MONGODB_URI', '')
    parsed = urlsplit(uri)
    if parsed.scheme != 'mongodb' or parsed.hostname != 'mongodb' or parsed.port not in (None, 27017) or parsed.username or parsed.password or parsed.query:
        raise BackupError('Este procedimento atende somente ao MongoDB local sem autenticação do Compose. URI externa/customizada recusada.')
    return command


def create(env_file, key, directory):
    command = compose_for(env_file)
    container = output(command + ['ps', '-q', 'mongodb'])
    if not re.fullmatch(r'[a-f0-9]{12,64}', container):
        raise BackupError('O MongoDB do projeto precisa estar ligado.')
    directory = Path(directory).expanduser().resolve()
    if directory.is_relative_to(ROOT) or key.is_relative_to(directory):
        raise BackupError('Guarde o backup fora do repositório e separado da chave.')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.stat().st_mode & 0o077:
        raise BackupError('Use pasta privada fora do repositório e separada da chave (permissão 700).')
    running = output(command + ['ps', '--services', '--status', 'running']).splitlines()
    writers = [name for name in ['server', 'community-worker'] if name in running]
    destination = directory / ('progress-hub-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + secrets.token_hex(4) + '.tar.gpg')
    try:
        if writers:
            print('Pausando backend/sincronizador para uma cópia consistente...')
            run(command + ['stop', *writers], stdout=subprocess.DEVNULL)
        snapshot(container, env_file, key, destination)
    finally:
        if writers:
            run(command + ['start', *writers], stdout=subprocess.DEVNULL)
    return destination


def main():
    global SUDO_DOCKER
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['create', 'verify'])
    parser.add_argument('archive', nargs='?')
    parser.add_argument('--env-file', default=str(ROOT / '.env.test'))
    parser.add_argument('--key-file', default=str(Path.home() / '.config/progress-hub/backup.key'))
    parser.add_argument('--output-dir', default=str(Path.home() / 'Backups/progress-hub'))
    parser.add_argument('--sudo-docker', action='store_true', help='Use sudo -v first; only Docker runs as root.')
    args = parser.parse_args()
    SUDO_DOCKER = args.sudo_docker
    for executable in ['docker', 'gpg']:
        if not shutil.which(executable):
            raise BackupError(f'Instale {executable} antes de continuar.')
    key = private_key(args.key_file, create=args.action == 'create')
    if key.is_relative_to(ROOT):
        raise BackupError('Guarde a chave fora do repositório.')
    if args.action == 'create':
        if args.archive:
            raise BackupError('Use --output-dir para escolher a pasta de backup.')
        lock_dir = Path.home() / '.config/progress-hub'
        lock_dir.mkdir(parents=True, mode=0o700, exist_ok=True)
        fd = os.open(lock_dir / 'backup.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise BackupError('Outro backup já está em execução para este usuário.')
            archive = create(Path(args.env_file).absolute(), key, args.output_dir)
        print('Para validar: python3 scripts/backup.py verify ' + shlex.quote(str(archive)) +
              ' --key-file ' + shlex.quote(str(key)) + (' --sudo-docker' if SUDO_DOCKER else ''))
    else:
        if not args.archive:
            raise BackupError('Informe o arquivo .tar.gpg para verificar.')
        verify(Path(args.archive).absolute(), key)


if __name__ == '__main__':
    def interrupted(signum, frame):
        raise BackupError('Operação interrompida; executando limpeza e retomada dos serviços.')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        main()
    except BackupError as error:
        print(str(error), file=__import__('sys').stderr)
        raise SystemExit(1)
    except (OSError, ValueError, KeyError, tarfile.TarError):
        print('Operação não concluída. Confira Docker, espaço livre, chave privada e configuração. Nenhum erro com dados privados foi exibido.', file=__import__('sys').stderr)
        raise SystemExit(1)
