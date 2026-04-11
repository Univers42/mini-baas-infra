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
	health: string;
	startedAt: string;
}

function listContainers(): ContainerInfo[] {
	try {
		const raw = execSync(
			`docker ps -a --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}" ` +
			`--format '{{.ID}}|{{.Names}}|{{.Label "com.docker.compose.service"}}|{{.Status}}|{{.State}}'`,
			{ encoding: 'utf-8', timeout: 10_000 },
		).trim();

		if (!raw) return [];

		return raw.split('\n').map((line) => {
			const [id = '', name = '', service = '', status = '', state = ''] = line.split('|');
			let health = 'unknown';
			if (status.includes('(healthy)')) health = 'healthy';
			else if (status.includes('(unhealthy)')) health = 'unhealthy';
			else if (status.includes('(health: starting)')) health = 'starting';
			else if (state === 'running') health = 'running';
			else if (state === 'exited') health = 'exited';
			else if (state === 'created') health = 'created';

			const startedAt = status.replace(/\s*\(.*\)/, '');
			return {
				id: id.trim(), name: name.trim(), service: service.trim(),
				status: status.trim(), health, startedAt: startedAt.trim(),
			};
		});
	} catch {
		return [];
	}
}

// ─── Log entry ──────────────────────────────────────────────────────────────

interface LogEntry {
	service: string;
	stream: 'stdout' | 'stderr';
	message: string;
	timestamp: string;
}

// ─── Observable: Container log stream ───────────────────────────────────────

