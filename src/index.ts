import { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { MetricExporterPlatform } from './platform';

export = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, MetricExporterPlatform);
};
