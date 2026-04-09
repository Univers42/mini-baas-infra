/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   errorHandler.js                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:35:20 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:53:07 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const errorHandler = (err, req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: { code: 'payload_too_large', message: 'Payload exceeds 256KB limit' } });
  }
  if (err && err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ success: false, error: { code: 'invalid_json', message: 'Malformed JSON payload' } });
  }
  logger.error({ err, requestId: req.requestId }, 'Unhandled error');
  res.status(500).json({ success: false, error: { code: 'internal_error', message: 'Unexpected server error' } });
};

module.exports = errorHandler;