function containerLogs$(containerId: string, service: string): Observable<LogEntry> {
	return new Observable<LogEntry>((subscriber) => {
		const proc = spawn('docker', ['logs', '--follow', '--tail', '50', containerId], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		const processLine = (data: Buffer, stream: 'stdout' | 'stderr') => {
			const lines = data.toString('utf-8').split('\n');
			for (const raw of lines) {
				const line = raw.trim();
				if (!line) continue;
				subscriber.next({ service, stream, message: line, timestamp: timestamp() });
			}
		};

		proc.stdout?.on('data', (d: Buffer) => processLine(d, 'stdout'));
		proc.stderr?.on('data', (d: Buffer) => processLine(d, 'stderr'));
		proc.on('close', () => subscriber.complete());
		proc.on('error', (err) => subscriber.error(err));

		return () => { proc.kill('SIGTERM'); };
	});
}

// ─── Observable: Docker events ──────────────────────────────────────────────

interface DockerEvent {
	type: 'start' | 'stop' | 'die' | 'create';
	containerId: string;
	service: string;
}

function dockerEvents$(): Observable<DockerEvent> {
	return new Observable<DockerEvent>((subscriber) => {
		const proc = spawn(
			'docker',
			[
				'events',
				'--filter', `label=com.docker.compose.project=${COMPOSE_PROJECT}`,
				'--filter', 'type=container',
				'--filter', 'event=start',
				'--filter', 'event=stop',
				'--filter', 'event=die',
				'--format', '{{.Status}}|{{.ID}}|{{.Actor.Attributes.com.docker.compose.service}}',
			],
			{ stdio: ['ignore', 'pipe', 'pipe'] },
		);

		proc.stdout?.on('data', (data: Buffer) => {
			for (const raw of data.toString().split('\n')) {
				const line = raw.trim();
				if (!line) continue;
				const [status = '', id = '', svc = ''] = line.split('|');
				const type = status as DockerEvent['type'];
				if (['start', 'stop', 'die'].includes(type)) {
					subscriber.next({ type, containerId: id.substring(0, 12), service: svc });
				}
			}
		});

		proc.on('close', () => subscriber.complete());
		proc.on('error', (err) => subscriber.error(err));
		return () => proc.kill('SIGTERM');
	});
}

// ─── Health Matrix ──────────────────────────────────────────────────────────

function renderHealthMatrix(): string {
	const containers = listContainers();
	const serviceMap = new Map<string, ContainerInfo>();
	for (const c of containers) serviceMap.set(c.service, c);

	const C1 = 20;
	const C2 = 14;
	const C3 = 26;
	const INNER = C1 + C2 + C3 + 8;

	const B = `${CYAN}│${RESET}`;

	const colRow = (a: string, b: string, c: string) =>
		`${B} ${vpad(a, C1)} ${B} ${vpad(b, C2)} ${B} ${vpad(c, C3)} ${B}`;

	const hrFull = (l: string, r: string) =>
		`${CYAN}${l}${'─'.repeat(INNER)}${r}${RESET}`;

	const hrCols = (l: string, x: string, r: string) =>
		`${CYAN}${l}${'─'.repeat(C1 + 2)}${x}${'─'.repeat(C2 + 2)}${x}${'─'.repeat(C3 + 2)}${r}${RESET}`;

	const lines: string[] = [''];

	lines.push(hrFull('┌', '┐'));
	const titleText = `${BOLD}${WHITE}mini-BaaS Health Matrix${RESET}`;
	const tsText = `${DIM}${timestamp()}${RESET}`;
	const titleGap = INNER - 2 - 22 - 8;
	lines.push(`${B} ${titleText}${' '.repeat(Math.max(1, titleGap))}${tsText} ${B}`);

	lines.push(hrCols('├', '┬', '┤'));
	lines.push(colRow(
		`${BOLD}Service${RESET}`,
		`${BOLD}Status${RESET}`,
		`${BOLD}Uptime${RESET}`,
	));
	lines.push(hrCols('├', '┼', '┤'));

	for (const svc of SERVICES) {
		const c = serviceMap.get(svc);
		const color = colorFor(svc);
		let statusCol: string;
		let uptimeCol: string;

		if (!c) {
			statusCol = `${DIM}○ —${RESET}`;
			uptimeCol = `${DIM}—${RESET}`;
		} else if (c.health === 'healthy') {
			statusCol = `${GREEN}● healthy${RESET}`;
			uptimeCol = c.startedAt;
		} else if (c.health === 'running') {
			statusCol = `${YELLOW}● running${RESET}`;
			uptimeCol = c.startedAt;
		} else if (c.health === 'starting') {
			statusCol = `${YELLOW}◐ starting${RESET}`;
			uptimeCol = c.startedAt;
		} else if (c.health === 'unhealthy') {
			statusCol = `${RED}● unhealthy${RESET}`;
			uptimeCol = c.startedAt;
		} else if (c.health === 'exited') {
			const exitMatch = c.status.match(/Exited\s*\((\d+)\)/);
			const exitCode = exitMatch ? parseInt(exitMatch[1]!, 10) : -1;
			statusCol = exitCode === 0
				? `${GREEN}✓ done${RESET}`
				: `${RED}✗ exit(${exitCode})${RESET}`;
			uptimeCol = `${DIM}${c.startedAt}${RESET}`;
		} else {
			statusCol = `${DIM}? ${c.health}${RESET}`;
			uptimeCol = c.startedAt;
		}

		lines.push(colRow(`${color}${svc}${RESET}`, statusCol, uptimeCol));
	}

	for (const c of containers) {
		if (isKnownService(c.service)) continue;
		lines.push(colRow(
			`${colorFor(c.service)}${c.service || c.name}${RESET}`,
			`${YELLOW}● ${c.health}${RESET}`,
			c.startedAt,
		));
	}

	const total = containers.length;
	const up = containers.filter((c) => ['healthy', 'running', 'starting'].includes(c.health)).length;
	const unhealthy = containers.filter((c) => c.health === 'unhealthy').length;
	const exited = containers.filter((c) => c.health === 'exited').length;

	lines.push(hrCols('├', '┴', '┤'));
	const summaryLeft = `${GREEN}● ${up} up${RESET}   ${unhealthy > 0 ? RED : DIM}● ${unhealthy} unhealthy${RESET}   ${DIM}✗ ${exited} exited${RESET}`;
	const summaryRight = `${BOLD}${total}${RESET} ${DIM}total${RESET}`;
	const sGap = INNER - 2 - stripAnsi(summaryLeft).length - stripAnsi(summaryRight).length;
	lines.push(`${B} ${summaryLeft}${' '.repeat(Math.max(1, sGap))}${summaryRight} ${B}`);
	lines.push(hrFull('└', '┘'));
	lines.push('');

	return lines.join('\n');
}

// ─── Smart Log Formatting ───────────────────────────────────────────────────

type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

interface ParsedLog {
	level: LogLevel;
	message: string;
	skip?: boolean;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
	TRACE: DIM,
	DEBUG: BLUE,
	INFO: GREEN,
	WARN: YELLOW,
	ERROR: RED,
	FATAL: BRIGHT_RED,
};

function pinoLevel(n: number | string): LogLevel {
	const v = typeof n === 'string' ? parseInt(n, 10) : n;
	if (v >= 60) return 'FATAL';
	if (v >= 50) return 'ERROR';
	if (v >= 40) return 'WARN';
	if (v >= 30) return 'INFO';
	if (v >= 20) return 'DEBUG';
	return 'TRACE';
}

function strLevel(s: string): LogLevel {
	const l = s.toLowerCase();
	if (l === 'fatal' || l === 'crit' || l === 'critical') return 'FATAL';
	if (l === 'error' || l === 'err') return 'ERROR';
	if (l === 'warn' || l === 'warning') return 'WARN';
	if (l === 'info' || l === 'notice' || l === 'log') return 'INFO';
	if (l === 'debug') return 'DEBUG';
	if (l === 'trace') return 'TRACE';
	return 'INFO';
}

function mongoSeverity(s: string): LogLevel {
	switch (s) {
		case 'F': return 'FATAL';
		case 'E': return 'ERROR';
		case 'W': return 'WARN';
		case 'D': case 'D1': case 'D2': case 'D3': case 'D4': case 'D5': return 'DEBUG';
		default: return 'INFO';
	}
}

function isHealthCheck(url: string): boolean {
	return /\/health\/(live|ready|startup)/.test(url);
}

// ── Format Parsers ──────────────────────────────────────────────────────────

function tryPino(raw: string): ParsedLog | null {
	try {
		const j = JSON.parse(raw) as Record<string, unknown>;
		if (typeof j['level'] !== 'number' || j['time'] == null) return null;

		const level = pinoLevel(j['level'] as number);
		const msg = String(j['msg'] ?? j['message'] ?? '');
