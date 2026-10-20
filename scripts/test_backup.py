import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import backup

IMAGE = 'sha256:' + 'a' * 64
COLLECTIONS = [{'name': 'users', 'count': 1, 'sha256': 'hash', 'indexes': []}]


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.work = Path(self.temporary.name)
        self.key = self.work / 'backup.key'
        self.key.write_text('test-key-' * 8)
        self.key.chmod(0o600)
        self.env = self.work / 'config.env'
        self.env.write_text('GITHUB_TOKEN_KEY=private-test-setting\nSESSION_SECRET=fake-session-setting\n')

    def test_key_is_private_and_never_overwritten(self):
        self.assertEqual(backup.private_key(self.key), self.key)
        self.key.chmod(0o644)
        with self.assertRaises(backup.BackupError):
            backup.private_key(self.key)
        self.key.chmod(0o600)
        link = self.work / 'link'
        link.symlink_to(self.key)
        with self.assertRaises(backup.BackupError):
            backup.private_key(link)
        before = self.key.read_bytes()
        backup.private_key(self.key, create=True)
        self.assertEqual(self.key.read_bytes(), before)
        with contextlib.redirect_stdout(io.StringIO()):
            generated = backup.private_key(self.work / 'new' / 'key', create=True)
        self.assertEqual(generated.stat().st_mode & 0o777, 0o600)
        self.assertEqual(len(generated.read_text().strip()), 64)

    def test_key_cannot_be_created_in_the_repository(self):
        target = self.work / 'do-not-create.key'
        with patch.object(backup, 'ROOT', self.work):
            with self.assertRaises(backup.BackupError):
                backup.private_key(target, create=True)
        self.assertFalse(target.exists())

    def test_remote_or_authenticated_databases_are_refused(self):
        for uri in ['mongodb://external:27017/usersDB', 'mongodb+srv://mongodb/usersDB',
                    'mongodb://u:p@mongodb/usersDB', 'mongodb://mongodb/?replicaSet=rs0']:
            config = {'services': {'server': {'environment': {'MONGODB_URI': uri}}}}
            with patch.object(backup, 'output', return_value=json.dumps(config)):
                with self.assertRaises(backup.BackupError):
                    backup.compose_for(self.env)
        with patch.object(backup, 'output', return_value=json.dumps({'services': {'server': {'environment': {'MONGODB_URI': 'mongodb://mongodb:27017/usersDB'}}}})):
            self.assertIn('--env-file', backup.compose_for(self.env))

    def test_failed_dump_unlocks_and_does_not_publish_a_backup(self):
        destination = self.work / 'failed.tar.gpg'
        calls = []
        def inspect(args):
            return json.dumps([{'Image': IMAGE}]) if args[1] == 'inspect' else json.dumps([{'RepoDigests': []}])
        with patch.object(backup, 'output', side_effect=inspect), \
             patch.object(backup, 'mongo', side_effect=lambda c,s: calls.append(s)), \
             patch.object(backup, 'fingerprint', return_value=COLLECTIONS), \
             patch.object(backup, 'run', side_effect=backup.BackupError('dump failed')):
            with self.assertRaises(backup.BackupError):
                backup.snapshot('source', self.env, self.key, destination)
        self.assertTrue(any('fsyncUnlock' in call for call in calls))
        self.assertFalse(destination.exists())
        self.assertEqual(list(self.work.glob('*.partial-*')), [])

    def test_failed_snapshot_restarts_only_previously_running_writers(self):
        calls = []
        def fake_output(args):
            return 'a' * 64 if '-q' in args else 'mongodb\nserver\nclient'
        with patch.object(backup, 'compose_for', return_value=['docker', 'compose']), \
             patch.object(backup, 'output', side_effect=fake_output), \
             patch.object(backup, 'run', side_effect=lambda args,**kwargs: calls.append(args)), \
             patch.object(backup, 'snapshot', side_effect=backup.BackupError('failed')):
            with self.assertRaises(backup.BackupError):
                backup.create(self.env, self.key, self.work / 'backups')
        self.assertIn(['docker', 'compose', 'stop', 'server'], calls)
        self.assertIn(['docker', 'compose', 'start', 'server'], calls)
        self.assertFalse(any('community-worker' in call for call in calls))

    def test_archive_path_traversal_and_symlinks_are_rejected(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('manifest.json', tarfile.SYMTYPE)]:
            path = self.work / 'bad.tar'
            with tarfile.open(path, 'w') as bundle:
                member = tarfile.TarInfo(name); member.type = kind
                bundle.addfile(member)
            with self.assertRaises(backup.BackupError):
                backup.unpack(path, self.work)
        self.assertFalse((self.work.parent / 'escape').exists())

    @unittest.skipUnless(shutil.which('gpg') and os.environ.get('BACKUP_TEST_GPG'), 'real GPG agent runs in CI')
    def test_gpg_roundtrip_and_wrong_key_before_any_docker_operation(self):
        source = self.work / 'plain'
        source.write_bytes(b'private synthetic payload')
        encrypted = self.work / 'encrypted.gpg'
        backup.gpg(self.key, '--cipher-algo', 'AES256', '--output', str(encrypted), '--symmetric', str(source))
        self.assertNotIn(source.read_bytes(), encrypted.read_bytes())
        decrypted = self.work / 'decrypted'
        backup.gpg(self.key, '--output', str(decrypted), '--decrypt', str(encrypted))
        self.assertEqual(decrypted.read_bytes(), source.read_bytes())
        wrong = self.work / 'wrong.key'; wrong.write_text('wrong-key-' * 8)
        with patch.object(backup, 'output') as docker:
            with self.assertRaises(backup.BackupError):
                backup.verify(encrypted, wrong)
            docker.assert_not_called()
        broken = self.work / 'broken.gpg'; broken.write_bytes(encrypted.read_bytes()[:40])
        with patch.object(backup, 'output') as docker:
            with self.assertRaises(backup.BackupError):
                backup.verify(broken, self.key)
            docker.assert_not_called()


