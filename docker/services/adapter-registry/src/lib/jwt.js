/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   jwt.js                                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:33:47 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/11 12:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// JWT signature verification is now handled by Kong's JWT plugin.
// Services receive trusted headers set by Kong's pre-function plugin:
//   X-User-Id, X-User-Email, X-User-Role

const SERVICE_TOKEN = process.env.ADAPTER_REGISTRY_SERVICE_TOKEN;

/**
 * Read user identity from Kong-injected trusted headers.
 */
const readUserFromHeaders = (req) => {
  const id = req.headers['x-user-id'];
  if (!id) return null;
  return {
    id,
    email: req.headers['x-user-email'] || null,
    role: req.headers['x-user-role'] || null,
  };
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
  const user = readUserFromHeaders(req);
  if (!user) {
    return res.status(401).json({ success: false, error: { code: 'unauthorized', message: 'Valid JWT required' } });
  }
  req.user = user;
  next();
};

/**
 * Middleware that accepts either a valid user JWT (via Kong headers) or a service token.
 * Service-to-service callers supply X-Service-Token + X-Tenant-Id headers.
 */
const requireServiceOrUser = (req, res, next) => {
  const user = verifyServiceToken(req) || readUserFromHeaders(req);
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
  const user = readUserFromHeaders(req);
  if (user?.role !== 'service_role') {
    return res.status(403).json({ success: false, error: { code: 'forbidden', message: 'Service-role JWT required' } });
  }
  req.user = user;
  next();
};

module.exports = { readUserFromHeaders, requireUser, requireServiceOrUser, requireServiceRole };
