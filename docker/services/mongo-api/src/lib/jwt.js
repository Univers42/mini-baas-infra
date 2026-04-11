/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   jwt.js                                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:35:03 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/11 12:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// JWT signature verification is now handled by Kong's JWT plugin.
// Services receive trusted headers set by Kong's pre-function plugin:
//   X-User-Id, X-User-Email, X-User-Role

/**
 * Read user identity from Kong-injected trusted headers.
 */
const readUserFromHeaders = (req) => {
  const id = req.headers['x-user-id'];
  if (!id || typeof id !== 'string' || id.length === 0) return null;
  return {
    id,
    email: req.headers['x-user-email'] || null,
    role: req.headers['x-user-role'] || null,
  };
};

module.exports = { readUserFromHeaders };