@unittest.skipUnless(os.environ.get('BACKUP_TEST_CONTAINER'), 'real Docker/Mongo restore runs in CI')
class RestoreIntegration(unittest.TestCase):
    def test_encrypted_restore_preserves_bson_indexes_and_current_source(self):
        source = os.environ['BACKUP_TEST_CONTAINER']
        # Dedicated synthetic database in the CI-only service, never a user's DB.
        backup.mongo(source, "const d=db.getSiblingDB('usersDB'); if(d.getCollectionNames().length) throw new Error('Fixture DB must be empty'); d.users.insertOne({_id:'fixture',githubId:'42',xp:123,at:ISODate('2026-10-01'),token:'synthetic-token'}); d.users.createIndex({githubId:1},{unique:true}); d.communityAttachments.insertOne({_id:'file',data:BinData(0,'YWJjAA==')}); d.sessions.insertOne({_id:'session',expires:ISODate('2030-01-01')}); d.sessions.createIndex({expires:1},{expireAfterSeconds:0});")
        try:
            with tempfile.TemporaryDirectory() as temporary:
                folder = Path(temporary)
                env = folder / 'settings.env'; env.write_text('GITHUB_TOKEN_KEY=synthetic-recovery-value\n')
                key = folder / 'key'; key.write_text('synthetic-backup-key-' * 4); key.chmod(0o600)
                archive = folder / 'backup.tar.gpg'
                with contextlib.redirect_stdout(io.StringIO()):
                    backup.snapshot(source, env, key, archive)
                self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
                backup.mongo(source, "db.getSiblingDB('usersDB').users.insertOne({_id:'after-backup',githubId:'43',xp:999})")
                before = backup.fingerprint(source)
                with contextlib.redirect_stdout(io.StringIO()):
                    manifest = backup.verify(archive, key)
                self.assertEqual(len(manifest['collections']), 3)
                self.assertEqual(backup.fingerprint(source), before)
                self.assertEqual(next(c for c in manifest['collections'] if c['name']=='users')['count'], 1)
                with tempfile.TemporaryDirectory() as unpacked:
                    work = Path(unpacked)
                    backup.gpg(key, '--output', str(work / 'bundle.tar'), '--decrypt', str(archive))
                    backup.unpack(work / 'bundle.tar', work)
                    self.assertEqual((work / 'config.env').read_bytes(), env.read_bytes())
        finally:
            backup.mongo(source, "db.getSiblingDB('usersDB').dropDatabase()")


if __name__ == '__main__':
    unittest.main()
