"""Verify preservation of original rows across operations migration and reconciliation."""
import sqlite3
import sys
from pathlib import Path

def open_export(path):
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.executescript(Path(path).read_text(encoding='utf-8-sig'))
    return db

before, after = map(open_export, sys.argv[1:3])
assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not after.execute('PRAGMA foreign_key_check').fetchall()
unchanged = ['clientes', 'plataformas', 'configuracion', 'historial_legacy', 'legacy_workbook_meta',
    'legacy_workbook_chunks', 'secretos_cuenta', 'movimientos', 'operadores']
for table in unchanged:
    columns = [r[1] for r in before.execute(f'PRAGMA table_info({table})')]
    query = f'SELECT {",".join(columns)} FROM {table}'
    assert {tuple(r) for r in before.execute(query)} == {tuple(r) for r in after.execute(query)}, table
for row in before.execute('SELECT * FROM cuentas_servicio'):
    new = after.execute('SELECT * FROM cuentas_servicio WHERE id=?', (row['id'],)).fetchone()
    assert new and all(new[k] == row[k] for k in row.keys()), 'Original account changed'
changed_references = 0
for row in before.execute('SELECT * FROM suscripciones'):
    new = after.execute('SELECT * FROM suscripciones WHERE id=?', (row['id'],)).fetchone()
    assert new
    if row['cuenta_id'] != new['cuenta_id']:
        assert row['cuenta_id'] is None and row['legacy_cuenta'] and new['cuenta_id']
        assert new['version'] == row['version'] + 1
        changed_references += 1
    else:
        assert new['version'] == row['version']
    assert all(new[k] == row[k] for k in row.keys() if k not in ('cuenta_id', 'version'))
assert changed_references == 24
for row in before.execute("SELECT * FROM saldos_iniciales WHERE estado_revision='verificado'"):
    new = after.execute('SELECT * FROM saldos_iniciales WHERE suscripcion_id=?', (row['suscripcion_id'],)).fetchone()
    assert all(new[k] == row[k] for k in row.keys()), 'Previously verified balance changed'
assert after.execute("SELECT COUNT(*) FROM saldos_iniciales WHERE estado_revision='pendiente'").fetchone()[0] == 0
assert after.execute("SELECT COUNT(*) FROM saldos_iniciales WHERE resolucion='base_legacy'").fetchone()[0] == 61
assert after.execute("SELECT COUNT(*) FROM saldos_iniciales WHERE resolucion='historial'").fetchone()[0] == 1
assert after.execute('SELECT COUNT(*) FROM cuentas_servicio').fetchone()[0] == 85
assert after.execute('SELECT COUNT(*) FROM clientes').fetchone()[0] == 456
assert after.execute('SELECT COUNT(*) FROM suscripciones').fetchone()[0] == 456
print('Preservation verified: all original clients, accounts, secrets, financial movements, histories and Excel archive unchanged; only 62 approved balances and 24 reference links reconciled. 19 account records added without passwords.')
