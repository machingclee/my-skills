# Run from this directory: make info-local, make migrate-dev, ...
# `make` on its own lists the targets.
#
# AGENT: one schema → targets are `<goal>-<env>` (info-local, migrate-dev, ...).
#        two or more schemas → targets are `<goal>-<env>-<schema>`
#        (info-local-billing, migrate-dev-orders, ...) so schemas never collide.
#        Expand .PHONY, the help table, and one recipe per schema × env × goal.
#        Goals in the Makefile: baseline, info, migrate.
#        validate and repair stay off the Makefile — type them by hand.

.PHONY: help \
{{PHONY}}

help:
{{HELP_ECHOES}}

{{RECIPES}}
