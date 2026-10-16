"""Verify a private D1 SQL export against the original workbook and audit manifest."""
import base64
import hashlib
import json
from pathlib import Path
import sqlite3
import sys

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

root = Path(__file__).resolve().parents[1]
private = root / '.migration'
source = Path(sys.argv[1])
export = private / 'remote-export.sql'
audit = json.loads((private / 'audit.json').read_text(encoding='utf-8'))
key = base64.b64decode((private / 'encryption.key').read_text().strip())
db = sqlite3.connect(':memory:')
db.executescript(export.read_text(encoding='utf-8'))
observed = {table: db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
            for table in audit['expectedRows']}
if observed != audit['expectedRows']:
    raise ValueError('Remote row counts differ from source')
meta = db.execute('SELECT sha256, bytes, total_chunks FROM legacy_workbook_meta').fetchone()
chunks = db.execute('SELECT ciphertext, nonce FROM legacy_workbook_chunks ORDER BY chunk_index').fetchall()
recovered = b''.join(AESGCM(key).decrypt(base64.b64decode(nonce), base64.b64decode(ciphertext), None)
                     for ciphertext, nonce in chunks)
if meta != (audit['sourceSha256'], audit['sourceBytes'], len(chunks)):
    raise ValueError('Remote archive metadata differs')
if recovered != source.read_bytes() or hashlib.sha256(recovered).hexdigest() != audit['sourceSha256']:
    raise ValueError('Remote archive differs byte for byte')
if db.execute('PRAGMA foreign_key_check').fetchall():
    raise ValueError('Remote export has broken foreign keys')
print(json.dumps({'rowsMatched': observed, 'sourceSha256': audit['sourceSha256'],
                  'remoteArchiveByteExact': True, 'foreignKeysValid': True}, indent=2))
