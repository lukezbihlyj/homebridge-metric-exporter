import { Client, ClientConfig } from 'pg';

import { DatasourceWriter, Logger, MetricPoint } from '../DatasourceInterface';

export interface PostgreSQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  table: string;
}

export class PostgreSQLWriter implements DatasourceWriter {
  private log: Logger;
  private config: PostgreSQLConfig;
  private client: Client | null = null;
  private tableEnsured = false;

  constructor(config: PostgreSQLConfig, log: Logger) {
    this.config = config;
    this.log = log;
  }

  async connect(): Promise<void> {
    this.log.info(`PostgreSQL: connecting to ${this.config.host}:${this.config.port}/${this.config.database}`);

    const clientConfig: ClientConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
    };

    this.client = new Client(clientConfig);

    try {
      await this.client.connect();
      this.log.info('PostgreSQL: connected');
    } catch (error) {
      this.log.error(`PostgreSQL: connection failed: ${error}`);
      this.client = null;
      throw error;
    }
  }

  private async ensureTable(): Promise<void> {
    if (this.tableEnsured || !this.client) {
      return;
    }

    const table = this.escapeIdentifier(this.config.table);

    const createSql = `
      CREATE TABLE IF NOT EXISTS ${table} (
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        measurement TEXT NOT NULL,
        accessory TEXT NOT NULL,
        accessory_id TEXT NOT NULL,
        field TEXT NOT NULL,
        value DOUBLE PRECISION NOT NULL,
        tags JSONB DEFAULT '{}'
      );
    `;

    try {
      await this.client.query(createSql);
      this.log.info(`PostgreSQL: ensured table "${this.config.table}" exists`);
      this.tableEnsured = true;
    } catch (error) {
      this.log.error(`PostgreSQL: failed to create table: ${error}`);
      throw error;
    }
  }

  async write(point: MetricPoint): Promise<void> {
    if (!this.client) {
      throw new Error('PostgreSQL: not connected');
    }

    await this.ensureTable();

    const table = this.escapeIdentifier(this.config.table);

    for (const [fieldKey, fieldValue] of Object.entries(point.fields)) {
      const tags = { ...point.tags };
      const accessoryId = tags.accessory_id || '';
      delete tags.accessory;
      delete tags.accessory_id;

      const sql = `
        INSERT INTO ${table} (timestamp, measurement, accessory, accessory_id, field, value, tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      const values = [
        point.timestamp.toISOString(),
        point.measurement,
        point.tags.accessory || 'unknown',
        accessoryId,
        fieldKey,
        fieldValue,
        JSON.stringify(tags),
      ];

      this.log.debug(`PostgreSQL write: ${sql.trim()} [${values.join(', ')}]`);

      try {
        await this.client.query(sql, values);
      } catch (error) {
        this.log.error(`PostgreSQL write error: ${error}`);
        throw error;
      }
    }
  }

  private escapeIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  async close(): Promise<void> {
    if (this.client) {
      this.log.info('PostgreSQL: closing connection');
      await this.client.end();
      this.client = null;
    }
  }
}
