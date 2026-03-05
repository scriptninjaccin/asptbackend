import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

let docClient: DynamoDBDocumentClient | undefined;

const buildClient = (): DynamoDBDocumentClient => {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const endpoint = process.env.DDB_ENDPOINT_URL;

  const client = new DynamoDBClient({
    region,
    ...(endpoint ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {})
  });

  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true
    }
  });
};

export const getDdb = (): DynamoDBDocumentClient => {
  if (!docClient) {
    docClient = buildClient();
  }

  return docClient;
};

export const getAdmissionsTable = (): string =>
  process.env.DDB_TABLE_ADMISSIONS ?? "admission_applications";

export const getNoticesTable = (): string =>
  process.env.DDB_TABLE_NOTICES ?? "notices";

export const getStudentsTable = (): string =>
  process.env.DDB_TABLE_USERS ?? "users";

export const getFeePaymentsTable = (): string =>
  process.env.DDB_TABLE_FEE_PAYMENTS ?? "fee_payments";

export const getGalleryTable = (): string =>
  process.env.DDB_TABLE_GALLERY ?? "gallery_media";
