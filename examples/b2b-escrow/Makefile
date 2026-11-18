# External orchestration only: implementations never include or call this file.
.DEFAULT_GOAL := help
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
REPO := $(abspath $(ROOT)/../..)
IMPLEMENTATION ?= ts-fastify
IMPLEMENTATIONS := golang-gin java-spring python-fastapi ts-fastify
SERVER_golang-gin := gin
SERVER_java-spring := spring
SERVER_python-fastapi := fastapi
SERVER_ts-fastify := fastify
PORT ?= 8085
MODE ?= v2
FAULT ?= none
GATE ?= regression
BASELINE ?= $(ROOT)/model/b2b-escrow-v1.evidence.json
# Optional; must be a NEW directory. Otherwise the verifier uses a temp directory.
REPORT_DIR ?=
REPORT_FLAG = $(if $(REPORT_DIR),--report-dir "$(REPORT_DIR)",)

ifneq ($(words $(IMPLEMENTATION)),1)
$(error Select exactly one IMPLEMENTATION from $(IMPLEMENTATIONS))
endif
ifneq ($(filter $(IMPLEMENTATION),$(IMPLEMENTATIONS)),$(IMPLEMENTATION))
$(error Unknown IMPLEMENTATION '$(IMPLEMENTATION)'; choose $(IMPLEMENTATIONS))
endif

.PHONY: help framework check tools-test setup native-test build prepare up verify gate test test-all \
 setup-golang-gin setup-java-spring setup-python-fastapi setup-ts-fastify \
 test-golang-gin test-java-spring test-python-fastapi test-ts-fastify \
 build-golang-gin build-java-spring build-python-fastapi build-ts-fastify \
 up-gin up-spring up-fastapi up-fastify

help:
	@printf '%s\n' \
	 'B2B escrow: run from anywhere with make -C examples/b2b-escrow <target>' \
	 '  test          Install framework + selected implementation, test/build, verify 11 red/green cases' \
	 '  test-all      For all four implementations: native build/tests, Bruno conformance, strict gates' \
	 '  framework     Frozen pnpm install + build Evidence CLI (Node/pnpm only)' \
	 '  check         Scoped checks for both models + read-only export --verify' \
	 '  tools-test    Test external verification/orchestration (no language tools)' \
	 '  prepare       Selected implementation: install, native tests, build' \
	 '  setup | native-test | build   Run one selected native step' \
	 '  verify        Run built implementation through 11 demo cases; new process per case' \
	 '  gate          Strict Git-baseline gate: GATE=regression|dod BASELINE=/absolute/model.evidence.json' \
	 '  up            Run built selected service in foreground; Ctrl-C stops it' \
	 '  up-gin | up-spring | up-fastapi | up-fastify   Explicit foreground service' \
	 'Variables: IMPLEMENTATION=ts-fastify|golang-gin|java-spring|python-fastapi' \
	 '           PORT=8085 MODE=v2 FAULT=none REPORT_DIR=/new/report/directory' \
	 'Only test-all requires all four language toolchains. No Docker/Make dependency inside implementations.'

framework:
	cd "$(REPO)" && pnpm install --frozen-lockfile && pnpm exec nx build cli

check:
	cd "$(REPO)" && node apps/cli/dist/cli.js check "$(ROOT)/model/b2b-escrow-v1.evidence.json" --scope context.procurement --scope context.escrow --scope context.fulfillment --scope context.settlement
	cd "$(REPO)" && node apps/cli/dist/cli.js check "$(ROOT)/model/b2b-escrow.evidence.json" --scope context.procurement --scope context.escrow --scope context.fulfillment --scope context.settlement
	cd "$(REPO)" && node apps/cli/dist/cli.js export --model "$(ROOT)/model/b2b-escrow.evidence.json" --out "$(ROOT)/generated" --verify

