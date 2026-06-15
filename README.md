# Homebridge Grafana Exporter

A [Homebridge](https://homebridge.io) plugin that exports accessory data (temperature, humidity, and more) to Grafana-compatible data sources. Perfect for visualizing your thermostat and sensor data in Grafana dashboards.

## Supported Data Sources

| Data Source | Protocol | Dependencies |
|-------------|----------|--------------|
| InfluxDB v2 | HTTP API (line protocol) | None (fetch) |
| Graphite | Plaintext TCP | None (net) |
| PostgreSQL | Native wire protocol | `pg` |

## Features

- Export temperature, humidity, and other numeric characteristics from any Homebridge accessory
- Config-based allow list — choose exactly which accessories to export
- Automatic characteristic detection — reads any numeric characteristic available on the accessory
- Supports InfluxDB v2, Graphite, and PostgreSQL as data sources
- Configurable poll interval
- Runs as a dynamic platform plugin (no accessories created)

## Installation

### Via Homebridge UI (Recommended)

1. Search for `homebridge-grafana-exporter` in the Homebridge UI plugin search
2. Click Install
3. Configure your data source and accessory list

### Via Command Line

```bash
npm install -g homebridge-grafana-exporter
```

## Configuration

Add the platform to your Homebridge `config.json`:

### InfluxDB v2

```json
{
  "platforms": [
    {
      "platform": "GrafanaExporter",
      "name": "Grafana Exporter",
      "datasourceType": "influxdb",
      "influxdb": {
        "url": "http://localhost:8086",
        "token": "your-api-token",
        "org": "homebridge",
        "bucket": "homebridge",
        "measurement": "homebridge"
      },
      "accessories": [
        { "name": "Living Room Thermostat" },
        { "name": "Bedroom Sensor" }
      ],
      "pollInterval": 10
    }
  ]
}
```

### Graphite

```json
{
  "platforms": [
    {
      "platform": "GrafanaExporter",
      "name": "Grafana Exporter",
      "datasourceType": "graphite",
      "graphite": {
        "host": "localhost",
        "port": 2003,
        "prefix": "homebridge"
      },
      "accessories": [
        { "name": "Living Room Thermostat" }
      ],
      "pollInterval": 10
    }
  ]
}
```

### PostgreSQL

```json
{
  "platforms": [
    {
      "platform": "GrafanaExporter",
      "name": "Grafana Exporter",
      "datasourceType": "postgresql",
      "postgresql": {
        "host": "localhost",
        "port": 5432,
        "database": "homebridge",
        "user": "homebridge",
        "password": "your-password",
        "table": "homebridge_metrics"
      },
      "accessories": [
        { "name": "Living Room Thermostat" }
      ],
      "pollInterval": 10
    }
  ]
}
```

### Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `datasourceType` | Yes | "influxdb" | Data source: "influxdb", "graphite", or "postgresql" |
| `accessories` | Yes | - | Array of objects with `name` property matching accessory display names |
| `name` | No | "Grafana Exporter" | Platform name shown in logs |
| `pollInterval` | No | 10 | How often to read and export values (seconds) |
| `debugmode` | No | false | Enable debug logging |

### Data Source Options

#### InfluxDB

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `url` | Yes | http://localhost:8086 | InfluxDB v2 API URL |
| `token` | Yes | - | API token with write access |
| `org` | Yes | "homebridge" | Organization name |
| `bucket` | Yes | "homebridge" | Bucket to write to |
| `measurement` | No | "homebridge" | Measurement name |

#### Graphite

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `host` | Yes | "localhost" | Graphite server hostname |
| `port` | Yes | 2003 | Plaintext protocol port |
| `prefix` | No | "homebridge" | Metric path prefix |

#### PostgreSQL

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `host` | Yes | "localhost" | PostgreSQL server hostname |
| `port` | No | 5432 | PostgreSQL server port |
| `database` | Yes | "homebridge" | Database name |
| `user` | Yes | - | Username with INSERT permissions |
| `password` | Yes | - | User password |
| `table` | No | "homebridge_metrics" | Table name (auto-created) |

## Exported Metrics

The plugin automatically reads numeric and boolean characteristics from matched accessories. Common exported fields:

| Characteristic | Field Name | Type |
|---------------|------------|------|
| Current Temperature | `temperature` | Number (Celsius) |
| Current Relative Humidity | `humidity` | Number (%) |
| Current Heating/Cooling State | `heating_cooling_state` | Number (0=off, 1=heat, 2=cool, 3=auto) |
| Target Temperature | `target_temperature` | Number (Celsius) |
| Battery Level | `battery_level` | Number (%) |
| Air Quality | `air_quality` | Number |
| Current Ambient Light Level | `light_level` | Number (lux) |
| Motion Detected | `motion_detected` | Number (0/1) |
| On (switches/outlets) | `on` | Number (0/1) |

Each data point is tagged with the accessory name for easy filtering in Grafana.

## Running as a Child Bridge

It is recommended to run this plugin as a [child bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) for better stability and isolation.

## License

Apache-2.0

## Feedback & Issues

Please submit any issues or feature requests to the [GitHub Issues](https://github.com/lukezbihlyj/homebridge-grafana-exporter/issues) page.
