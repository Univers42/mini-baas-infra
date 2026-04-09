/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   auth.js                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:35:14 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:52:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const { verifyToken } = require('../lib/jwt');

const fail = (res, status, code, message) => {
  res.status(status).json({ success: false, error: { code, message } });
};

const requireUser = (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    return fail(res, 500, 'server_config_error', 'JWT secret is not configured');
  }

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return fail(res, 401, 'missing_authorization', 'Authorization bearer token is required');
  }

  const user = verifyToken(auth.slice(7).trim());
  if (!user) {
    return fail(res, 401, 'invalid_token', 'JWT token is invalid');
  }

  req.user = user;
  next();
};

module.exports = { requireUser };
