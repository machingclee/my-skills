/**
 * Snippet to splice into agentcore/cdk/lib/cdk-stack.ts after agentcore create.
 *
 * Why this lives in CDK, not agentcore.json:
 *   - bin/cdk.ts already loads agentcore.json via ConfigIO.readProjectSpec().
 *   - AgentEnvSpec has no IAM field for an arbitrary S3 bucket.
 *   - S3_SESSION_BUCKET is only an env var consumed by Strands S3SessionManager.
 *   - Without this grant, session init fails with AccessDenied on s3:ListBucket
 *     and the AG-UI chat UI shows "(No response)".
 *
 * Insertion points (generated cdk-stack.ts from agentcore create):
 *   1. Keep the existing `import * as iam from 'aws-cdk-lib/aws-iam';`
 *   2. Paste the two helpers next to isPaymentEligibleAgent.
 *   3. After `this.application = new AgentCoreApplication(...)`, grant from
 *      each runtime's S3_SESSION_BUCKET env var.
 */

function sessionBucketFromAgent(agent: {
  envVars?: Array<{ name: string; value: string }>;
}): string | undefined {
  const value = agent.envVars?.find((v) => v.name === 'S3_SESSION_BUCKET')?.value?.trim();
  return value || undefined;
}

function grantS3SessionStorage(
  runtime: { addToPolicy: (statement: iam.PolicyStatement) => void },
  bucket: string
): void {
  runtime.addToPolicy(
    new iam.PolicyStatement({
      sid: 'S3SessionStorageList',
      actions: ['s3:ListBucket'],
      resources: [`arn:aws:s3:::${bucket}`],
    })
  );
  runtime.addToPolicy(
    new iam.PolicyStatement({
      sid: 'S3SessionStorageObjects',
      actions: ['s3:GetObject', 's3:PutObject'],
      resources: [`arn:aws:s3:::${bucket}/*`],
    })
  );
}

// After: this.application = new AgentCoreApplication(this, 'Application', appProps as any);
//
// for (const env of this.application.environments.values()) {
//   const bucket = sessionBucketFromAgent(env.agent);
//   if (bucket) {
//     grantS3SessionStorage(env.runtime, bucket);
//   }
// }
