export interface Logger {
  info(message: string, ...parameters: unknown[]): void;
  warn(message: string, ...parameters: unknown[]): void;
  error(message: string, ...parameters: unknown[]): void;
  debug(message: string, ...parameters: unknown[]): void;
}

export interface MetricPoint {
  measurement: string;
  fields: Record<string, number>;
  tags: Record<string, string>;
  timestamp: Date;
}

export interface DatasourceWriter {
  connect(): Promise<void>;
  write(point: MetricPoint): Promise<void>;
  close(): Promise<void>;
}
