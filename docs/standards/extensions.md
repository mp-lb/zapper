# Extensions

Extensions are blueprints for adding capabilities like auth, databases, and queues to the base template.

Extension docs should be abstract. No project-specific references. Include all config glue (env files, `zap.yaml`, `env-map.yaml`, Terraform, deploy workflow) so extensions work out of the box. Use `helloworld` if an example name is needed.

## After Adding an Extension

Each extension introduces environment variables. After adding an extension:

1. Update [env-vars.md](env-vars.md) - Add new variables to the registry table
2. Update the deployment runbook - Add any secrets to the secrets table

Extension docs include a summary table of their environment variables to make this easy.
