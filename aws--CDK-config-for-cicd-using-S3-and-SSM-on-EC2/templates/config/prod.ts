import type { ESalesConfig } from './getConfig';

export const config: ESalesConfig = {
    tags: { Project: 'CHANGE_ME', Stage: 'prod', From: 'cdk' },
    env: { region: 'ap-east-1' },
    serviceName: 'sales',
    vpc: {
        defaultVPC: { id: 'vpc-CHANGE_ME' },
        subnetId: 'subnet-CHANGE_ME',
        availabilityZone: 'ap-east-1a',
    },
    ec2: {
        amiId: 'ami-CHANGE_ME',
        instanceType: 't4g.small',
    },
    keyPairNameForSSH: 'CHANGE_ME-key',
    securityGroup: {
        webServer: { id: 'sg-CHANGE_ME' },
    },
    s3: {
        deployBucket: { bucketName: 'CHANGE_ME-deploy-prod' },
        deployPrefix: 'deploys/sales',
    },
};
