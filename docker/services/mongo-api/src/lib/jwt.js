/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   jwt.js                                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:35:03 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:52:49 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

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
