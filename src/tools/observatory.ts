/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   observatory.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/11 19:35:26 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/11 22:12:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * mini-BaaS Observatory — Interactive Real-Time Log Stream + Health Matrix
 *
 * Modes:
 *   interactive (default)  Full CLI with live prompt. Filter logs, show
 *                          health, clear screen — all without stopping the
 *                          stream.
 *   headless               Background daemon. Logs to stdout, PID written
 *                          to .observatory.pid for `make kill-watch`.
 *   logs                   Stream-only, no interactive prompt.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register tools/observatory.ts
 *   npx ts-node -r tsconfig-paths/register tools/observatory.ts --headless
 *   npx ts-node -r tsconfig-paths/register tools/observatory.ts --logs
 *
 * Requires: Docker socket access (/var/run/docker.sock)
 */

import { execSync, spawn } from 'child_process';
import { createInterface, Interface as RLInterface } from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import {
	Observable,
	Subject,
	Subscription,
	EMPTY,
} from 'rxjs';
import {
	catchError,
	takeUntil,
	finalize,
} from 'rxjs/operators';

// ─── Configuration ──────────────────────────────────────────────────────────

const COMPOSE_PROJECT = 'mini-baas';
const PID_FILE = path.resolve(__dirname, '../../.observatory.pid');

// ─── Modes ──────────────────────────────────────────────────────────────────

type Mode = 'interactive' | 'headless' | 'logs';

function resolveMode(): Mode {
	const args = process.argv.slice(2);
	if (args.includes('--headless')) return 'headless';
	if (args.includes('--logs') || args.includes('--logs-only')) return 'logs';
	return 'interactive';
}
