import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import type { ESalesConfig, Stage } from '../config/getConfig';
import { DeployBucket } from './constructs/deploy-bucket';
import { GithubActionsDeployRole } from './constructs/github-actions-deploy-role';

export interface DeployStackProps extends cdk.StackProps {
    stage: Stage;
    config: ESalesConfig;
    /** Instance id of the box that receives SSM Run Commands. */
    targetInstanceId: string;
    /** Instance-profile role of the box; gets SSM-core + deploy-read policies. */
    targetInstanceRole: iam.IRole;
}

/**
 * The CI/CD resources: versioned deploy bucket, the GitHub OIDC provider and
 * deploy role the workflow assumes, plus the instance-side policies that let
 * the box pull jars through SSM.
 */
export class DeployStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: DeployStackProps) {
        super(scope, id, props);
        const { stage, config } = props;

        for (const [key, value] of Object.entries(config.tags)) {
            cdk.Tags.of(this).add(key, value);
        }

        const deployBucket = new DeployBucket(this, 'DeployBucket', {
            bucketName: config.s3.deployBucket.bucketName,
        });

        const deployRole = new GithubActionsDeployRole(this, 'GithubActionsDeployRole', {
            serviceName: config.serviceName,
            deployBucket: deployBucket.bucket,
            deployPrefix: config.s3.deployPrefix,
            targetInstanceId: props.targetInstanceId,
        });

        // Instance side: let the SSM agent run and read jars for deploys and
        // rollbacks. Attached here so deploy-flow permissions live with the
        // deploy-flow infrastructure.
        props.targetInstanceRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        );
        props.targetInstanceRole.attachInlinePolicy(
            new iam.Policy(this, 'DeployReadPolicy', {
                statements: [
                    new iam.PolicyStatement({
                        actions: ['s3:GetObject', 's3:GetObjectVersion'],
                        resources: [
                            `${deployBucket.bucket.bucketArn}/${config.s3.deployPrefix}/*`,
                        ],
                    }),
                ],
            }),
        );

        new cdk.CfnOutput(this, 'DeployRoleArn', {
            value: deployRole.role.roleArn,
            description: 'Role assumed by the GitHub Actions workflow through OIDC (repo + environment scoped).',
        });
        new cdk.CfnOutput(this, 'OidcProviderArn', {
            value: deployRole.oidcProviderArn,
            description: 'GitHub OIDC provider provisioned by a CDK custom-resource Lambda.',
        });
    }
}
