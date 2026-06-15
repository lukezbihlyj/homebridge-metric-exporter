import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
  UnknownContext,
} from 'homebridge';

import { HapClient, ServiceType } from '@homebridge/hap-client';

import {
  DatasourceWriter,
  MetricPoint,
  InfluxDBWriter,
  GraphiteWriter,
  PostgreSQLWriter,
} from './datasource';

export type DatasourceType = 'influxdb' | 'graphite' | 'postgresql';

const CHARACTERISTIC_MAP: Record<string, string> = {
  'Current Temperature': 'temperature',
  'Current Relative Humidity': 'humidity',
  'Current Heating Cooling State': 'heating_cooling_state',
  'Target Temperature': 'target_temperature',
  'Target Heating Cooling State': 'target_heating_cooling_state',
  'Temperature Display Units': 'temperature_display_units',
  'Heating Threshold Temperature': 'heating_threshold',
  'Cooling Threshold Temperature': 'cooling_threshold',
  'Current Door State': 'door_state',
  'Battery Level': 'battery_level',
  'Air Quality': 'air_quality',
  'PM2_5 Density': 'pm25_density',
  'PM10 Density': 'pm10_density',
  'VOC Density': 'voc_density',
  'Carbon Dioxide Level': 'co2_level',
  'Current Ambient Light Level': 'light_level',
  'Contact Sensor State': 'contact_state',
  'Motion Detected': 'motion_detected',
  'On': 'on',
};

