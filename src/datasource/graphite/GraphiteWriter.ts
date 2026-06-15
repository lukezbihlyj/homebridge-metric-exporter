import { Socket } from 'net';

import { DatasourceWriter, Logger, MetricPoint } from '../DatasourceInterface';

export interface GraphiteConfig {
  host: string;
  port: number;
  prefix: string;
}

export class GraphiteWriter implements DatasourceWriter {
  private socket: Socket | null = null;
  private log: Logger;
  private config: GraphiteConfig;

  constructor(config: GraphiteConfig, log: Logger) {
    this.config = config;
    this.log = log;
  }

  async connect(): Promise<void> {
    this.log.info(`Connecting to Graphite at ${this.config.host}:${this.config.port}`);
    this.socket = new Socket();

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Socket not created'));
      }

      this.socket.on('error', (err) => {
        this.log.error(`Graphite socket error: ${err.message}`);
        reject(err);
      });

      this.socket.connect(this.config.port, this.config.host, () => {
        this.log.info('Connected to Graphite');
        resolve();
      });
    });
  }

  async write(point: MetricPoint): Promise<void> {
    if (!this.socket || this.socket.destroyed) {
      this.log.warn('Graphite socket not connected, attempting reconnect');
      await this.connect();
    }

    const prefix = this.config.prefix;
    const timestamp = Math.floor(point.timestamp.getTime() / 1000);

    for (const [fieldKey, fieldValue] of Object.entries(point.fields)) {
      const tagParts = [prefix, point.measurement, fieldKey];

      const extraTags = Object.entries(point.tags)
        .filter(([k]) => k !== 'accessory')
        .map(([, v]) => v);

      if (point.tags.accessory) {
        tagParts.splice(2, 0, point.tags.accessory);
      }

      const metricPath = [...tagParts, ...extraTags].join('.');
      const line = `${metricPath} ${fieldValue} ${timestamp}\n`;

      this.log.debug(`Graphite write: ${line.trim()}`);

      return new Promise((resolve, reject) => {
        if (!this.socket) {
          return reject(new Error('Socket not available'));
        }
        this.socket.write(line, (err) => {
          if (err) {
            this.log.error(`Graphite write error: ${err.message}`);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
  }

  async close(): Promise<void> {
    if (this.socket) {
      this.log.info('Closing Graphite connection');
      this.socket.destroy();
      this.socket = null;
    }
  }
}
