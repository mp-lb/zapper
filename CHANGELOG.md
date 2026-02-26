# @maplab/zapper

## 0.13.0

### Minor Changes

- 3483d6a: Limit PM2 restart attempts for faster feedback in local development
  - Configure PM2 with max_restarts: 2 instead of unlimited retries
  - Set min_uptime: 4000ms so processes must stay up 4 seconds to count as successful
  - Provides faster feedback when processes are crashing instead of showing them as perpetually "up"
  - Updated documentation to reflect the new restart behavior

## 0.12.1

### Patch Changes

- 129be80: fix link interpolation

## 0.12.0

### Minor Changes

- 9492067: links section
- a6f7964: link field and healthchecks

## 0.11.1

### Patch Changes

- d6dfe5b: path freezing

## 0.11.0

### Minor Changes

- 3eff379: fixes

## 0.10.1

### Patch Changes

- Fix wrapper script lifecycle: Scripts are now kept for PM2 restarts and cleaned up when processes are stopped/deleted

## 0.10.0

### Minor Changes

- eec7116: Heaps of new features

## 0.9.2

### Patch Changes

- d6313b8: optional env

## 0.9.2

### Patch Changes

- 2d5635b: Fix start all command

## 0.9.1

### Patch Changes

- ef650f4: Fix profile state updates

## 0.9.0

### Minor Changes

- 6edbd25: Profile disabling

## 0.8.0

### Minor Changes

- 2b3ca78: Profiles implementation

## 0.7.0

### Minor Changes

- config cmds

## 0.6.0

### Minor Changes

- 3ebd608: task list

## 0.5.0

### Minor Changes

- 2c9e7d1: add json status output

## 0.4.0

### Minor Changes

- 38c044e: git method options

## 0.3.0

### Minor Changes

- 420d9a3: added whitelists section

## 0.2.1

### Patch Changes

- 9f3ecaa: fix tests
- 8440f9b: fixes

## 0.2.0

### Minor Changes

- f78ca39: Improvements
- b5994a8: cwd for tasks
- 99da989: env override and docker
- 273eb34: tasks

### Patch Changes

- 635b06b: log spacing

## 0.1.0

### Minor Changes

- fb8e9b2: basic bare metal functionality

## 0.0.2

### Patch Changes

- 49a937e: setup project
