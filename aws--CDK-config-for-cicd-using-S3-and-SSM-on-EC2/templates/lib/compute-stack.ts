import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import type { ESalesConfig, Stage } from '../config/getConfig';

export interface ComputeStackProps extends cdk.StackProps {
    stage: Stage;
    config: ESalesConfig;
}

/**
 * Owns the EC2 instance and its instance-profile role. Exports the instance id
 * and the role for the deploy stack to attach the SSM-core and deploy-read
 * policies, keeping the deploy-flow permissions with the deploy-flow resources.
 *
 * To target an already-running instance instead of creating one, drop the
 * ec2.Instance creation, keep the role, and set `instanceId` from config.
 */
export class ComputeStack extends cdk.Stack {
    public readonly instanceId: string;
    public readonly instanceRole: iam.IRole;

    constructor(scope: Construct, id: string, props: ComputeStackProps) {
        super(scope, id, props);
        const { stage, config } = props;

        for (const [key, value] of Object.entries(config.tags)) {
            cdk.Tags.of(this).add(key, value);
        }

        const vpc = ec2.Vpc.fromLookup(this, 'Vpc', { vpcId: config.vpc.defaultVPC.id });
        const subnet = ec2.Subnet.fromSubnetAttributes(this, 'Subnet', {
            subnetId: config.vpc.subnetId,
            availabilityZone: config.vpc.availabilityZone,
        });
        const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(
            this,
            'WebServerSg',
            config.securityGroup.webServer.id,
        );

        const role = new iam.Role(this, 'InstanceRole', {
            roleName: `${config.serviceName}-ec2-role`,
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            description: `EC2 instance role for ${config.serviceName} (SSM agent + deploy reads)`,
        });

        const instance = new ec2.Instance(this, 'Instance', {
            vpc,
            vpcSubnets: { subnets: [subnet] },
            instanceType: new ec2.InstanceType(config.ec2.instanceType),
            machineImage: ec2.MachineImage.genericLinux({ [config.env.region]: config.ec2.amiId }),
            securityGroup,
            role,
            keyName: config.keyPairNameForSSH,
        });

        this.instanceId = instance.instanceId;
        this.instanceRole = role;

        new cdk.CfnOutput(this, 'InstanceId', { value: instance.instanceId });
        new cdk.CfnOutput(this, 'InstanceRoleArn', { value: role.roleArn });
    }
}
