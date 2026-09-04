---
name: aws--CDK-config-for-cicd-using-S3-and-SSM-on-EC2
description: Scaffold an AWS CDK (TypeScript) project that provisions the CI/CD resources for deploying a Java/Spring Boot jar to an EC2 instance from GitHub Actions, centered on the S3 bucket and EC2: the versioned S3 deploy bucket, the GitHub OIDC provider and its deploy role with the correct repo+environment trust policy, the EC2 instance (or wires an existing one) with its instance-profile role, SSM core + deploy-read policies, and the cross-stack wiring, then connects it to a GitHub Actions workflow that pulls the jar over SSM and restarts a systemd unit. Use when the user asks to create, scaffold, or bootstrap the AWS side of a CI/CD pipeline that deploys a jar to EC2 through an S3 bucket and SSM, add the IAM role/SSM/EC2/policies for such CI/CD, or replicate the esales deploy topology for another service.
---

# AWS CDK resources for GitHub Actions -> EC2 deploys over SSM

Bootstraps a CDK project whose stacks create everything the "manual deploy to EC2" pipeline needs, so the GitHub workflow has a role to assume and the instance is allowed to receive SSM Run Commands and pull jars. Modeled on the working reference project `esales` under `/Users/chingcheonglee/Repos/hkev/aws-iaac-for-hkev/esales`; copy the skeleton from there when it is present, otherwise generate from the snippets below.

## When to use

The trigger is someone starting a "Spring Boot jar onto one EC2 box" deployment for a new service or repo and choosing AWS CDK for the infrastructure. The reference topology is:

- GitHub Actions `workflow_dispatch` runs on the repo, assumes an IAM role through GitHub OIDC, builds the jar, uploads it to a private versioned S3 bucket, then sends an SSM Run Command telling the instance to pull the jar and restart a systemd unit.
- The instance has no inbound ports; the SSM agent keeps an outbound control plane. A reverse proxy (Caddy) fronts the app on 80/443.
- One thin, self-contained GitHub workflow per service (do NOT build a shared reusable composite action for this; datasource/secret injection differs per module).

## Templates (primary generation source)

A self-contained TypeScript CDK app lives under `templates/` in this skill. It is the explicit, machine-independent way to generate the resources; use it before reaching for the reference project.

- `templates/README.md` - replacement guide and deploy commands.
- `templates/bin/app.ts` - stage context (`-c stage=dev|prod`), builds `ComputeStack-<stage>` + `DeployStack-<stage>` with cross-stack references.
- `templates/lib/compute-stack.ts` - EC2 instance + instance-profile role; exports instance id and role. To target an existing instance, drop the `ec2.Instance` and set `instanceId` from config.
- `templates/lib/deploy-stack.ts` - deploy bucket + OIDC deploy role; attaches `AmazonSSMManagedInstanceCore` and the deploy-read policy to the instance role.
- `templates/lib/constructs/github-actions-deploy-role.ts` - the load-bearing file: OIDC provider + role whose trust policy is `repo:OWNER/REPO:environment:<env>` (see below). Contains two explicit CHANGE_ME tokens: `GITHUB_OWNER_REPO` and `GITHUB_ENVIRONMENT`.
- `templates/lib/constructs/deploy-bucket.ts` - private, versioned bucket (RETAIN).
- `templates/config/{getConfig,dev,prod}.ts` - per-stage values with `CHANGE_ME` markers for region, vpc/subnet/sg/ami/instance type, bucket name/prefix, `serviceName`.

Generation flow:

1. Copy the whole `templates/` tree into the new project directory.
2. Replace every `CHANGE_ME` in `config/dev.ts`, `config/prod.ts`, and the `GITHUB_OWNER_REPO` / `GITHUB_ENVIRONMENT` tokens in the role construct, plus the identifiers listed in `templates/README.md`.
3. `yarn install && yarn build`, then `synth:prod`, `diff:prod`, `deploy:prod`.

Use the reference project only for optional extras the template intentionally leaves out (VPC creation, Route53, CloudFront, Elastic IP, per-service user-data), copying the matching construct from esales and adapting names.

## Reference project layout to copy

`/Users/chingcheonglee/Repos/hkev/aws-iaac-for-hkev/esales` holds the working version. Two stacks, cross-stack references, constructs per concern, stage configs:

- `bin/esales.ts` - stage resolved from `-c stage=dev|prod`, builds both stacks.
- `lib/esales-stack.ts` (`EsalesComputeStack`) - EC2 instance, instance role, networking glue. Exports `ec2InstanceId` and `salesRole`.
- `lib/esales-github-actions-deploy-stack.ts` (`EsalesGithubActionsDeployStack`) - deploy bucket + deploy role + instance-side policies; imports the instance id/role from the compute stack.
- `lib/constructs/` - `bucket/esales-deploy-bucket`, `iam/github-action/*`, `iam/common/*`, `ec2/esales-ec2.ts`, plus vpc/sg/elastic-ip/route53/cloudfront constructs that may be trimmed per project.
- `config/{dev,prod,getConfig}.ts` - per-stage values incl. account-in-`CDK_DEFAULT_ACCOUNT`, region, bucket names, instance id.
- `package.json` scripts: `build`, `synth:prod`, `diff:prod`, `deploy:prod` (`cdk deploy --require-approval never -c stage=prod`), etc. The account is `process.env.CDK_DEFAULT_ACCOUNT`, so ALWAYS confirm which account a deploy targets (see Gotchas).

