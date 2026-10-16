"""Check account create/edit/reveal against the isolated local D1 database."""
import http.cookiejar
import json
from pathlib import Path
import urllib.request

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
print('Local account create, edit and encrypted password reveal: OK')
