/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   metrics.js                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:35:08 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:52:52 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const { register, Counter, Histogram } = require('prom-client');

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

const mongoOperations = new Counter({
  name: 'mongo_operations_total',
  help: 'Total number of MongoDB operations',
  labelNames: ['collection', 'operation'],
});

module.exports = { register, httpRequestDuration, mongoOperations };
