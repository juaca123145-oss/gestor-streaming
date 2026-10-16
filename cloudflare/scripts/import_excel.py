"""Prepare a lossless, encrypted D1 import from the legacy workbook.

Outputs are private under .migration/ and must never be committed.
"""
from __future__ import annotations

import base64
import collections
import csv
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

import openpyxl
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.migration'
if len(sys.argv) < 2:
    raise SystemExit('Uso: python scripts/import_excel.py "ruta-al-Excel.xlsx"')
SOURCE = Path(sys.argv[1])
NAMESPACE = uuid.UUID('a4489519-c5e9-4e48-9ac5-f47455e0cdea')
FLOAT_ARTIFACTS = []


def quote(value):
    if value is None:
        return 'NULL'
    if isinstance(value, bool):
        return str(int(value))
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert(table, columns, values):
    return f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join(map(quote, values))});\n"


def original_text(value):
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.isoformat(sep=' ')
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def date(value):
    if isinstance(value, (dt.date, dt.datetime)):
        return value.date().isoformat() if isinstance(value, dt.datetime) else value.isoformat()
    if value is None:
        return None
    raise ValueError('Unexpected date cell type')


def cents(value):
    if value is None or isinstance(value, (dt.date, dt.datetime)):
        return None
    try:
        amount = Decimal(str(value)) * 100
        if amount != amount.to_integral_value():
            rounded = amount.to_integral_value(rounding=ROUND_HALF_UP)
            if abs(amount - rounded) > Decimal('0.000001'):
                raise ValueError('Fractional cent')
            FLOAT_ARTIFACTS.append(str(value))
            amount = rounded
        return int(amount)
    except InvalidOperation as cause:
        raise ValueError('Invalid money cell') from cause


def encrypt(value, key):
    nonce = os.urandom(12)
    encrypted = AESGCM(key).encrypt(nonce, value, None)
    return base64.b64encode(encrypted).decode('ascii'), base64.b64encode(nonce).decode('ascii')


def rows(sheet):
    values = sheet.values
    headers = next(values)
    return [{header: row[index] if index < len(row) else None for index, header in enumerate(headers)}
            for row in values if any(cell is not None for cell in row)]


