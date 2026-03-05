import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Handler } from "../types/lambda";
import { FeePaymentRecord, FeeSummary } from "../types/contracts";
import { getPathParam, getQuery, json, notFound, nowIso, parseJsonBody } from "../utils/http";
import { getDdb, getFeePaymentsTable } from "../utils/ddb";

const ddb = getDdb();
const tableName = getFeePaymentsTable();
const deletedAtField = "deletedAt";

const asString = (value: unknown): string => (value === null || value === undefined ? "" : String(value));

const asNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
};

const buildUpdateExpression = (fields: Record<string, unknown>) => {
  const entries = Object.entries(fields);
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];

  entries.forEach(([key, value], index) => {
    const nameKey = `#f${index}`;
    const valueKey = `:v${index}`;
    names[nameKey] = key;
    values[valueKey] = value;
    sets.push(`${nameKey} = ${valueKey}`);
  });

  return {
    UpdateExpression: `SET ${sets.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values
  };
};

const addNotDeletedFilter = (
  filters: string[],
  names: Record<string, string>,
  values: Record<string, unknown>
): void => {
  names["#deletedAt"] = deletedAtField;
  values[":deletedAtNull"] = null;
  filters.push("(attribute_not_exists(#deletedAt) OR #deletedAt = :deletedAtNull)");
};

export const feesClassFeesGet: Handler = async () =>
  json(200, {
    fees: {
      "Class 1": { tuition: 3500, admission: 1750, exam: 700 },
      "Class 2": { tuition: 3600, admission: 1750, exam: 700 },
      "Class 3": { tuition: 3700, admission: 1750, exam: 700 }
    },
    source: "api"
  });

export const feesPaymentsPost: Handler = async (event) => {
  const body = parseJsonBody(event);

  const record: FeePaymentRecord = {
    id: `FP-${Date.now()}`,
    studentId: asString(body.studentId),
    studentName: asString(body.studentName),
    className: asString(body.className),
    feeType: asString(body.feeType || "tuition"),
    month: body.month ? asString(body.month) : null,
    paymentMode: asString(body.paymentMode || "upi"),
    method: asString(body.method || "UPI Manual"),
    transactionId: asString(body.transactionId),
    baseAmount: asNumber(body.baseAmount, 0),
    gatewayCharge: asNumber(body.gatewayCharge, 0),
    totalAmount: asNumber(body.totalAmount, 0),
    proof: asString(body.proof || "uploaded-proof-url"),
    receiptUrl: body.receiptUrl ? asString(body.receiptUrl) : null,
    status: "pending",
    submittedAt: nowIso(),
    verifiedAt: null,
    verifiedBy: null,
    deletedAt: null
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: record,
        ConditionExpression: "attribute_not_exists(#id)",
        ExpressionAttributeNames: { "#id": "id" }
      })
    );
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return json(409, { message: "Duplicate payment", code: "DUPLICATE" });
    }

    throw error;
  }

  return json(201, { batchId: `PAY-${Date.now()}`, records: [record] });
};

export const feesPaymentsMeGet: Handler = async (event) => {
  const studentId = getQuery(event, "studentId");

  const filters: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  addNotDeletedFilter(filters, names, values);

  if (studentId) {
    names["#studentId"] = "studentId";
    values[":studentId"] = studentId;
    filters.push("#studentId = :studentId");
  }

  const response = await ddb.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: filters.join(" AND "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values
    })
  );

  const records = (response.Items ?? []) as FeePaymentRecord[];
  const summary: FeeSummary = {
    paidMonths: 0,
    unpaidMonths: 0,
    pendingVerification: records.filter((r) => r.status === "pending").length,
    totalPaidAmount: records.reduce((sum, r) => sum + (r.status === "approved" ? r.totalAmount : 0), 0),
    totalDueAmount: 0
  };

  return json(200, { records, summary });
};

export const adminFeesPaymentsGet: Handler = async (event) => {
  const className = getQuery(event, "className");
  const status = getQuery(event, "status");
  const q = getQuery(event, "q");

  const filters: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  addNotDeletedFilter(filters, names, values);

  if (className) {
    names["#className"] = "className";
    values[":className"] = className;
    filters.push("#className = :className");
  }

  if (status) {
    names["#status"] = "status";
    values[":status"] = status;
    filters.push("#status = :status");
  }

  if (q) {
    names["#studentName"] = "studentName";
    names["#studentId"] = "studentId";
    values[":q"] = q;
    filters.push("(contains(#studentName, :q) OR contains(#studentId, :q))");
  }

  const response = await ddb.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: filters.join(" AND "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values
    })
  );

  return json(200, { records: response.Items ?? [] });
};

export const adminFeesPaymentsPaymentIdGet: Handler = async (event) => {
  const paymentId = getPathParam(event, "paymentId");

  if (!paymentId) {
    return notFound("Payment not found");
  }

  const response = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: paymentId }
    })
  );

  if (!response.Item || (response.Item as FeePaymentRecord).deletedAt) {
    return notFound("Payment not found");
  }

  return json(200, response.Item);
};

export const adminFeesPaymentsPaymentIdPatch: Handler = async (event) => {
  const paymentId = getPathParam(event, "paymentId");
  const body = parseJsonBody(event);

  if (!paymentId) {
    return notFound("Payment not found");
  }

  const fields: Record<string, unknown> = {};
  if ("studentId" in body) fields.studentId = asString(body.studentId);
  if ("studentName" in body) fields.studentName = asString(body.studentName);
  if ("className" in body) fields.className = asString(body.className);
  if ("feeType" in body) fields.feeType = asString(body.feeType);
  if ("month" in body) fields.month = body.month === null ? null : asString(body.month);
  if ("paymentMode" in body) fields.paymentMode = asString(body.paymentMode);
  if ("method" in body) fields.method = asString(body.method);
  if ("transactionId" in body) fields.transactionId = asString(body.transactionId);
  if ("baseAmount" in body) fields.baseAmount = asNumber(body.baseAmount, 0);
  if ("gatewayCharge" in body) fields.gatewayCharge = asNumber(body.gatewayCharge, 0);
  if ("totalAmount" in body) fields.totalAmount = asNumber(body.totalAmount, 0);
  if ("proof" in body) fields.proof = asString(body.proof);
  if ("receiptUrl" in body) fields.receiptUrl = body.receiptUrl === null ? null : asString(body.receiptUrl);
  if ("status" in body) fields.status = asString(body.status);
  if ("verifiedAt" in body) fields.verifiedAt = body.verifiedAt === null ? null : asString(body.verifiedAt);
  if ("verifiedBy" in body) fields.verifiedBy = body.verifiedBy === null ? null : asString(body.verifiedBy);

  if (!Object.keys(fields).length) {
    return json(400, { message: "No fields to update", code: "NO_UPDATES" });
  }

  const update = buildUpdateExpression(fields);

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: paymentId },
        ConditionExpression: "attribute_exists(#id) AND (attribute_not_exists(#deletedAt) OR #deletedAt = :deletedAtNull)",
        ExpressionAttributeNames: {
          "#id": "id",
          "#deletedAt": deletedAtField,
          ...update.ExpressionAttributeNames
        },
        ExpressionAttributeValues: {
          ":deletedAtNull": null,
          ...update.ExpressionAttributeValues
        },
        UpdateExpression: update.UpdateExpression,
        ReturnValues: "ALL_NEW"
      })
    );

    return json(200, response.Attributes ?? {});
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return notFound("Payment not found");
    }

    throw error;
  }
};

export const adminFeesPaymentsPaymentIdVerifyPost: Handler = async (event) => {
  const paymentId = getPathParam(event, "paymentId");
  const body = parseJsonBody(event);

  if (!paymentId) {
    return notFound("Payment not found");
  }

  const status = body.status === "rejected" ? "rejected" : "approved";

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: paymentId },
        ConditionExpression: "attribute_exists(#id) AND (attribute_not_exists(#deletedAt) OR #deletedAt = :deletedAtNull)",
        ExpressionAttributeNames: {
          "#id": "id",
          "#status": "status",
          "#verifiedAt": "verifiedAt",
          "#verifiedBy": "verifiedBy",
          "#deletedAt": deletedAtField
        },
        ExpressionAttributeValues: {
          ":status": status,
          ":verifiedAt": nowIso(),
          ":verifiedBy": "admin",
          ":deletedAtNull": null
        },
        UpdateExpression: "SET #status = :status, #verifiedAt = :verifiedAt, #verifiedBy = :verifiedBy",
        ReturnValues: "ALL_NEW"
      })
    );

    return json(200, response.Attributes ?? {});
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return notFound("Payment not found");
    }

    throw error;
  }
};

export const adminFeesPaymentsPaymentIdDelete: Handler = async (event) => {
  const paymentId = getPathParam(event, "paymentId");

  if (!paymentId) {
    return notFound("Payment not found");
  }

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: paymentId },
        ConditionExpression: "attribute_exists(#id) AND (attribute_not_exists(#deletedAt) OR #deletedAt = :deletedAtNull)",
        ExpressionAttributeNames: {
          "#id": "id",
          "#deletedAt": deletedAtField
        },
        ExpressionAttributeValues: {
          ":deletedAt": nowIso(),
          ":deletedAtNull": null
        },
        UpdateExpression: "SET #deletedAt = :deletedAt",
        ReturnValues: "ALL_NEW"
      })
    );

    return json(200, { deleted: true, id: paymentId, deletedAt: response.Attributes?.deletedAt ?? null });
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return notFound("Payment not found");
    }

    throw error;
  }
};
