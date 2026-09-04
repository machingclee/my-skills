import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * CHANGE_ME: the CURRENT owner/repo of the repository running the workflow.
 * GitHub never rewrites a clone's origin after a rename, so the local remote
 * can show a dead name while the OIDC subject carries the live one. Use the
 * repository's current name, read from the token's `repository` claim or the
 * repo settings page, never from `git remote -v`.
 */
const GITHUB_OWNER_REPO = 'GITHUB_OWNER_REPO';
/**
 * CHANGE_ME: the GitHub environment declared on the workflow job. When a job
 * sets `environment: <name>`, GitHub issues an environment-based OIDC subject
 * (`repo:OWNER/REPO:environment:<name>`), NOT a branch ref, so the trust
 * policy must key on the environment or every run fails with
 * `Not authorized to perform sts:AssumeRoleWithWebIdentity`.
 */
const GITHUB_ENVIRONMENT = 'GITHUB_ENVIRONMENT';

const GITHUB_OIDC_PROVIDER_HOST = 'token.actions.githubusercontent.com';
const GITHUB_OIDC_AUDIENCE = 'sts.amazonaws.com';

export interface GithubActionsDeployRoleProps {
    /** systemd/service name; used as the role-name prefix, e.g. sales */
    serviceName: string;
    deployBucket: s3.IBucket;
    /** object prefix for this service's jars, e.g. deploys/sales */
    deployPrefix: string;
    /** EC2 instance id the workflow restarts via SSM Run Command */
    targetInstanceId: string;
}

/**
 * Role assumed by the GitHub Actions workflow through OIDC. Permissions: upload,
 * list and prune jars in the deploy bucket, and send SSM Run Commands to the
 * instance plus read their output.
 */
export class GithubActionsDeployRole extends Construct {
    public readonly role: iam.Role;
    public readonly oidcProviderArn: string;

    constructor(scope: Construct, id: string, props: GithubActionsDeployRoleProps) {
        super(scope, id);

        // CloudFormation has no native OIDC provider resource, so CDK
        // provisions it via a custom-resource Lambda. It only runs during
        // create/update/delete. The provider is per-account; one per account.
        const oidcProvider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
            url: `https://${GITHUB_OIDC_PROVIDER_HOST}`,
            clientIds: [GITHUB_OIDC_AUDIENCE],
        });
        this.oidcProviderArn = oidcProvider.openIdConnectProviderArn;

        this.role = new iam.Role(this, 'Role', {
            roleName: `${props.serviceName}-github-actions-deploy`,
            assumedBy: new iam.OpenIdConnectPrincipal(oidcProvider).withConditions({
                StringEquals: {
                    [`${GITHUB_OIDC_PROVIDER_HOST}:aud`]: GITHUB_OIDC_AUDIENCE,
                },
                StringLike: {
                    // Environment-scoped subject; see the GITHUB_ENVIRONMENT note.
                    [`${GITHUB_OIDC_PROVIDER_HOST}:sub`]:
                        `repo:${GITHUB_OWNER_REPO}:environment:${GITHUB_ENVIRONMENT}`,
                },
            }),
            description: `GitHub Actions deploy role for ${props.serviceName} (jar upload + SSM restart)`,
        });

        this.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: [
                    's3:PutObject',
                    's3:DeleteObject',
                    's3:DeleteObjectVersion',
                ],
                resources: [
                    `${props.deployBucket.bucketArn}/${props.deployPrefix}/*`,
                ],
            }),
        );
        this.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ['s3:ListBucket', 's3:ListBucketVersions'],
                resources: [props.deployBucket.bucketArn],
            }),
        );
        this.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: ['ssm:SendCommand'],
                // SendCommand must name BOTH the document and the instance.
                resources: [
                    `arn:aws:ssm:${this.region}:${this.account}:document/AWS-RunShellScript`,
                    `arn:aws:ec2:${this.region}:${this.account}:instance/${props.targetInstanceId}`,
                ],
            }),
        );
        this.role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                actions: [
                    'ssm:GetCommandInvocation',
                    'ssm:ListCommands',
                    'ssm:ListCommandInvocations',
                ],
                resources: ['*'],
            }),
        );
    }
}
