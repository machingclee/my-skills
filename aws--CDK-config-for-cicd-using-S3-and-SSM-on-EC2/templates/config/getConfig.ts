import { config as dev } from './dev';
import { config as prod } from './prod';

export interface ESalesConfig {
    tags: { Project: string; Stage: string; From: string };
    env: { region: string };
    /** systemd unit name, /opt/<name> and role-name prefix, e.g. sales */
    serviceName: string;
    vpc: {
        defaultVPC: { id: string };
        subnetId: string;
        availabilityZone: string;
    };
    ec2: {
        amiId: string;
        /** e.g. t4g.small (ARM) or t3.small (x86_64) */
        instanceType: string;
    };
    keyPairNameForSSH?: string;
    securityGroup: {
        webServer: { id: string };
    };
    s3: {
        deployBucket: { bucketName: string };
        /** object prefix for the service jars, e.g. deploys/sales */
        deployPrefix: string;
    };
}

export type Stage = 'dev' | 'prod';

export function isStage(value: unknown): value is Stage {
    return value === 'dev' || value === 'prod';
}

export function getConfig(stage: Stage): ESalesConfig {
    return stage === 'prod' ? prod : dev;
}
