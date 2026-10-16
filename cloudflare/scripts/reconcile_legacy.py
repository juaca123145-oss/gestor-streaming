"""Generate guarded reconciliation SQL from the original XLSX and a fresh D1 export.

The operator approved legacy fallback balances. Never invent account passwords.
Usage: python scripts/reconcile_legacy.py workbook.xlsx .migration/export.sql
"""
import base64
import collections
import datetime
import json
import hashlib
import sqlite3
import sys
import uuid
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import openpyxl
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.executescript(Path(sys.argv[2]).read_text(encoding='utf-8-sig'))
source_hash = hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest()
assert db.execute('SELECT 1 FROM legacy_workbook_meta WHERE sha256=?', (source_hash,)).fetchone(), 'El Excel no coincide con el original importado'
book = openpyxl.load_workbook(sys.argv[1], data_only=True)
values = list(book['Clientes'].values)
clients = {str(r[0]): (i, dict(zip(values[0], r))) for i, r in enumerate(values[1:], 2) if r[0]}
key = base64.b64decode((root / '.migration/encryption.key').read_text().strip())
def cents(v):
    return int((Decimal(str(v)) * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))
def q(v):
    return 'NULL' if v is None else str(v) if isinstance(v, int) else "'" + str(v).replace("'", "''") + "'"
sql, report = [], []
def audit(obj, kind, evidence, prior):
    detail = json.dumps({'evidencia': evidence, 'anterior': prior}, ensure_ascii=False)
    sql.append(f"INSERT INTO auditoria(id,actor_subject,accion,objeto_tipo,objeto_id,detalle_json) VALUES({q(str(uuid.uuid4()))},'local-admin',{q(kind)},'suscripcion',{q(obj)},{q(detail)});")

for row in db.execute("SELECT b.*,s.legacy_cliente_id FROM saldos_iniciales b JOIN suscripciones s ON s.id=b.suscripcion_id WHERE b.estado_revision='pendiente'"):
    number, source = clients[row['legacy_cliente_id']]
    resolution = None
    if all(source[k] is None for k in ['ingresosTotales', 'costosTotales', 'renovaciones', 'historial']):
        if source['precioVenta'] is not None and source['precioCompra'] is not None:
            income, cost, renewals = cents(source['precioVenta']), cents(source['precioCompra']), 0
            resolution = 'base_legacy'
            evidence = f'Clientes fila {number}: sin acumulados ni historial. Base autorizada por el usuario: última venta menos último costo, igual al fallback de la app anterior. Renovaciones previas desconocidas; 0 es el valor operativo del fallback.'
    elif isinstance(source['ingresosTotales'], datetime.datetime) and source['historial']:
        history = json.loads(source['historial'])
        if all(isinstance(h.get('ganancia'), (int, float)) for h in history) and len(history) == int(source['renovaciones']) + 1:
            cost, renewals = cents(source['costosTotales']), int(source['renovaciones'])
            income = cost + sum(cents(h['ganancia']) for h in history)
            if income == cents(source['precioVenta']) * len(history):
                resolution = 'historial'
                evidence = f'Clientes fila {number}: ingreso reconstruido como costo acumulado + suma de ganancias del historial; coincide con {len(history)} ventas al precio registrado. Celda original interpretada como fecha conservada en XLSX cifrado.'
    if resolution:
        sid = row['suscripcion_id']
        sql.append(f"UPDATE saldos_iniciales SET ingresos_centimos={income},costos_centimos={cost},renovaciones={renewals},estado_revision='verificado',resolucion={q(resolution)},evidencia={q(evidence)} WHERE suscripcion_id={q(sid)} AND estado_revision='pendiente';")
        audit(sid, 'conciliar_legacy', evidence, dict(row))
        report.append({'tipo': resolution, 'fila': number, 'suscripcion': sid})

accounts = list(db.execute('SELECT * FROM cuentas_servicio'))
new_accounts = {}
for row in db.execute("SELECT * FROM suscripciones WHERE cuenta_id IS NULL AND legacy_cuenta IS NOT NULL AND trim(legacy_cuenta)<>''"):
    ref = row['legacy_cuenta'].strip()
    matches = [a for a in accounts if a['plataforma_id'] == row['plataforma_id'] and a['identificador'].strip().casefold() == ref.casefold()]
    if len(matches) > 1:
        secrets = []
        for a in matches:
            secret = db.execute('SELECT ciphertext,nonce FROM secretos_cuenta WHERE cuenta_id=?', (a['id'],)).fetchone()
            if not secret: break
            secrets.append(AESGCM(key).decrypt(base64.b64decode(secret['nonce']), base64.b64decode(secret['ciphertext']), None))
        if len(secrets) != len(matches) or len(set(secrets)) != 1: continue
    if matches:
        account_id = sorted(a['id'] for a in matches)[0]
        evidence = 'Coincidencia de plataforma e identificador. Duplicados equivalentes comprobados por credencial; filas originales conservadas.'
    else:
        group = (row['plataforma_id'], ref.casefold())
        account_id = new_accounts.get(group)
        if not account_id:
            account_id = str(uuid.uuid5(uuid.NAMESPACE_URL, 'dorostream:reference:' + ':'.join(group)))
            new_accounts[group] = account_id
            sql.append(f"INSERT INTO cuentas_servicio(id,plataforma_id,identificador,nota) VALUES({q(account_id)},{q(row['plataforma_id'])},{q(ref)},'Reconstruida desde referencia del Excel. Pendiente de completar credenciales.');")
        evidence = 'Ficha reconstruida del identificador original en Clientes y su plataforma; contraseña desconocida, sin inventar credenciales.'
    sql.append(f"UPDATE suscripciones SET cuenta_id={q(account_id)},version=version+1 WHERE id={q(row['id'])} AND cuenta_id IS NULL AND version={row['version']};")
    audit(row['id'], 'vincular_legacy', evidence, {'cuentaId': None, 'referencia': row['legacy_cuenta'], 'nuevaCuentaId': account_id})
    report.append({'tipo': 'referencia', 'suscripcion': row['id']})

out = root / '.migration'
(out / 'reconcile.sql').write_text('\n'.join(sql), encoding='utf-8')
(out / 'reconciliation-report.json').write_text(json.dumps({'casos': report, 'cuentasNuevas': len(new_accounts)}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'casos': dict(collections.Counter(r['tipo'] for r in report)), 'cuentasSinCredenciales': len(new_accounts)}))
