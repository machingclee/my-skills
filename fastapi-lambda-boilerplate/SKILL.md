---
name: fastapi-lambda-boilerplate
description: >-
  Scaffold a Python backend that runs FastAPI locally on uvicorn and deploys to
  AWS Lambda behind an HTTP API Gateway. Uses uv for Python dependencies
  (pyproject.toml compiled to requirements.txt) and the Serverless Framework
  (npm `serverless` v3.38.0 + `serverless-python-requirements`) to build and
  deploy; Mangum adapts the ASGI app for Lambda. Use when the user wants to
  create, scaffold, replicate, or clone this FastAPI-on-Lambda architecture,
  deploy a FastAPI app to AWS Lambda via Serverless, set up uv + Serverless +
  Mangum for a Python serverless API, or add a new FastAPI route to an existing
  project that follows this pattern.
---

# FastAPI on AWS Lambda (uv + Serverless Framework)

A Python API that runs as a normal FastAPI app locally, and deploys as a single
AWS Lambda function behind an HTTP API Gateway. No AI/RAG/vector code — pure
HTTP plumbing you drop your own domain logic into.

## Architecture

```
                local dev                       AWS
        ┌───────────────────┐         ┌──────────────────────────────┐
   you ─▶ python main.py              │  HTTP API Gateway  /{proxy+}  │
        │ uvicorn reloads             │           │  (catch-all)      │
        │ app:app (FastAPI ASGI)      │           ▼                   │
        └───────────────────┘         │  Lambda  handler.handler      │
                                      │           │  Mangum adapter   │
                                      │           ▼                   │
                                      │        app:app  (same FastAPI)│
                                      └──────────────────────────────┘
```

Three Python entry points — know which is which:

| File        | Role                                            | Runs where        |
|-------------|-------------------------------------------------|-------------------|
| `app.py`    | The FastAPI app. Routes, CORS, responses.       | **everywhere**    |
| `main.py`   | Local dev entry: `uvicorn.run("app:app")`.      | local only        |
| `handler.py`| Lambda entry: `Mangum(app)` adapts ASGI→Lambda. | Lambda only       |

There is exactly **one** Lambda function. The API Gateway rule `path: /{proxy+}`
`method: ANY` forwards *every* request to it, and Mangum dispatches to the
matching FastAPI route. Add routes in `app.py`; nothing else changes to deploy.

## The dependency pipeline (the key mental model)

```
pyproject.toml  ──(npm run pip)──▶  requirements.txt  ──(serverless deploy)──▶  Lambda
   uv source          uv pip compile       locked, pinned           python-requirements
    of truth                                  wheels               installs in Docker
```

`pyproject.toml` is the source of truth (managed by uv). `requirements.txt` is
**generated**, not hand-edited, and is what the Serverless plugin installs at
deploy time. So the loop when changing dependencies is always:

1. edit `pyproject.toml`
2. `npm run pip` → regenerates `requirements.txt`
3. install locally + deploy

## Scaffold a new project

Copy the files from this skill's `templates/` directory into a new (or existing)
project folder, then replace the `# TODO` placeholders and run the setup
commands.

```bash
mkdir my-api && cd my-api

# 1. Copy each template into the project root (flatten the templates/ prefix)
#    serverless.yml handler.py main.py app.py pyproject.toml
#    package.json .env.sample .gitignore

# 2. Install JS tooling (Serverless + cross-env + the requirements plugin)
npm install

# 3. Create a Python 3.12 venv and install deps
uv venv --python 3.12
source .venv/bin/activate
npm run pip                              # pyproject.toml -> requirements.txt
uv pip install -r requirements.txt

# 4. Configure env
cp .env.sample .env                      # then edit values

# 5. Run locally
python main.py                           # http://127.0.0.1:8000
```

## Replace the `# TODO` placeholders

- `serverless.yml` → `service:` name, `region:`, and any extra `package.include`
- `pyproject.toml` → `name =`
- `package.json` → `"name"`
- `app.py` → CORS `allow_origins` list (your frontend origin(s))
- `.env` → `APP_NAME` (and your own keys)

## Local dev & deploy

