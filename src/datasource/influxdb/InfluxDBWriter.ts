import { DatasourceWriter, Logger, MetricPoint } from '../DatasourceInterface';

export interface InfluxDBConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
  measurement: string;
}

export class InfluxDBWriter implements DatasourceWriter {
  private log: Logger;
  private config: InfluxDBConfig;
  private writeUrl: string;

  constructor(config: InfluxDBConfig, log: Logger) {
    this.config = config;
    this.log = log;

    const base = config.url.replace(/\/+$/, '');
    this.writeUrl = `${base}/api/v2/write?org=${encodeURIComponent(config.org)}&bucket=${encodeURIComponent(config.bucket)}&precision=ms`;
  }

  async connect(): Promise<void> {
    this.log.info(`InfluxDB: verifying connection to ${this.config.url}`);

    const base = this.config.url.replace(/\/+$/, '');
    const healthUrl = `${base}/health`;

    try {
      const response = await fetch(healthUrl);
      if (response.status === 200 || response.status === 204) {
        this.log.info('InfluxDB: connection verified');
      } else {
        this.log.warn(`InfluxDB: health check returned ${response.status}, continuing anyway`);
      }
    } catch (error) {
      this.log.warn(`InfluxDB: health check failed (${error}), continuing anyway`);
    }
  }

  async write(point: MetricPoint): Promise<void> {
    const line = this.buildLineProtocol(point);
    this.log.debug(`InfluxDB write: ${line}`);

    const response = await fetch(this.writeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.config.token}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: line,
    });

    if (response.status === 204 || response.status === 200) {
      return;
    }

    const body = await response.text();
    throw new Error(`InfluxDB write failed (${response.status}): ${body}`);
  }

  private buildLineProtocol(point: MetricPoint): string {
    const measurement = this.escapeTag(point.measurement);

    const tagPairs = Object.entries(point.tags)
      .map(([k, v]) => `${this.escapeTag(k)}=${this.escapeTag(v)}`)
      .join(',');

    const fieldPairs = Object.entries(point.fields)
      .map(([k, v]) => `${this.escapeTag(k)}=${v}`)
      .join(',');

    const timestamp = point.timestamp.getTime();

    const tags = tagPairs ? `,${tagPairs}` : '';

    return `${measurement}${tags} ${fieldPairs} ${timestamp}`;
  }

  private escapeTag(value: string): string {
    return value.replace(/ /g, '\\ ').replace(/,/g, '\\,').replace(/=/g, '\\=');
  }

  async close(): Promise<void> {
    this.log.info('InfluxDB: connection closed (stateless)');
  }
}
