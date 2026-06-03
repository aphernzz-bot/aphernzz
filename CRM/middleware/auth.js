const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requirePerm(modulo, accion) {
  return (req, res, next) => {
    const perms = req.user?.permisos?.[modulo];
    if (!perms || !perms[accion]) {
      return res.status(403).json({ error: `Sin permiso: ${modulo}.${accion}` });
    }
    next();
  };
}

module.exports = { authMiddleware, requirePerm };
