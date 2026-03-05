import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Handler } from "../types/lambda";
import { GalleryItem } from "../types/contracts";
import { getPathParam, getQuery, json, notFound, nowIso, parseJsonBody } from "../utils/http";
import { getDdb, getGalleryTable } from "../utils/ddb";

const ddb = getDdb();
const tableName = getGalleryTable();
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

export const galleryMediaGet: Handler = async (event) => {
  const rawType = getQuery(event, "type");
  const type = rawType === "video" ? "video" : rawType === "photo" ? "photo" : undefined;

  const filters: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  addNotDeletedFilter(filters, names, values);

  if (type) {
    names["#type"] = "type";
    values[":type"] = type;
    filters.push("#type = :type");
  }

  const response = await ddb.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: filters.join(" AND "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values
    })
  );

  return json(200, { items: response.Items ?? [] });
};

export const adminGalleryMediaPost: Handler = async (event) => {
  const body = parseJsonBody(event);
  const type = body.type === "video" ? "video" : "photo";

  const item: GalleryItem = {
    id: `GM-${Date.now()}`,
    type,
    title: asString(body.title),
    caption: asString(body.caption),
    src: asString(body.src || "https://example.com/media/uploaded"),
    createdAt: nowIso(),
    deletedAt: null
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(#id)",
        ExpressionAttributeNames: { "#id": "id" }
      })
    );
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return json(409, { message: "Duplicate gallery item", code: "DUPLICATE" });
    }

    throw error;
  }

  return json(201, item);
};

export const adminGalleryMediaMediaIdGet: Handler = async (event) => {
  const mediaId = getPathParam(event, "mediaId");

  if (!mediaId) {
    return notFound("Media not found");
  }

  const response = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: mediaId }
    })
  );

  if (!response.Item || (response.Item as GalleryItem).deletedAt) {
    return notFound("Media not found");
  }

  return json(200, response.Item);
};

export const adminGalleryMediaMediaIdPatch: Handler = async (event) => {
  const mediaId = getPathParam(event, "mediaId");
  const body = parseJsonBody(event);

  if (!mediaId) {
    return notFound("Media not found");
  }

  const fields: Record<string, unknown> = {};
  if ("type" in body) fields.type = body.type === "video" ? "video" : "photo";
  if ("title" in body) fields.title = asString(body.title);
  if ("caption" in body) fields.caption = asString(body.caption);
  if ("src" in body) fields.src = asString(body.src);

  if (!Object.keys(fields).length) {
    return json(400, { message: "No fields to update", code: "NO_UPDATES" });
  }

  const update = buildUpdateExpression(fields);

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: mediaId },
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
      return notFound("Media not found");
    }

    throw error;
  }
};

export const adminGalleryMediaMediaIdDelete: Handler = async (event) => {
  const mediaId = getPathParam(event, "mediaId");

  if (!mediaId) {
    return notFound("Media not found");
  }

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: mediaId },
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

    return json(200, { deleted: true, id: mediaId, deletedAt: response.Attributes?.deletedAt ?? null });
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return notFound("Media not found");
    }

    throw error;
  }
};
