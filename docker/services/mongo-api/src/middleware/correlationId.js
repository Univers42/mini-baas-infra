// File: docker/services/mongo-api/src/middleware/correlationId.js
const crypto = require('node:crypto');

const correlationId = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

module.exports = correlationId;
