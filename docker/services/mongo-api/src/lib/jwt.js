// File: docker/services/mongo-api/src/lib/jwt.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || '';

const verifyToken = (raw) => {
  try {
    const claims = jwt.verify(raw, JWT_SECRET, { algorithms: ['HS256'] });
    if (!claims || typeof claims.sub !== 'string' || claims.sub.length === 0) return null;
    return { id: claims.sub, email: claims.email || null, role: claims.role || null };
  } catch {
    return null;
  }
};

module.exports = { verifyToken };
