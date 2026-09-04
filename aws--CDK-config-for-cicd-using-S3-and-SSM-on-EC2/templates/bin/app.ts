#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ComputeStack } from '../lib/compute-stack';
import { DeployStack } from '../lib/deploy-stack';
import { getConfig, isStage } from '../config/getConfig';

const app = new cdk.App();

const stageRaw = (app.node.tryGetContext('stage') as string) || process.env.STAGE || 'dev';
if (!isStage(stageRaw)) {
    throw new Error(`Unknown stage "${stageRaw}". Expected "dev" | "prod".`);
}
const stage = stageRaw;
const config = getConfig(stage);

const env = {
    // Resolved from the CLI profile at deploy time. Confirm the account before
    // applying, a correct stack deployed to the wrong account reproduces the
    // OIDC "Not authorized" error exactly.
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.env.region,
};

const computeStack = new ComputeStack(app, `ComputeStack-${stage}`, {
    stage,
    config,
    env,
});

new DeployStack(app, `DeployStack-${stage}`, {
    stage,
    config,
    env,
    // Cross-stack references: CDK exports the instance id and role from the
    // compute stack and imports them here, keeping deploy order guaranteed.
    targetInstanceId: computeStack.instanceId,
    targetInstanceRole: computeStack.instanceRole,
});