```bash
python main.py        # local server with hot reload (uvicorn)
npm run package       # build the deployment artifact locally (dry run, needs Docker)
npm run deploy        # build + deploy to AWS (needs Docker Desktop running)
```

`deploy` and `package` set `DOCKER_DEFAULT_PLATFORM=linux/amd64` via `cross-env`
so the requirements plugin builds x86_64 Linux wheels even on Apple Silicon.

## Adding a Python dependency

```bash
# 1. add "package>=x.y" under [project] dependencies in pyproject.toml
# 2. npm run pip                         # recompile requirements.txt
# 3. uv pip install -r requirements.txt  # install locally
# 4. npm run deploy                      # ship to Lambda
```

## Template files

- `templates/serverless.yml` — provider config, the single Lambda + catch-all
  HTTP API event, packaging rules, and the `pythonRequirements` plugin.
- `templates/handler.py` — `Mangum(app)`, the Lambda entry point.
- `templates/main.py` — local-only `uvicorn.run("app:app", reload=True)`.
- `templates/app.py` — FastAPI app with CORS, a health-check route, and a
  minimal NDJSON streaming example endpoint.
- `templates/pyproject.toml` — uv dependency source of truth.
- `templates/package.json` — `deploy` / `package` / `pip` scripts + versions.
- `templates/.env.sample`, `templates/.gitignore` — env template + ignores.

## Gotchas (non-obvious — read before debugging)

1. **Docker must be running** to `deploy`/`package`. `serverless-python-requirements`
   uses `dockerizePip: true` to build Linux wheels. If Docker is down the deploy
   fails with a Docker connection error.
2. **Apple Silicon cross-compile.** Lambda `architecture: x86_64` but the dev
   machine is arm64, hence `DOCKER_DEFAULT_PLATFORM=linux/amd64` in the npm
   scripts. Don't drop `cross-env` or native wheels (e.g. `psycopg2-binary`)
   will be the wrong arch and fail at runtime in Lambda.
3. **Keep Python versions aligned.** `serverless.yml` `runtime: python3.12` and
   `pyproject.toml` `requires-python = ">=3.12"` must agree on major.minor.
   A local 3.13 venv with a 3.12 Lambda runtime can surface subtle differences —
   pin the venv to 3.12 (`uv venv --python 3.12`) to match the runtime exactly.
4. **`.env` is bundled into the deployment package** (`package.include: .env` in
   serverless.yml). Convenient, but it ships secrets inside the uploaded zip.
   For anything real, prefer `provider.environment` (Lambda env vars) or
   SSM/Secrets Manager, and remove `.env` from `package.include`.
5. **Re-run `npm run pip` after every `pyproject.toml` change.** Lambda installs
   from `requirements.txt`, not `pyproject.toml` — a stale requirements file
   means the new dep silently isn't deployed.

## Streaming gotcha (Lambda buffers responses)

`StreamingResponse` streams fine on local uvicorn, but **API Gateway buffers the
entire response** — chunked transfer encoding is stripped at the gateway, so a
client sees nothing until the Lambda returns fully. To stream for real from
Lambda you must use a **Lambda Function URL** with `InvokeMode: RESPONSE_STREAM`
instead of (or in addition to) the HTTP API event:

```yaml
functions:
  app:
    handler: handler.handler
    url:                                  # Function URL (no httpApi)
      cors:
        allowedOrigins: ["http://localhost:3000"]
        allowedHeaders: [content-type]
        allowedMethods: [GET, POST, OPTIONS]
    # events: [ ... keep httpApi too if you still want the gateway ... ]

resources:
  extensions:
    AppLambdaFunctionUrl:                 # = <FunctionName> + "LambdaFunctionUrl"
      Properties:
        InvokeMode: RESPONSE_STREAM       # Serverless v3 can't set this under url:
```

`AppLambdaFunctionUrl` is the CloudFormation logical id Serverless auto-generates
for a function named `app` (for a function named `foo` it's `FooLambdaFunctionUrl`).
Setting `invokeMode` directly under `url:` fails on Serverless v3 with an
`AWS::EarlyValidation::PropertyValidation` error — that's why it's patched via
`resources.extensions`.
