import { baseOptions as presetBaseOptions } from '@mp-lb/tools-fumadocs-preset';
import { appName, gitConfig } from './shared';

export function baseOptions() {
  return presetBaseOptions({ appName, gitConfig });
}
