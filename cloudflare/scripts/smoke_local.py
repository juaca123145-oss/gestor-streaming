"""Check account create/edit/reveal against the isolated local D1 database."""
import http.cookiejar
import json
from pathlib import Path
import urllib.request
import urllib.error
import uuid

BASE = 'http://127.0.0.1:8788'
private = Path(__file__).resolve().parents[1] / '.migration'
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
session_cookie = ''


def call(path, method='GET', payload=None):
    global session_cookie
    headers = {'Origin': BASE, 'Content-Type': 'application/json'} if method != 'GET' else {}
    if session_cookie:
        headers['Cookie'] = session_cookie
    request = urllib.request.Request(BASE + path, method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers=headers)
    with opener.open(request, timeout=15) as response:
        if path == '/api/login':
            session_cookie = response.headers['Set-Cookie'].split(';', 1)[0]
        return json.load(response)


call('/api/login', 'POST', {'password': (private / 'admin-password.txt').read_text().strip()})
created = call('/api/cuentas', 'POST', {
    'plataformaId': 'test-platform', 'identificador': 'cuenta-prueba@example.test',
    'contrasena': 'clave de prueba', 'fechaCompra': '2026-10-16', 'venceEl': '2026-11-16',
    'codigosUrl': 'https://example.test/codigos', 'codigoPassword': 'codigo de prueba',
    'nota': 'Nota de prueba',
})
account_id = created['id']
account = next(item for item in call('/api/cuentas')['items'] if item['id'] == account_id)
assert account['fechaCompra'] == '2026-10-16' and account['venceEl'] == '2026-11-16'
assert account['codigosUrl'] == 'https://example.test/codigos' and account['nota'] == 'Nota de prueba'
assert call(f'/api/cuentas/{account_id}/revelar', 'POST')['codigoPassword'] == 'codigo de prueba'
call(f'/api/cuentas/{account_id}', 'PATCH', {
    'fechaCompra': '2026-10-16', 'venceEl': '2026-12-16',
    'codigosUrl': 'https://example.test/nuevos-codigos',
    'codigoPassword': 'codigo actualizado', 'nota': 'Nota actualizada',
})
updated = next(item for item in call('/api/cuentas')['items'] if item['id'] == account_id)
assert updated['venceEl'] == '2026-12-16' and updated['nota'] == 'Nota actualizada'
assert call(f'/api/cuentas/{account_id}/revelar', 'POST')['codigoPassword'] == 'codigo actualizado'
platform_name = f'Prueba {uuid.uuid4().hex[:8]}'
new_platform = call('/api/plataformas', 'POST', {'nombre': platform_name})
assert new_platform['nombre'] == platform_name
config = call('/api/configuracion')
updated_config = {**config, 'proveedorNombre': 'Proveedor de prueba',
    'condiciones': {**config['condiciones'], platform_name: 'Condición de prueba'}}
assert call('/api/configuracion', 'PATCH', updated_config)['ok']
saved_config = call('/api/configuracion')
assert saved_config['proveedorNombre'] == 'Proveedor de prueba'
assert saved_config['condiciones'][platform_name] == 'Condición de prueba'
new_client = call('/api/clientes', 'POST', {
    'nombre': 'Cliente de prueba', 'prefijo': '+51', 'telefono': '900000001',
    'plataformaId': 'test-platform', 'cuentaId': account_id, 'perfil': 'Principal',
    'pin': '1234', 'fechaInicio': '2026-10-16', 'venceEl': '2026-11-16',
    'ingresosCentimos': 2000, 'costosCentimos': 1000,
})
client_id, subscription_id = new_client['id'], new_client['suscripcionId']
detail = call(f'/api/clientes/{client_id}')
assert detail['suscripciones'][0]['version'] == 1
delivery = call(f'/api/suscripciones/{subscription_id}/entrega', 'POST')
assert 'clave de prueba' in delivery['mensaje'] and 'PIN: 1234' in delivery['mensaje']
assert 'Condición' not in delivery['mensaje']
edited = call(f'/api/clientes/{client_id}', 'PATCH', {
    'nombre': 'Cliente corregido', 'prefijo': '+51', 'telefono': '900000002',
    'suscripcionId': subscription_id, 'expectedVersion': 1,
    'plataformaId': 'test-platform', 'cuentaId': account_id, 'perfil': 'Secundario',
    'pin': '5678', 'fechaInicio': '2026-10-17', 'venceEl': '2026-12-17',
})
assert edited['version'] == 2
detail = call(f'/api/clientes/{client_id}')
assert detail['nombre'] == 'Cliente corregido'
assert detail['suscripciones'][0]['venceEl'] == '2026-12-17'
assert 'PIN: 5678' in call(f'/api/suscripciones/{subscription_id}/entrega', 'POST')['mensaje']
try:
    call(f'/api/clientes/{client_id}', 'PATCH', {
        'nombre': 'Obsoleto', 'prefijo': '+51', 'telefono': '900000002',
        'suscripcionId': subscription_id, 'expectedVersion': 1,
        'plataformaId': 'test-platform', 'cuentaId': account_id,
        'fechaInicio': '2026-10-17', 'venceEl': '2026-12-17',
    })
    raise AssertionError('Una versión obsoleta se aceptó')
except urllib.error.HTTPError as exc:
    assert exc.code == 409
assert call(f'/api/clientes/{client_id}/archivar', 'POST')['archivado']
assert any(item['id'] == client_id for item in call('/api/clientes?archivados=1')['items'])
assert not any(item['id'] == client_id for item in call('/api/clientes')['items'])
assert not call(f'/api/clientes/{client_id}/restaurar', 'POST')['archivado']
try:
    call(f'/api/cuentas/{account_id}/retirar', 'POST')
    raise AssertionError('Se retiró una cuenta asignada')
except urllib.error.HTTPError as exc:
    assert exc.code == 409
call(f'/api/clientes/{client_id}', 'PATCH', {
    'nombre': 'Cliente corregido', 'prefijo': '+51', 'telefono': '900000002',
    'suscripcionId': subscription_id, 'expectedVersion': 2,
    'plataformaId': 'test-platform', 'cuentaId': None, 'perfil': 'Secundario',
    'fechaInicio': '2026-10-17', 'venceEl': '2026-12-17',
})
assert call(f'/api/cuentas/{account_id}/retirar', 'POST')['retirada']
assert not call(f'/api/cuentas/{account_id}/restaurar', 'POST')['retirada']
print('Local lifecycle, delivery, account, platform and settings API: OK')
