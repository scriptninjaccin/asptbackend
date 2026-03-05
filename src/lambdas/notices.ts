import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Handler } from "../types/lambda";
import { Notice } from "../types/contracts";
import { getPathParam, getQuery, json, notFound, nowIso, parseJsonBody } from "../utils/http";
import { getDdb, getNoticesTable } from "../utils/ddb";

const ddb = getDdb();
const tableName = getNoticesTable();
const deletedAtField = "deletedAt";

const asString = (value: unknown): string => (value === null || value === undefined ? "" : String(value));

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

const toDateValue = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const noticesLatestGet: Handler = async (event) => {
  const limit = Number(getQuery(event, "limit") ?? "20");
  const safeLimit = Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 50);

  const filters: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  addNotDeletedFilter(filters, names, values);

  const response = await ddb.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: filters.join(" AND "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values
    })
  );

  const notices = (response.Items ?? []) as Notice[];
  const sorted = [...notices].sort((a, b) => toDateValue(b.publishedAt) - toDateValue(a.publishedAt));

  return json(200, { notices: sorted.slice(0, safeLimit), source: "api" });
};

export const adminNoticesPost: Handler = async (event) => {
  const body = parseJsonBody(event);
  const publishedAtRaw = asString(body.publishedAt);

  const notice: Notice = {
    id: `N-${Date.now()}`,
    title: asString(body.title),
    body: asString(body.body),
    publishedAt: publishedAtRaw || nowIso().split("T")[0],
    deletedAt: null
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: notice,
        ConditionExpression: "attribute_not_exists(#id)",
        ExpressionAttributeNames: { "#id": "id" }
      })
    );
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return json(409, { message: "Duplicate notice", code: "DUPLICATE" });
    }

    throw error;
  }

  return json(201, notice);
};

export const adminNoticesNoticeIdGet: Handler = async (event) => {
  const noticeId = getPathParam(event, "noticeId");

  if (!noticeId) {
    return notFound("Notice not found");
  }

  const response = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: noticeId }
    })
  );

  if (!response.Item || (response.Item as Notice).deletedAt) {
    return notFound("Notice not found");
  }

  return json(200, response.Item);
};

export const adminNoticesNoticeIdPatch: Handler = async (event) => {
  const noticeId = getPathParam(event, "noticeId");
  const body = parseJsonBody(event);

  if (!noticeId) {
    return notFound("Notice not found");
  }

  const fields: Record<string, unknown> = {};
  if ("title" in body) fields.title = asString(body.title);
  if ("body" in body) fields.body = asString(body.body);
  if ("publishedAt" in body) fields.publishedAt = asString(body.publishedAt);

  if (!Object.keys(fields).length) {
    return json(400, { message: "No fields to update", code: "NO_UPDATES" });
  }

  const update = buildUpdateExpression(fields);

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: noticeId },
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
      return notFound("Notice not found");
    }

    throw error;
  }
};

export const adminNoticesNoticeIdDelete: Handler = async (event) => {
  const noticeId = getPathParam(event, "noticeId");

  if (!noticeId) {
    return notFound("Notice not found");
  }

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: noticeId },
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

    return json(200, { deleted: true, id: noticeId, deletedAt: response.Attributes?.deletedAt ?? null });
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return notFound("Notice not found");
    }

    throw error;
  }
};
