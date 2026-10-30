## Libraries and CLIs

Keep public package boundaries explicit. After changing a CLI, build it and verify the installed command resolves to the intended local build. Update and validate public API/command documentation when behavior changes. Use the project's actual build, link and documentation tasks; do not assume tasks that have not been configured.