def main():
    OUT.mkdir(exist_ok=True)
    source_bytes = SOURCE.read_bytes()
    digest = hashlib.sha256(source_bytes).hexdigest()
    key_path = OUT / 'encryption.key'
    if key_path.exists():
        key = base64.b64decode(key_path.read_text().strip(), validate=True)
        if len(key) != 32:
            raise ValueError('Invalid existing encryption key')
    else:
        key = AESGCM.generate_key(bit_length=256)
        key_path.write_text(base64.b64encode(key).decode('ascii'))

    workbook = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
    clients, accounts, config = (rows(workbook[name]) for name in ['Clientes', 'Cuentas', 'Configuracion'])
    if len({r['id'] for r in clients}) != len(clients) or len({r['id'] for r in accounts}) != len(accounts):
        raise ValueError('Duplicate legacy IDs')

    platforms = sorted({str(r['plataforma']) for r in clients + accounts if r['plataforma']})
    platform_ids = {name: str(uuid.uuid5(NAMESPACE, f'plataforma:{name}')) for name in platforms}
    email_index = collections.defaultdict(list)
    for account in accounts:
        email_index[str(account['correo']).casefold()].append(account)

    sql = [f'-- Source SHA-256: {digest}\n']
    for name, platform_id in platform_ids.items():
        sql.append(insert('plataformas', ['id', 'nombre'], [platform_id, name]))
    for account in accounts:
        aid = str(account['id'])
        sql.append(insert('cuentas_servicio', ['id', 'plataforma_id', 'identificador'],
                          [aid, platform_ids[str(account['plataforma'])], original_text(account['correo'])]))
        ciphertext, nonce = encrypt(original_text(account['contrasena']).encode('utf-8'), key)
        sql.append(insert('secretos_cuenta', ['cuenta_id', 'ciphertext', 'nonce', 'clave_version'],
                          [aid, ciphertext, nonce, 1]))

    references = collections.Counter()
    pending_references = []
    pending_balances = []
    money_pending = 0
    history_count = 0
    for client in clients:
        cid = str(client['id'])
        sid = str(uuid.uuid5(NAMESPACE, f'suscripcion:{cid}'))
        platform = str(client['plataforma'])
        ref = original_text(client['cuenta'])
        matches = email_index[ref.casefold()] if ref else []
        valid_matches = [a for a in matches if a['plataforma'] == platform]
        account_id = str(valid_matches[0]['id']) if len(valid_matches) == 1 else None
        references['linked' if account_id else 'blank' if not ref else 'unresolved'] += 1
        if ref and not account_id:
            pending_references.append({'cliente_id': cid, 'nombre': original_text(client['nombre']),
                'plataforma': platform, 'cuenta_en_excel': ref,
                'coincidencias_misma_plataforma': len(valid_matches)})
        prefix = original_text(client['prefijo']) or '+51'
        if not prefix.startswith('+'):
            prefix = '+' + prefix
        sql.append(insert('clientes', ['id', 'nombre', 'prefijo', 'telefono'],
                          [cid, original_text(client['nombre']), prefix, original_text(client['telefono'])]))
        pin = original_text(client['pin'])
        pin_ciphertext, pin_nonce = encrypt(pin.encode('utf-8'), key) if pin is not None else (None, None)
        purchase = cents(client['precioCompra'])
        sale = cents(client['precioVenta'])
        sql.append(insert('suscripciones', ['id', 'cliente_id', 'plataforma_id', 'cuenta_id',
            'pin_ciphertext', 'pin_nonce', 'pin_clave_version', 'fecha_inicio', 'vence_el',
            'legacy_cliente_id', 'legacy_cuenta', 'precio_compra_centimos', 'precio_venta_centimos', 'fecha_compra'],
            [sid, cid, platform_ids[platform], account_id, pin_ciphertext, pin_nonce, 1 if pin is not None else None,
             date(client['diaCompra']), date(client['diaExpiracion']), cid, ref, purchase, sale, date(client['diaCompra'])]))
        income = cents(client['ingresosTotales'])
        cost = cents(client['costosTotales'])
        renewals = client['renovaciones']
        if renewals is not None and (not isinstance(renewals, (int, float)) or int(renewals) != renewals):
            raise ValueError('Invalid renewal count')
        renewals = int(renewals) if renewals is not None else None
        review = 'verificado' if all(value is not None for value in (income, cost, renewals)) else 'pendiente'
        money_pending += review == 'pendiente'
        if review == 'pendiente':
            pending_balances.append({'cliente_id': cid, 'nombre': original_text(client['nombre']),
                'ingresos_en_excel': original_text(client['ingresosTotales']),
                'costos_en_excel': original_text(client['costosTotales']),
                'renovaciones_en_excel': original_text(client['renovaciones'])})
        sql.append(insert('saldos_iniciales', ['suscripcion_id', 'ingresos_centimos', 'costos_centimos', 'renovaciones', 'estado_revision'],
                          [sid, income, cost, renewals, review]))
        if client['historial'] is not None:
            raw = original_text(client['historial'])
            json.loads(raw)
            sql.append(insert('historial_legacy', ['suscripcion_id', 'json_original'], [sid, raw]))
            history_count += 1

    for row in config:
        sql.append(insert('configuracion', ['clave', 'valor'], [original_text(row['clave']), original_text(row['valor'])]))
    chunk_size = 16_384
    chunks = [source_bytes[i:i + chunk_size] for i in range(0, len(source_bytes), chunk_size)]
    sql.append(insert('legacy_workbook_meta', ['sha256', 'nombre', 'bytes', 'total_chunks'],
                      [digest, SOURCE.name, len(source_bytes), len(chunks)]))
    for index, chunk in enumerate(chunks):
        ciphertext, nonce = encrypt(chunk, key)
        sql.append(insert('legacy_workbook_chunks', ['sha256', 'chunk_index', 'ciphertext', 'nonce', 'clave_version'],
                          [digest, index, ciphertext, nonce, 1]))
    sql_text = ''.join(sql)

    # Verify the generated import against the same schema before creating a deployable file.
    db = sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys = ON')
    for migration in sorted((ROOT / 'migrations').glob('*.sql')):
        db.executescript(migration.read_text(encoding='utf-8'))
    db.executescript(sql_text)
    expected = {'clientes': len(clients), 'cuentas_servicio': len(accounts), 'plataformas': len(platforms),
                'suscripciones': len(clients), 'saldos_iniciales': len(clients), 'historial_legacy': history_count,
                'configuracion': len(config), 'legacy_workbook_chunks': len(chunks)}
    observed = {table: db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] for table in expected}
    if expected != observed:
        raise ValueError('Import row count mismatch')
    encrypted_chunks = db.execute('SELECT ciphertext, nonce FROM legacy_workbook_chunks ORDER BY chunk_index').fetchall()
    recovered = b''.join(AESGCM(key).decrypt(base64.b64decode(nonce), base64.b64decode(ciphertext), None)
                         for ciphertext, nonce in encrypted_chunks)
    if recovered != source_bytes:
        raise ValueError('Workbook archive did not round-trip byte for byte')
    (OUT / 'import.sql').write_text(sql_text, encoding='utf-8')
    report = {'sourceSha256': digest, 'sourceBytes': len(source_bytes), 'expectedRows': expected,
              'accountReferences': dict(references), 'pendingHistoricalBalances': money_pending,
              'accountDatesBlank': len(accounts), 'floatingPointArtifactsRounded': len(FLOAT_ARTIFACTS),
              'archiveRoundTrip': True}
    (OUT / 'audit.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    for filename, records in [('referencias_pendientes.csv', pending_references),
                              ('saldos_pendientes.csv', pending_balances)]:
        with (OUT / filename).open('w', newline='', encoding='utf-8-sig') as stream:
            writer = csv.DictWriter(stream, fieldnames=records[0].keys())
            writer.writeheader()
            writer.writerows(records)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
