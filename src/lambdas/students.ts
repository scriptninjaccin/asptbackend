import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Handler } from "../types/lambda";
import { FeeSummary, User } from "../types/contracts";
import { getPathParam, getQuery, json, notFound, nowIso, parseJsonBody } from "../utils/http";
import { getDdb, getStudentsTable } from "../utils/ddb";

const ddb = getDdb();
const tableName = getStudentsTable();
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

const buildUser = (body: Record<string, unknown>, overrides: Partial<User> = {}): User => ({
  studentId: asString(body.studentId ?? overrides.studentId ?? `S-${Date.now()}`),
  studentName: asString(body.studentName ?? overrides.studentName),
  fatherName: asString(body.fatherName ?? overrides.fatherName),
  motherName: asString(body.motherName ?? overrides.motherName),
  className: asString(body.className ?? overrides.className),
  phone: asString(body.phone ?? overrides.phone),
  email: asString(body.email ?? overrides.email),
  address: asString(body.address ?? overrides.address),
  group: (body.group === "admin" ? "admin" : "student") as User["group"],
  monthlyFee: asNumber(body.monthlyFee ?? overrides.monthlyFee, 0),
  deletedAt: (overrides as User).deletedAt ?? null
});

export const studentsMeGet: Handler = async () => {
  const response = await ddb.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: "(attribute_not_exists(#deletedAt) OR #deletedAt = :deletedAtNull)",
      ExpressionAttributeNames: { "#deletedAt": deletedAtField },
      ExpressionAttributeValues: { ":deletedAtNull": null },
      Limit: 1
    })
  );

  const user = response.Items?.[0] as User | undefined;

  if (!user) {
    return notFound("Student not found");
  }

  const feeSummary: FeeSummary = {
    paidMonths: 0,
    unpaidMonths: 0,
    pendingVerification: 0,
    totalPaidAmount: 0,
    totalDueAmount: 0
  };

  return json(200, { user, feeSummary });
};

export const adminStudentsPost: Handler = async (event) => {
  const body = parseJsonBody(event);
  const user = buildUser(body, { deletedAt: null });

  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: user,
        ConditionExpression: "attribute_not_exists(#id)",
        ExpressionAttributeNames: { "#id": "studentId" }
      })
    );
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return json(409, { message: "Duplicate student", code: "DUPLICATE" });
    }

    throw error;
  }

  return json(201, user);
};

export const adminStudentsGet: Handler = async (event) => {
  const className = getQuery(event, "className");
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

  return json(200, { students: response.Items ?? [], q: q ?? "" });
};

export const adminStudentsStudentIdGet: Handler = async (event) => {
  const studentId = getPathParam(event, "studentId");

  if (!studentId) {
    return notFound("Student not found");
  }

  const response = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { studentId }
    })
  );

  if (!response.Item || (response.Item as User).deletedAt) {
    return notFound("Student not found");
  }

  return json(200, response.Item);
};

export const adminStudentsStudentIdPatch: Handler = async (event) => {
  const studentId = getPathParam(event, "studentId");
  const body = parseJsonBody(event);

  if (!studentId) {
    return notFound("Student not found");
  }

  const fields: Record<string, unknown> = {};
  if ("studentName" in body) fields.studentName = asString(body.studentName);
  if ("fatherName" in body) fields.fatherName = asString(body.fatherName);
  if ("motherName" in body) fields.motherName = asString(body.motherName);
  if ("className" in body) fields.className = asString(body.className);
  if ("phone" in body) fields.phone = asString(body.phone);
  if ("email" in body) fields.email = asString(body.email);
  if ("address" in body) fields.address = asString(body.address);
  if ("monthlyFee" in body) fields.monthlyFee = asNumber(body.monthlyFee, 0);
  if ("group" in body) fields.group = body.group === "admin" ? "admin" : "student";

  if (!Object.keys(fields).length) {
    return json(400, { message: "No fields to update", code: "NO_UPDATES" });
  }

  const update = buildUpdateExpression(fields);

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { studentId },
        ConditionExpression: "attribute_exists(#id) AND (attribute_not_exists(#deletedAt) OR #deletedAt = :deletedAtNull)",
        ExpressionAttributeNames: {
          "#id": "studentId",
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
      return notFound("Student not found");
    }

    throw error;
  }
};

export const adminStudentsStudentIdRolePatch: Handler = async (event) => {
  const studentId = getPathParam(event, "studentId");
  const body = parseJsonBody(event);

  if (!studentId) {
    return notFound("Student not found");
  }

  const group = body.group === "admin" ? "admin" : "student";

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { studentId },
        ConditionExpression: "attribute_exists(#id) AND (attribute_not_exists(#deletedAt) OR #deletedAt = :deletedAtNull)",
        ExpressionAttributeNames: {
          "#id": "studentId",
          "#deletedAt": deletedAtField,
          "#group": "group"
        },
        ExpressionAttributeValues: {
          ":group": group,
          ":deletedAtNull": null
        },
        UpdateExpression: "SET #group = :group",
        ReturnValues: "ALL_NEW"
      })
    );

    return json(200, response.Attributes ?? {});
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return notFound("Student not found");
    }

    throw error;
  }
};

export const adminStudentsStudentIdDelete: Handler = async (event) => {
  const studentId = getPathParam(event, "studentId");

  if (!studentId) {
    return notFound("Student not found");
  }

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { studentId },
        ConditionExpression: "attribute_exists(#id) AND (attribute_not_exists(#deletedAt) OR #deletedAt = :deletedAtNull)",
        ExpressionAttributeNames: {
          "#id": "studentId",
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

    return json(200, { deleted: true, id: studentId, deletedAt: response.Attributes?.deletedAt ?? null });
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return notFound("Student not found");
    }

    throw error;
  }
};