tools-test:
	node --test "$(ROOT)"/verification/*.test.mjs

setup:
	$(MAKE) -C "$(ROOT)" setup-$(IMPLEMENTATION)
native-test:
	$(MAKE) -C "$(ROOT)" test-$(IMPLEMENTATION)
build:
	$(MAKE) -C "$(ROOT)" build-$(IMPLEMENTATION)

# Recipes, not parallel prerequisites: safe even under make -j.
prepare:
	$(MAKE) -C "$(ROOT)" setup
	$(MAKE) -C "$(ROOT)" native-test
	$(MAKE) -C "$(ROOT)" build

setup-golang-gin:
	cd "$(ROOT)/implementations/golang-gin" && go mod download
setup-java-spring:
	cd "$(ROOT)/implementations/java-spring" && ./mvnw -B dependency:go-offline
setup-python-fastapi:
	cd "$(ROOT)/implementations/python-fastapi" && uv sync --frozen --python 3.12
setup-ts-fastify:
	cd "$(ROOT)/implementations/ts-fastify" && pnpm install --frozen-lockfile

test-golang-gin:
	cd "$(ROOT)/implementations/golang-gin" && go test -race ./... && go vet ./...
test-java-spring:
	cd "$(ROOT)/implementations/java-spring" && ./mvnw -B verify
test-python-fastapi:
	cd "$(ROOT)/implementations/python-fastapi" && uv run --frozen pytest -q && uv run --frozen ruff check app tests && uv run --frozen ruff format --check app tests
test-ts-fastify:
	cd "$(ROOT)/implementations/ts-fastify" && pnpm test

build-golang-gin:
	cd "$(ROOT)/implementations/golang-gin" && go build -o build/escrow ./cmd/server
build-java-spring:
	cd "$(ROOT)/implementations/java-spring" && ./mvnw -B -DskipTests package
build-python-fastapi:
	cd "$(ROOT)/implementations/python-fastapi" && uv run --frozen python -c 'import app.main'
build-ts-fastify:
	cd "$(ROOT)/implementations/ts-fastify" && pnpm build

up:
	$(MAKE) -C "$(ROOT)" up-$(SERVER_$(IMPLEMENTATION))
up-gin:
	cd "$(ROOT)/implementations/golang-gin" && exec ./build/escrow --test-mode --port "$(PORT)" --mode "$(MODE)" --fault "$(FAULT)"
up-spring:
	cd "$(ROOT)/implementations/java-spring" && exec "$(if $(JAVA_HOME),$(JAVA_HOME)/bin/java,java)" -jar target/escrow-0.1.0.jar --test-mode --port "$(PORT)" --mode "$(MODE)" --fault "$(FAULT)"
up-fastapi:
	cd "$(ROOT)/implementations/python-fastapi" && exec .venv/bin/python -m app.main --test-mode --port "$(PORT)" --mode "$(MODE)" --fault "$(FAULT)"
up-fastify:
	cd "$(ROOT)/implementations/ts-fastify" && exec node dist/server.js --test-mode --port "$(PORT)" --mode "$(MODE)" --fault "$(FAULT)"

verify:
	node "$(ROOT)/verification/run.mjs" --implementation "$(IMPLEMENTATION)" $(REPORT_FLAG)
gate:
	node "$(ROOT)/verification/run.mjs" --implementation "$(IMPLEMENTATION)" --gate "$(GATE)" --baseline-model "$(BASELINE)" $(REPORT_FLAG)

test:
	$(MAKE) -C "$(ROOT)" framework
	$(MAKE) -C "$(ROOT)" check
	$(MAKE) -C "$(ROOT)" tools-test
	$(MAKE) -C "$(ROOT)" prepare
	$(MAKE) -C "$(ROOT)" verify

test-all:
	$(if $(REPORT_DIR),mkdir "$(REPORT_DIR)" $(foreach impl,$(IMPLEMENTATIONS),"$(REPORT_DIR)/$(impl)"),@:)
	$(MAKE) -C "$(ROOT)" framework
	$(MAKE) -C "$(ROOT)" check
	$(MAKE) -C "$(ROOT)" tools-test
	@set -eu; for impl in $(IMPLEMENTATIONS); do \
	  $(MAKE) -C "$(ROOT)" prepare IMPLEMENTATION=$$impl; \
	  $(MAKE) -C "$(ROOT)" verify IMPLEMENTATION=$$impl $(if $(REPORT_DIR),REPORT_DIR="$(REPORT_DIR)/$$impl/conformance",); \
	  for gate in regression dod; do \
	    $(MAKE) -C "$(ROOT)" gate IMPLEMENTATION=$$impl GATE=$$gate $(if $(REPORT_DIR),REPORT_DIR="$(REPORT_DIR)/$$impl/$$gate",); \
	  done; \
	done
