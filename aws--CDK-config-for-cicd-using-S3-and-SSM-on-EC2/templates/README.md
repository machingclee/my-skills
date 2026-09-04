# CDK template for GitHub Actions -> EC2 deploy resources

Self-contained TypeScript CDK app that provisions the CI/CD resources for
deploying a Spring Boot jar to one EC2 instance over SSM: versioned deploy
bucket, GitHub OIDC provider + deploy role with an environment-scoped trust
policy, the EC2 instance with its instance-profile role, SSM core + deploy-read
policies, and two stacks wired by cross-stack references.

## Replace the CHANGE_ME tokens

| Token / file | Where | What to set |
|---|---|---|
| `GITHUB_OWNER_REPO` | `lib/constructs/github-actions-deploy-role.ts` | CURRENT GitHub `owner/repo`, e.g. `Hong-Kong-EV-Power-Limited/echarge-java-modules`. A renamed repo keeps the old name in local `origin`; use the live name. |
| `GITHUB_ENVIRONMENT` | `lib/constructs/github-actions-deploy-role.ts` | The GitHub environment declared on the workflow job, e.g. `production`. |
| `serviceName` | `config/dev.ts` + `config/prod.ts` | systemd unit + `/opt/<name>` + role name prefix, e.g. `sales`. |
| Region / account | `config/*.ts` (`env.region`) | Account resolves from `CDK_DEFAULT_ACCOUNT`; confirm before `deploy`. |
| `vpc`, `subnetId`, `availabilityZone` | `config/*.ts` | Where the EC2 instance is launched. |
| `ec2.amiId`, `ec2.instanceType`, `keyPairNameForSSH` | `config/*.ts` | Instance image / size / optional SSH key. |
| `securityGroup.webServer.id` | `config/*.ts` | The SG the instance joins. |
| `s3.deployBucket.bucketName`, `s3.deployPrefix` | `config/*.ts` | Versioned bucket + jar object prefix. |

Names like `ComputeStack-prod` / `DeployStack-prod` and construct ids derive
from `serviceName`, so only the tokens above need editing.

## Deploy

```
yarn install
yarn build
yarn synth:prod
yarn diff:prod     # confirm target account in the diff header
yarn deploy:prod   # uses the default profile's account via CDK_DEFAULT_ACCOUNT
```

Pair the outputs (role ARN, OIDC provider ARN) with the per-service GitHub
workflow whose job env provides `PASSWORD`, `READ_URL`, `USER_NAME`,
`WRITE_URL`, `COMMIT_SHA` and whose remote command bootstraps the systemd unit,
pulls the jar over SSM and polls the health URL. See the skill's SKILL.md for
the workflow contract and the full gotcha list.
