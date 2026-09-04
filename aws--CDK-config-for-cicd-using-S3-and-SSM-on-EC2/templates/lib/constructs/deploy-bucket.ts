import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface DeployBucketProps {
    bucketName: string;
}

/**
 * Private, versioned deploy bucket. Versioning is the rollback handle: every
 * uploaded jar object keeps its previous versions so an old artifact can be
 * re-deployed from the bucket.
 */
export class DeployBucket extends Construct {
    public readonly bucket: s3.Bucket;

    constructor(scope: Construct, id: string, props: DeployBucketProps) {
        super(scope, id);

        this.bucket = new s3.Bucket(this, 'Bucket', {
            bucketName: props.bucketName,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            // Deploy jars are a history; never auto-delete with the stack.
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
    }
}
