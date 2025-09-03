import { CloudFormationClient, CloudFormationClientConfig } from "@aws-sdk/client-cloudformation";
import { AssumeRoleCommand, STSClient, Credentials as STSCredentials } from "@aws-sdk/client-sts";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import * as task from "azure-pipelines-task-lib/task";

const defaultRoleSessionName = "aws-vsts-tools";

const assumeRoleIfNeeded = async (
  credentials: AwsCredentialIdentity,
  roleSessionName: string = defaultRoleSessionName,
  region: string,
  roleArn?: string,
  externalId?: string
): Promise<AwsCredentialIdentity> => {
  if (!roleArn) return credentials;

  const stsClient = new STSClient({ region, credentials });

  const command = new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: roleSessionName,
    DurationSeconds: 3600,
    ExternalId: externalId,
  });

  const response = await stsClient.send(command);
  const assumed: STSCredentials | undefined = response.Credentials;

  if (!assumed?.AccessKeyId || !assumed.SecretAccessKey) {
    throw new Error("❌ Error al asumir el rol: credenciales incompletas.");
  }

  return {
    accessKeyId: assumed.AccessKeyId,
    secretAccessKey: assumed.SecretAccessKey,
    sessionToken: assumed.SessionToken,
  };
};

export const getClient = async (region: string, awsConnection: string): Promise<CloudFormationClient> => {
  const accessKeyId = task.getEndpointAuthorizationParameter(awsConnection, "username", false);
  const secretAccessKey = task.getEndpointAuthorizationParameter(awsConnection, "password", false);
  const sessionToken = task.getEndpointAuthorizationParameter(awsConnection, "sessionToken", true) || undefined;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("❌ Faltan accessKeyId o secretAccessKey.");
  }

  const roleArn =
    task.getEndpointDataParameter(awsConnection, "roleArn", true) ||
    task.getEndpointAuthorizationParameter(awsConnection, "assumeRoleArn", true);

  const externalId =
    task.getEndpointDataParameter(awsConnection, "externalId", true) ||
    task.getEndpointAuthorizationParameter(awsConnection, "externalId", true);

  const roleSessionName =
    task.getEndpointDataParameter(awsConnection, "roleSessionName", true) ||
    task.getEndpointAuthorizationParameter(awsConnection, "roleSessionName", true) ||
    defaultRoleSessionName;

  let baseCredentials: AwsCredentialIdentity = {
    accessKeyId,
    secretAccessKey,
    sessionToken,
  };

  const finalCredentials = await assumeRoleIfNeeded(baseCredentials, roleSessionName, region, roleArn, externalId);
  const config: CloudFormationClientConfig = {
    region,
    credentials: async () => finalCredentials,
  };
  return new CloudFormationClient(config);
};