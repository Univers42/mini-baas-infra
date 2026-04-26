import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryMetricsService } from './query.metrics';

export class CircuitBreakerOpenError extends ServiceUnavailableException {
  constructor(circuit: string) {
    super(`Circuit breaker open for ${circuit}`);
  }
}

type CircuitState = 'closed' | 'open' | 'half_open';
type CircuitEvent = 'success' | 'failure' | 'opened' | 'half_opened' | 'closed' | 'rejected';

interface CircuitRuntimeState {
  state: CircuitState;
  failures: number;
  successes: number;
  openedAt: number;
}

@Injectable()
export class CircuitBreakerRegistry {
  private readonly states = new Map<string, CircuitRuntimeState>();
  private readonly enabled: boolean;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly openMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: QueryMetricsService,
  ) {
    this.enabled = this.booleanConfig('QUERY_ROUTER_CIRCUIT_BREAKER_ENABLED', true);
    this.failureThreshold = this.numberConfig('QUERY_ROUTER_CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5);
    this.successThreshold = this.numberConfig('QUERY_ROUTER_CIRCUIT_BREAKER_SUCCESS_THRESHOLD', 2);
    this.openMs = this.numberConfig('QUERY_ROUTER_CIRCUIT_BREAKER_OPEN_MS', 10_000);
  }

  async execute<T>(circuit: string, operation: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      return operation();
    }

    const state = this.getState(circuit);
    if (state.state === 'open') {
      if (Date.now() - state.openedAt < this.openMs) {
        this.record(circuit, 'rejected');
        throw new CircuitBreakerOpenError(circuit);
      }

      state.state = 'half_open';
      state.successes = 0;
      this.record(circuit, 'half_opened');
    }

    try {
      const result = await operation();
      this.onSuccess(circuit, state);
      return result;
    } catch (error) {
      this.onFailure(circuit, state);
      throw error;
    }
  }

  private getState(circuit: string): CircuitRuntimeState {
    const current = this.states.get(circuit);
    if (current) return current;

    const next: CircuitRuntimeState = {
      state: 'closed',
      failures: 0,
      successes: 0,
      openedAt: 0,
    };
    this.states.set(circuit, next);
    return next;
  }

  private onSuccess(circuit: string, state: CircuitRuntimeState): void {
    state.failures = 0;
    this.record(circuit, 'success');

    if (state.state !== 'half_open') return;

    state.successes += 1;
    if (state.successes >= this.successThreshold) {
      state.state = 'closed';
      state.successes = 0;
      this.record(circuit, 'closed');
    }
  }

  private onFailure(circuit: string, state: CircuitRuntimeState): void {
    state.successes = 0;
    state.failures += 1;
    this.record(circuit, 'failure');

    if (state.state === 'half_open' || state.failures >= this.failureThreshold) {
      state.state = 'open';
      state.openedAt = Date.now();
      this.record(circuit, 'opened');
    }
  }

  private record(circuit: string, event: CircuitEvent): void {
    this.metrics.recordCircuitBreaker(circuit, event);
  }

  private numberConfig(key: string, fallback: number): number {
    const value = this.config.get<string | number>(key, fallback);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private booleanConfig(key: string, fallback: boolean): boolean {
    const value = this.config.get<string | boolean>(key, fallback);
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
}
