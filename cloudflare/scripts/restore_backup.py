"""Decrypt a downloaded backup into a NEW local recovery directory; never overwrite production.

Usage: python scripts/restore_backup.py downloaded.backup.json recovery-directory
"""
import base64
import getpass
import json
import secrets
import sqlite3
import sys
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

def restore(source, destination, password):
    envelope = json.loads(Path(source).read_text(encoding='utf-8'))
    if envelope.get('formato') != 'dorostream-backup-v1':
        raise ValueError('Formato no compatible')
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32,
        salt=base64.b64decode(envelope['salt']), iterations=100000).derive(password.encode())
    payload = json.loads(AESGCM(key).decrypt(base64.b64decode(envelope['iv']),
        base64.b64decode(envelope['ciphertext']), None))
    out = Path(destination)
    out.mkdir(exist_ok=False)
    db = sqlite3.connect(out / 'recovered.sqlite')
    try:
        for entry in payload['schema']:
            if entry['type'] == 'table': db.execute(entry['sql'])
        for table, rows in payload['tables'].items():
            for row in rows:
                quoted = lambda name: '"' + name.replace('"', '""') + '"'
                db.execute(f'INSERT INTO {quoted(table)} ({",".join(map(quoted,row))}) VALUES ({",".join("?" for _ in row)})', list(row.values()))
        for entry in payload['schema']:
            if entry['type'] != 'table': db.execute(entry['sql'])
        db.execute('UPDATE seguridad_admin SET session_version=session_version+1 WHERE id=1')
        db.commit()
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        (out / 'restore.sql').write_text('\n'.join(db.iterdump()), encoding='utf-8')
        (out / 'account-encryption.key').write_text(payload['accountEncryptionKey'], encoding='utf-8')
        (out / 'worker-secrets.json').write_text(json.dumps({
            'ACCOUNT_ENCRYPTION_KEY': payload['accountEncryptionKey'],
            'ADMIN_PASSWORD_HASH': payload['adminPasswordHash'],
            'AUTHORIZED_ADMIN_EMAIL': payload['adminEmail'],
            'SESSION_SIGNING_KEY': secrets.token_urlsafe(32),
        }), encoding='utf-8')
        print('Respaldo recuperado y verificado en una carpeta nueva. No se modificó la base publicada.')
    finally:
        db.close()

if __name__ == '__main__':
    restore(sys.argv[1], sys.argv[2], getpass.getpass('Clave del respaldo: '))
