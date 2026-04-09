/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   jwt.js                                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:33:47 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:33:48 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// File: docker/services/adapter-registry/src/lib/jwt.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const SERVICE_TOKEN = process.env.ADAPTER_REGISTRY_SERVICE_TOKEN;

const verifyToken = (req) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  try {
    const claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!claims?.sub) return null;
    return { id: claims.sub, email: claims.email || null, role: claims.role || null };
  } catch {
    return null;
  }
};

/**
 * Accept an internal service token via X-Service-Token header.
 * When used, X-Tenant-Id header must supply the acting tenant.
 */
const verifyServiceToken = (req) => {
  const token = req.headers['x-service-token'];
  if (!token || !SERVICE_TOKEN || token !== SERVICE_TOKEN) return null;
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) return null;
  return { id: tenantId, email: null, role: 'service' };
};

const requireUser = (req, res, next) => {
  const user = verifyToken(req);
  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'unauthorized', message: 'Valid JWT required' } });
  }
  req.user = user;
  next();
};

/**
 * Middleware that accepts either a valid user JWT or a service token.
 * Service-to-service callers supply X-Service-Token + X-Tenant-Id headers.
 */
const requireServiceOrUser = (req, res, next) => {
  const user = verifyServiceToken(req) || verifyToken(req);
  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'unauthorized', message: 'Valid JWT or service token required' } });
  }
  req.user = user;
  next();
};

/**
 * Middleware that requires a JWT with role = 'service_role'.
 * Used for admin-only operations (e.g. deleting any tenant's data).
 */
const requireServiceRole = (req, res, next) => {
  const user = verifyToken(req);
  if (user?.role !== 'service_role') {
    return res.status(403).json({ success: false, error: { code: 'forbidden', message: 'Service-role JWT required' } });
  }
  req.user = user;
  next();
};

module.exports = { verifyToken, requireUser, requireServiceOrUser, requireServiceRole };