## Steps

1. Ask for or infer the parameters (table below). If only the service name is known, derive defaults `service=x`, `module=web.x`, `/opt/x`, bucket `<x>-deploy-<stage>`, prefix `deploys/x`.
2. If the reference esales project exists, copy its CDK structure, then trim to the service at hand and rename every identifier (`esales`, `sales`, `web.sales`, `esales-deploy-prod`, `deploys/sales`). If it does not exist, generate an app from the snippets below.
3. Create the S3 deploy bucket with versioning on (rollback handle) and a lifecycle-free simple policy scope.
4. Create the deploy role construct: GitHub OIDC provider + role + bucket-write policy + SSM-command policy. The trust policy is the load-bearing piece; copy the block under "The trust policy".
5. Wire the instance side: the compute stack owns the instance and its instance-profile role. Attach `AmazonSSMManagedInstanceCore` (managed policy) plus an inline read policy allowing `s3:GetObject`/`s3:GetObjectVersion` on the bucket prefix, so the box can pull jars for deploys and rollbacks.
6. Fill config for each stage. Keep bucket names, instance ids, SG/vpc ids in config, not in code.
7. `yarn build && yarn synth:prod`, then `yarn diff:prod`, then deploy with the intended account profile.
8. Write/refresh the per-service GitHub workflow (env secrets contract below) and confirm a run end to end.

## Parameters

| Input | Meaning | Reference value (sales) |
|---|---|---|
| service | systemd unit name + `/opt/<name>` | `sales` |
| module | Maven module/artifactId; jar base name `<module>.jar` | `web.sales` |
| bucket / prefix | versioned bucket + object prefix | `esales-deploy-prod` / `deploys/sales` |
| github repo | CURRENT owner/repo on GitHub | `Hong-Kong-EV-Power-Limited/echarge-java-modules` |
| environment | GitHub environment referenced by the workflow job | `production` |
| account / region | target AWS account & region | `618991747306` / `ap-east-1` |
| instance id | EC2 running SSM agent + the unit | `i-0...` |
| health url | URL the workflow polls after restart | `http://<svc>.hkev.com.hk/health-check` |
| app port / reverse proxy | jar listen port behind Caddy/nginx | `8081` behind Caddy on 80/443 |

## The trust policy (read this twice)

Because the workflow job sets `environment: <name>`, GitHub issues an environment-based OIDC subject, NOT a branch ref. The trust policy must key on it:

```json
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
  },
  "StringLike": {
    "token.actions.githubusercontent.com:sub": "repo:OWNER/REPO:environment:production"
  }
}
```

Equivalently in CDK:

```ts
const oidcProvider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
  url: 'https://token.actions.githubusercontent.com',
  clientIds: ['sts.amazonaws.com'],
});
// CloudFormation has no native OIDC provider: CDK provisions it via a
// custom-resource Lambda that only runs on create/update/delete.
const role = new iam.Role(this, 'Role', {
  roleName: '<service>-github-actions-deploy',
  assumedBy: new iam.OpenIdConnectPrincipal(oidcProvider).withConditions({
    StringEquals: {
      'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
    },
    StringLike: {
      // environment-based, because the job declares `environment: production`
      'token.actions.githubusercontent.com:sub': `repo:${DEPLOY_REPO}:environment:${DEPLOY_ENV}`,
    },
  }),
});
```

Hard rules:
- `repo:...:environment:<env>` uses the CURRENT repository name. GitHub never rewrites a clone's `origin` after a rename, so `git remote -v` can show a dead name while the token carries the live one; a policy keyed on the stale name fails with `Not authorized to perform sts:AssumeRoleWithWebIdentity` even though everything else is right. Confirm the name from the OIDC token's `repository` claim or the repo settings page.
- Scope role permissions narrowly: `s3:PutObject` etc. on the bucket prefix, `ssm:SendCommand` on BOTH the `AWS-RunShellScript` document AND the target instance ARN, plus `ssm:GetCommandInvocation`/`ListCommands`/`ListCommandInvocations` on `*` to read the result.
- Reuse one OIDC provider per account (it is per-account, URL fixed); role names are per-account so they do not collide across stages.

## Instance side (SSM + deploy-read)

