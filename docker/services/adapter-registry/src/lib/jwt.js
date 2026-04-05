// File: docker/services/adapter-registry/src/lib/jwt.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

const verifyToken = (req) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  try {
    const claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!claims || !claims.sub) return null;
    return { id: claims.sub, email: claims.email || null, role: claims.role || null };
  } catch {
    return null;
  }
};

const requireUser = (req, res, next) => {
  const user = verifyToken(req);
  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'unauthorized', message: 'Valid JWT required' } });
  }
  req.user = user;
  next();
};

module.exports = { verifyToken, requireUser };
