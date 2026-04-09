/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   health.js                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/09 23:36:26 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/09 23:36:27 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// File: docker/services/query-router/src/routes/health.js
const { Router } = require('express');
const router = Router();

router.get('/health/live', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/health/ready', async (req, res) => {
  try {
    const response = await fetch(`${process.env.ADAPTER_REGISTRY_URL}/health/live`);
    if (response.ok) {
      return res.json({ status: 'ready', dependencies: { adapter_registry: 'ok' } });
    }
    throw new Error('adapter-registry unhealthy');
  } catch {
    res.status(503).json({ status: 'not ready', dependencies: { adapter_registry: 'error' } });
  }
});

module.exports = router;
