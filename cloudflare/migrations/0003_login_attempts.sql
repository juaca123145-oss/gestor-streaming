CREATE TABLE login_attempts (
  ip TEXT PRIMARY KEY,
  intentos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER NOT NULL DEFAULT 0
);
