import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { AwsCredentialIdentity } from "@aws-sdk/types"

export const getSecretValue = async (
    region: string,
    credentials: AwsCredentialIdentity,
    secretName: string
): Promise<string> => {
    const client = new SecretsManagerClient({
        region,
        credentials: async () => credentials
    });

    try {
        const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
        if (response.SecretString) {
            return response.SecretString;
        }
        throw new Error(`El secreto ${secretName} no contiene una cadena.`)
    } catch (error) {
        throw new Error(`Error al obtener el secreto ${secretName}: ${(error as Error).message}`)
    }
}