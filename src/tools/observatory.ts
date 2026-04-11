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

// ─── Service Discovery ─────────────────────────────────────────────────────

function getActiveServices(): string[] {
	try {
		return execSync('docker compose config --services', {
			encoding: 'utf-8',
			timeout: 10_000,
		})
			.trim()
			.split('\n')
			.filter(Boolean);
	} catch {
		return [
			'waf', 'kong', 'gotrue', 'postgres', 'postgrest', 'mongo',
			'mongo-api', 'adapter-registry', 'query-router', 'email-service',
			'permission-engine', 'schema-service', 'realtime', 'redis',
			'vault', 'vault-init', 'db-bootstrap', 'mongo-keyfile', 'mongo-init',
		];
	}
}

let SERVICES: string[] = [];

function isKnownService(s: string): boolean {
	return SERVICES.includes(s);
}

// ─── ANSI Helpers ───────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const BRIGHT_RED = '\x1b[91m';
const BRIGHT_GREEN = '\x1b[92m';
const BRIGHT_YELLOW = '\x1b[93m';
const BRIGHT_BLUE = '\x1b[94m';
const BRIGHT_MAGENTA = '\x1b[95m';
const BRIGHT_CYAN = '\x1b[96m';

const PALETTE = [
	CYAN, GREEN, YELLOW, MAGENTA, BLUE, BRIGHT_CYAN, BRIGHT_GREEN,
	BRIGHT_YELLOW, BRIGHT_MAGENTA, BRIGHT_BLUE, WHITE, BRIGHT_RED,
];

function colorFor(service: string): string {
	const idx = SERVICES.indexOf(service);
	const i = idx >= 0 ? idx : hashCode(service);
	return PALETTE[Math.abs(i) % PALETTE.length]!;
}

function hashCode(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
	}
	return h;
}

function pad(s: string, len: number): string {
	return s.length >= len ? s.substring(0, len) : s + ' '.repeat(len - s.length);
}

function timestamp(): string {
	return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

/** Strip ANSI escape codes for visible-length measurement. */
function stripAnsi(s: string): string {
	// eslint-disable-next-line no-control-regex
	return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Pad a (possibly ANSI-colored) string to `width` visible characters. */
function vpad(s: string, width: number): string {
	const vis = stripAnsi(s).length;
	return vis >= width ? s : s + ' '.repeat(width - vis);
}

// ─── Docker helpers ─────────────────────────────────────────────────────────

interface ContainerInfo {
	id: string;
	name: string;
	service: string;
	status: string;
