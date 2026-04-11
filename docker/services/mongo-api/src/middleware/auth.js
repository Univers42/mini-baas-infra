/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   auth.js                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:35:14 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/11 12:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const { readUserFromHeaders } = require('../lib/jwt');

const fail = (res, status, code, message) => {
  res.status(status).json({ success: false, error: { code, message } });
};

// JWT verification is handled by Kong. We read trusted headers.
const requireUser = (req, res, next) => {
  const user = readUserFromHeaders(req);
  if (!user) {
    return fail(res, 401, 'missing_authorization', 'Authenticated user required (Kong JWT)');
  }

  req.user = user;
  next();
};

module.exports = { requireUser };