```ts
// on the EC2 instance-profile role:
instanceRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
instanceRole.attachInlinePolicy(new Policy(this, 'DeployRead', {
  statements: [new PolicyStatement({
    actions: ['s3:GetObject', 's3:GetObjectVersion'],
    resources: [`arn:aws:s3:::${bucket}/${prefix}/*`],
  })],
}));
```

The SSM agent authenticates with the instance profile; no SSH, no port 22.

## GitHub workflow contract

One thin self-contained workflow per service (not a reusable composite action - see "Flattened workflow"). Required pieces, all learned the hard way:

- Job `permissions: id-token: write`, `contents: read`, and `environment: <env>` where the four secrets live.
- Job env provides exactly: `PASSWORD`, `READ_URL`, `USER_NAME`, `WRITE_URL`, `COMMIT_SHA: ${{ github.sha }}`; the build injects them into the module's `application-<profile>.yml` via `yq` `strenv()` so no secret hits the command line.
- The role assumption uses `aws-actions/configure-aws-credentials@v4` with `role-to-assume` and `aws-region`.
- Remote command that runs on the instance: idempotently write the systemd unit if missing (`test -f ... || cat > ... <<'UNIT'` + `daemon-reload` + `enable`), pull the jar to `.new`, `mv -f` over the live path, `pkill -f <module>.jar || true` + short sleep to clear strays, `systemctl restart <service>`, then a bounded health loop whose exit code gates the run.
- Unit bootstrap: `Type=simple`, `WorkingDirectory=/opt/<service>`, optional `EnvironmentFile=-/opt/<service>/<service>.env`, `ExecStart=/usr/bin/java -jar /opt/<service>/<module>.jar --spring.profiles.active=<profile>`, `Restart=on-failure`, `SuccessExitStatus=143`.
- Do NOT use `aws ssm send-command --wait-for-success` on the GitHub runner: the runner image's aws CLI rejects the flag. Send the command, then poll `aws ssm get-command-invocation --query Status` to a terminal state and fetch the output.
- SSM `comment` is capped at 100 chars: build a short label and truncate defensively.
- Health URL is the public domain through Caddy; the instance curls it after restart.

## Server-side setup

Keep companion scripts (outside CDK) that bootstrap the instance once and reload the proxy:

- Install the SSM agent so the box accepts Run Commands: `dnf install -y curl-minimal ca-certificates amazon-ssm-agent`, then `systemctl enable --now amazon-ssm-agent`. Amazon Linux 2023 ships `curl-minimal`; the full `curl` package conflicts with it.
- Install Java 25 as the system JDK: unpack Amazon Corretto 25 into `/opt/amazon-corretto-25`, make it the default via `alternatives --install`/`--set`, and export `JAVA_HOME` through `/etc/profile.d/java25.sh`.
- Install Caddy as the reverse proxy in front of the app port: binary at `/usr/local/bin/caddy`, a systemd unit running `caddy run --config /etc/caddy/Caddyfile --adapter caddyfile` with an `ExecReload`, and a `Caddyfile` that proxies `:80` and the service host to `127.0.0.1:<app-port>`.
- Add a reload companion that validates the config (`caddy validate --config ...`) then runs `systemctl reload caddy`, so config swaps are graceful.
- Keep every step idempotent (guard writes with `[[ ! -e ... ]]` / version checks) so re-running the bootstrap never clobbers an edited `Caddyfile` or unit.

## Gotchas (each one cost a debugging cycle)

- OIDC failure text is identical for every cause: role missing, provider missing, or `sub` mismatch. Diagnose by decoding the token in the run (`$ACTIONS_ID_TOKEN_REQUEST_URL` + `audience=sts.amazonaws.com`, decode the JWT payload) and by `aws iam get-role --role-name <role> --query 'Role.AssumeRolePolicyDocument' --output json` + `aws iam list-open-id-connect-providers`.
- Env-based `sub` only matches if the job actually declares `environment:`; remove the environment or match it exactly.
- `yq` must write into the profile file that the runtime profile actually loads (`application-prod.yml`), and the unit `ExecStart` must carry `--spring.profiles.active=prod`; "At least one target DataSource is required" = empty URL list (wrong profile/empty file), "Unable to determine Dialect without JDBC metadata" = the DB connection itself failed (security group/route/creds), inspect the baked file with `unzip -p <jar> BOOT-INF/classes/application-prod.yml`.
- `cdk deploy` resolves the account from `CDK_DEFAULT_ACCOUNT`/default profile: a correct-looking policy deployed to the wrong account reproduces the same OIDC error. Check the deploy log's account line.
- S3 prune must delete every version (list-object-versions + delete-object per VersionId) on a versioned bucket, or old versions survive.
- Newer GitHub repos may present the immutable OIDC subject (`repo:OWNER@<id>/REPO@<id>:...`); when a name-only policy fails on a brand-new repo, allow the `@<id>` form too or pin the exact subject from a dumped token.

## Validation checklist

1. `cdk synth` shows the role with the environment-based `sub` and the `sts.amazonaws.com` audience.
2. `cdk diff` against the target account shows only intended changes; deploy log names the intended account.
3. After deploy, `aws iam get-role` on the live role shows the expected trust policy.
4. A workflow run reaches the pull-and-restart step, the unit starts on the box, and the health URL answers before the poll timeout.
