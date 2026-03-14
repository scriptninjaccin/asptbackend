const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

const envName = process.env.NODE_ENV || "development";
const envPath = path.resolve(process.cwd(), `.env.${envName}`);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const endpoint = process.env.DDB_ENDPOINT_URL || "http://localhost:8000";
const region = process.env.AWS_REGION || "us-east-1";
const forceSeed = (process.env.SEED_FORCE || "false").toLowerCase() === "true";

const tables = {
  users: process.env.DDB_TABLE_USERS || "users",
  admissions: process.env.DDB_TABLE_ADMISSIONS || "admission_applications",
  notices: process.env.DDB_TABLE_NOTICES || "notices",
  feePayments: process.env.DDB_TABLE_FEE_PAYMENTS || "fee_payments",
  classFees: process.env.DDB_TABLE_CLASS_FEES || "class_fees",
  gallery: process.env.DDB_TABLE_GALLERY || "gallery_media"
};

const client = new DynamoDBClient({
  region,
  endpoint,
  credentials: { accessKeyId: "local", secretAccessKey: "local" }
});
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

const nowIso = () => new Date().toISOString();

const hasAnyItems = async (tableName) => {
  try {
    const response = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        Limit: 1
      })
    );
    return (response.Items || []).length > 0;
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error(`[seed] failed to scan table '${tableName}': ${message}`);
    throw err;
  }
};

const putIfMissing = async (tableName, item, keyField) => {
  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(#key)",
        ExpressionAttributeNames: { "#key": keyField }
      })
    );
    return true;
  } catch (err) {
    if (err && err.name === "ConditionalCheckFailedException") {
      return false;
    }
    throw err;
  }
};

const seedTable = async (tableName, keyField, items) => {
  if (!forceSeed && (await hasAnyItems(tableName))) {
    console.log(`[seed] ${tableName}: already has data, skipping`);
    return;
  }

  let created = 0;
  for (const item of items) {
    const didCreate = await putIfMissing(tableName, item, keyField);
    if (didCreate) created += 1;
  }

  console.log(`[seed] ${tableName}: added ${created} item(s)`);
};

const main = async () => {
  console.log("[seed] tables:", tables);
  const seedId = Date.now().toString();

  await seedTable(tables.users, "studentId", [
    {
      studentId: "ADM-0001",
      password: "admin123",
      studentName: "System Admin",
      fatherName: "-",
      motherName: "-",
      className: "Class 12",
      phone: "+91 9455530939",
      email: "admin@college.local",
      address: "Main Campus Road",
      group: "admin",
      monthlyFee: 4200,
      deletedAt: null
    },
    {
      studentId: "ST-1001",
      password: "123456",
      studentName: "Ayesha Khan",
      fatherName: "Sajid Khan",
      motherName: "Nadia Khan",
      className: "Class 10",
      phone: "03001234567",
      email: "ayesha@demo.edu",
      address: "North Campus Road",
      group: "student",
      monthlyFee: 3500,
      deletedAt: null
    }
  ]);

  await seedTable(tables.admissions, "id", [
    {
      id: `ADM-${seedId}`,
      studentId: "ST-2001",
      studentName: "Ritika Singh",
      fatherName: "Mahesh Singh",
      motherName: "Sunita Singh",
      className: "Class 9",
      dob: "2011-08-19",
      phone: "9876543210",
      email: "ritika.demo@school.local",
      address: "Village AKodha, Bhadohi",
      documents: ["student-photo.jpg", "class-8-marksheet.pdf"],
      createdAt: nowIso(),
      status: "pending",
      reviewedAt: null,
      reviewedBy: null,
      deletedAt: null
    }
  ]);

  await seedTable(tables.notices, "id", [
    {
      id: `N-${seedId}-1`,
      title: "Admission Session 2026-27 Open",
      body: "Admission forms are open for Class 1 to 12. Submit documents before March 31.",
      publishedAt: "2026-02-10",
      deletedAt: null
    },
    {
      id: `N-${seedId}-2`,
      title: "Monthly Fee Deadline",
      body: "Monthly fee should be paid before the 10th of each month to avoid late charges.",
      publishedAt: "2026-02-05",
      deletedAt: null
    }
  ]);

  await seedTable(tables.feePayments, "id", [
    {
      id: `FP-${seedId}`,
      studentId: "ST-1001",
      studentName: "Ayesha Khan",
      className: "Class 10",
      feeType: "tuition",
      month: "2026-02",
      paymentMode: "upi",
      method: "UPI Manual",
      transactionId: `TXN-${seedId}`,
      baseAmount: 3500,
      gatewayCharge: 0,
      totalAmount: 3500,
      proof: "upi-slip-feb.jpg",
      receiptUrl: null,
      status: "pending",
      submittedAt: nowIso(),
      verifiedAt: null,
      verifiedBy: null,
      deletedAt: null
    }
  ]);

  await seedTable(tables.gallery, "id", [
    {
      id: `GM-${seedId}-1`,
      type: "photo",
      title: "Annual Science Fair",
      caption: "Students presenting science models.",
      src: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=80",
      createdAt: nowIso(),
      deletedAt: null
    }
  ]);

  await seedTable(tables.classFees, "className", [
    { className: "Class 1", tuition: 3500, admission: 1750, exam: 700 },
    { className: "Class 2", tuition: 3600, admission: 1750, exam: 700 },
    { className: "Class 3", tuition: 3700, admission: 1750, exam: 700 },
    { className: "Class 4", tuition: 3900, admission: 1800, exam: 750 },
    { className: "Class 5", tuition: 4100, admission: 1900, exam: 800 }
  ]);
};

main().catch((err) => {
  console.error("[seed] failed:", err && err.message ? err.message : err);
  process.exitCode = 1;
});
