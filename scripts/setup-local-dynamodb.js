const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");

const endpoint = process.env.DDB_ENDPOINT_URL || "http://localhost:8000";
const region = process.env.AWS_REGION || "us-east-1";

const client = new DynamoDBClient({
  region,
  endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "local",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "local"
  }
});

const tables = [
  {
    TableName: "users",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [{ AttributeName: "studentId", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "studentId", KeyType: "HASH" }]
  },
  {
    TableName: "admission_applications",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }]
  },
  {
    TableName: "notices",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }]
  },
  {
    TableName: "fee_payments",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }]
  },
  {
    TableName: "class_fees",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [{ AttributeName: "className", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "className", KeyType: "HASH" }]
  },
  {
    TableName: "gallery_media",
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }]
  }
];

const tableExists = async (tableName) => {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (err) {
    if (err && err.name === "ResourceNotFoundException") {
      return false;
    }
    throw err;
  }
};

const createTable = async (definition) => {
  if (await tableExists(definition.TableName)) {
    console.log(`Table '${definition.TableName}' already exists. Skipping.`);
    return;
  }

  console.log(`Creating table '${definition.TableName}'...`);
  await client.send(new CreateTableCommand(definition));
};

const main = async () => {
  console.log(`Ensuring local DynamoDB tables exist at ${endpoint} (${region})...`);

  for (const table of tables) {
    await createTable(table);
  }

  console.log("Done.");
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
