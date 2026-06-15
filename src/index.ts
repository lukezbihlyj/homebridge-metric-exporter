import { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { GrafanaExporterPlatform } from './platform';

export = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, GrafanaExporterPlatform);
};
