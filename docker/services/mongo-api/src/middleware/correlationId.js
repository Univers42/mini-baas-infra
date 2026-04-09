/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   correlationId.js                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:35:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:35:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// File: docker/services/mongo-api/src/middleware/correlationId.js
const crypto = require('node:crypto');

const correlationId = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

module.exports = correlationId;
