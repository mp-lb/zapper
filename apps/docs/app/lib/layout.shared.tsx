import { baseOptions as presetBaseOptions } from '@mp-lb/fumadocs-preset';
import { appName, gitConfig } from './shared';

export function baseOptions() {
  return presetBaseOptions({ appName, gitConfig });
}