export class MetricExporterPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory<UnknownContext>[] = [];

  private datasourceType: DatasourceType;
  private writer: DatasourceWriter | null = null;
  private accessoryNames: Set<string> = new Set();
  private pollInterval: number;
  private debug: boolean;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private hapClient: HapClient | null = null;
  private discoveredServiceNames: Set<string> = new Set();
  private hapReady = false;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.datasourceType = (config.datasourceType as DatasourceType) || 'influxdb';
    const names = config.accessories as string[] || [];
    this.accessoryNames = new Set(names);
    this.pollInterval = config.pollInterval || 10;
    this.debug = config.debugmode || false;

    if (this.accessoryNames.size === 0) {
      this.log.info('No accessories filter configured — all discovered accessories will be exported.');
    }

    this.log.info(`Initializing Metric Exporter (datasource: ${this.datasourceType}, accessories: ${this.accessoryNames.size})`);

    this.api.on('didFinishLaunching', async () => {
      this.log.debug('Executed didFinishLaunching callback');
      await this.initializeDatasource();
      await this.initializeHapClient();
      this.startPolling();
    });
  }

  configureAccessory(accessory: PlatformAccessory<UnknownContext>): void {
    this.accessories.push(accessory);
  }

  private async initializeHapClient(): Promise<void> {
    const pin = this.config.pin || '031-45-154';

    const hapLogger = {
      info: (msg: string) => this.log.debug(`[HAP Client] ${msg}`),
      warn: (msg: string) => this.log.warn(`[HAP Client] ${msg}`),
      error: (msg: string) => this.log.error(`[HAP Client] ${msg}`),
      debug: (msg: string) => this.log.debug(`[HAP Client] ${msg}`),
    };

    this.hapClient = new HapClient({
      pin,
      logger: hapLogger,
      config: {
        debug: this.debug,
        autoStartDiscovery: false,
      },
    });

    try {
      this.log.info('Discovering Homebridge instances via HAP...');
      this.hapClient.startDiscovery(15);

      await new Promise<void>((resolve) => {
        const checkReady = setInterval(() => {
          const instances = (this.hapClient as any).instances;
          if (instances && instances.length > 0) {
            clearInterval(checkReady);
            resolve();
          }
        }, 500);

        setTimeout(() => {
          clearInterval(checkReady);
          resolve();
        }, 16000);
      });

      const instances = (this.hapClient as any).instances || [];
      this.hapReady = instances.length > 0;
      this.log.info(`HAP client ready, discovered ${instances.length} instance(s)`);

      this.hapClient.on('instance-discovered', () => {
        this.log.info('New Homebridge instance discovered');
        if (!this.hapReady) {
          this.hapReady = true;
          this.logDiscoveredAccessories();
        }
      });

      this.logDiscoveredAccessories();
    } catch (error) {
      this.log.error(`HAP client discovery failed: ${error}`);
      this.hapClient = null;
    }
  }

  private async logDiscoveredAccessories(): Promise<void> {
    if (!this.hapClient) {
      return;
    }

    try {
      const services = await this.hapClient.getAllServices();
      const accessoryNames = new Set<string>();

      for (const service of services) {
        if (service.type === '0000003E-0000-1000-8000-0026BB765291') {
          continue;
        }

        const name = service.serviceName
          || service.accessoryInformation?.Name
          || 'Unknown';

        if (name && name !== 'Unknown') {
          accessoryNames.add(name);
        }
      }

      this.discoveredServiceNames = accessoryNames;
      this.log.info(`Discovered ${accessoryNames.size} accessory name(s): ${[...accessoryNames].join(', ')}`);
    } catch (error) {
      this.log.error(`Failed to list discovered accessories: ${error}`);
    }
  }

  private async initializeDatasource(): Promise<void> {
    try {
      this.writer = this.createWriter();
      await this.writer.connect();
      this.log.info('Data source connected successfully');
    } catch (error) {
      this.log.error(`Failed to connect to data source: ${error}`);
      this.writer = null;
    }
  }

  private createWriter(): DatasourceWriter {
    switch (this.datasourceType) {
      case 'influxdb': {
        const cfg = this.config.influxdb || {};
        return new InfluxDBWriter({
          url: cfg.url || 'http://localhost:8086',
          token: cfg.token || '',
          org: cfg.org || 'homebridge',
          bucket: cfg.bucket || 'homebridge',
          measurement: cfg.measurement || 'homebridge',
        }, this.log);
      }
      case 'graphite': {
        const cfg = this.config.graphite || {};
        return new GraphiteWriter({
          host: cfg.host || 'localhost',
          port: cfg.port || 2003,
          prefix: cfg.prefix || 'homebridge',
        }, this.log);
      }
      case 'postgresql': {
        const cfg = this.config.postgresql || {};
        return new PostgreSQLWriter({
          host: cfg.host || 'localhost',
          port: cfg.port || 5432,
          database: cfg.database || 'homebridge',
          user: cfg.user || '',
          password: cfg.password || '',
          table: cfg.table || 'homebridge_metrics',
        }, this.log);
      }
      default:
        throw new Error(`Unknown datasource type: ${this.datasourceType}`);
    }
  }

  private startPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    this.log.info(`Starting metric export (interval: ${this.pollInterval}s)`);

    this.pollTimer = setInterval(() => {
      this.exportMetrics().catch(error => {
        this.log.error(`Metric export error: ${error}`);
      });
    }, this.pollInterval * 1000);

    this.exportMetrics().catch(error => {
      this.log.error(`Initial metric export error: ${error}`);
    });
  }

  private async exportMetrics(): Promise<void> {
    if (!this.writer) {
      this.log.debug('No data source writer available, skipping export');
      return;
    }

    if (!this.hapClient || !this.hapReady) {
      this.log.debug('HAP client not ready, skipping export');
      return;
    }

    let services: ServiceType[];
    try {
      services = await this.hapClient.getAllServices();
    } catch (error) {
      this.log.error(`Failed to get services from HAP client: ${error}`);
      return;
    }

    const accessoryServices = new Map<string, { services: ServiceType[]; instanceUsername: string; aid: number }>();

    for (const service of services) {
      if (service.type === '0000003E-0000-1000-8000-0026BB765291') {
        continue;
      }

      const name = service.serviceName
        || service.accessoryInformation?.Name
        || 'Unknown';

      if (!accessoryServices.has(name)) {
        accessoryServices.set(name, {
          services: [],
          instanceUsername: service.instance?.username || '',
          aid: service.aid,
        });
      }
      accessoryServices.get(name)!.services.push(service);
    }

    const now = new Date();
    let exported = 0;

    for (const [name, entry] of accessoryServices) {
      if (this.accessoryNames.size > 0 && !this.accessoryNames.has(name)) {
        continue;
      }

      const fields = this.extractFields(entry.services);

      if (Object.keys(fields).length === 0) {
        this.log.debug(`No exportable characteristics found for "${name}"`);
        continue;
      }

      const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const accessoryId = `${entry.instanceUsername}_${entry.aid}`.replace(/[^a-zA-Z0-9_]/g, '_');

      const point: MetricPoint = {
        measurement: 'homebridge',
        fields,
        tags: {
          accessory: sanitizedName,
          accessory_id: accessoryId,
        },
        timestamp: now,
      };

      try {
        await this.writer.write(point);
        exported++;
        this.log.debug(`Exported ${Object.keys(fields).length} metric(s) for "${name}"`);
      } catch (error) {
        this.log.error(`Failed to write metrics for "${name}": ${error}`);
      }
    }

    if (exported === 0 && this.accessoryNames.size > 0) {
      this.log.warn(
        `No matching accessories found. Discovered: ${[...accessoryServices.keys()].join(', ')}`,
      );
    }
  }

  private extractFields(services: ServiceType[]): Record<string, number> {
    const fields: Record<string, number> = {};

    for (const service of services) {
      for (const characteristic of service.serviceCharacteristics || []) {
        const charName = characteristic.description;
        const fieldName = CHARACTERISTIC_MAP[charName];

        if (!fieldName) {
          continue;
        }

        if (!characteristic.canRead) {
          continue;
        }

        const value = characteristic.value;
        if (value !== undefined && value !== null && typeof value === 'number') {
          fields[fieldName] = value;
        } else if (value !== undefined && value !== null && typeof value === 'boolean') {
          fields[fieldName] = value ? 1 : 0;
        }
      }
    }

    return fields;
  }
}
