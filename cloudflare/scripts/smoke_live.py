"""Exercise the deployed private API without printing the admin password or customer data."""
import http.cookiejar
import json
from pathlib import Path
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://dorostream-api.juaca12314-2bf.workers.dev'
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
opener.addheaders = [('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36')]


def call(path, method='GET', data=None):
    request = urllib.request.Request(BASE + path, method=method,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Origin': BASE, 'Content-Type': 'application/json'} if method == 'POST' else {})
    try:
        with opener.open(request, timeout=25) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw)
        except ValueError:
            return error.code, {'error': f'non-JSON response, {len(raw)} bytes'}


initial_status, initial_body = call('/api/resumen')
if initial_status != 401:
    raise ValueError(f'Unexpected anonymous response: {initial_status}: {initial_body}')
password = (ROOT / '.migration' / 'admin-password.txt').read_text().strip()
status, body = call('/api/login', 'POST', {'password': password})
if status != 200:
    raise ValueError(f'Login failed: {status}: {body.get("error")}')
assert call('/api/session')[0] == 200
status, summary = call('/api/resumen')
assert status == 200 and summary['clientes'] == 456
assert summary['margenMesCentimos'] == summary['margenExcelMesCentimos'] + summary['margenMovimientosMesCentimos']
assert summary['margenHistoricoVerificadoCentimos'] is not None
assert summary['saldosPendientes'] == 62
status, charts = call('/api/estadisticas')
assert status == 200 and len(charts['meses']) == 12
assert charts['meses'][-1]['mes'] == summary['fecha'][:7]
assert charts['meses'][-1]['margenCentimos'] == summary['margenMesCentimos']
assert sum(row['suscripciones'] for row in charts['plataformas']) == 456
status, config = call('/api/configuracion')
assert status == 200 and config['moneda'] == 'S/.' and config['prefijoDefecto'] == '+51'
assert isinstance(config['condiciones'], dict)
status, accounts = call('/api/cuentas')
assert status == 200 and len(accounts['items']) == 66
assert all(account['venceEl'] is None and account['fechaCompra'] is None for account in accounts['items'])
status, clients = call('/api/clientes?pagina=1&limite=25')
assert status == 200 and clients['total'] == 456 and len(clients['items']) == 25
status, upcoming = call('/api/proximos')
assert status == 200 and len(upcoming['items']) <= 6
assert all(item['venceEl'] >= summary['fecha'] for item in upcoming['items'])
assert call('/api/logout', 'POST')[0] == 200
assert call('/api/resumen')[0] == 401
print(json.dumps({'login': 'ok', 'clients': 456, 'accounts': 66,
                  'legacyAccountDates': 'blank', 'upcoming': len(upcoming['items']),
                  'monthlyMarginCents': summary['margenMesCentimos'],
                  'verifiedHistoricalMarginCents': summary['margenHistoricoVerificadoCentimos'],
                  'pendingHistoricalBalances': summary['saldosPendientes'], 'logout': 'ok'}, indent=2))
