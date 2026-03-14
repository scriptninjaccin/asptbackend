import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Handler } from "../types/lambda";
import { AdmissionApplication } from "../types/contracts";
import { getPathParam, getQuery, json, notFound, nowIso, parseJsonBody } from "../utils/http";
import { getAdmissionsTable, getDdb } from "../utils/ddb";
import { getAdmissionsBucket, getAdmissionsPublicBaseUrl, getS3 } from "../utils/s3";

const ddb = getDdb();
const tableName = getAdmissionsTable();
const deletedAtField = "deletedAt";
const s3 = getS3();

const normalizeStatus = (value: unknown): AdmissionApplication["status"] | undefined => {
  if (value === "pending" || value === "approved" || value === "rejected") {
    return value;
  }

  return undefined;
};

const asString = (value: unknown): string => (value === null || value === undefined ? "" : String(value));

const asDocumentArray = (value: unknown): AdmissionApplication["documents"] => {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") {
      return { name: asString(entry) };
    }
    if (entry && typeof entry === "object") {
      return {
        name: asString((entry as Record<string, unknown>).name),
        type: asString((entry as Record<string, unknown>).type),
        url: asString((entry as Record<string, unknown>).url)
      };
    }
    return { name: "" };
  });
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

export const admissionsApplicationsPost: Handler = async (event) => {
  const body = parseJsonBody(event);

  const application: AdmissionApplication = {
    id: `APP-${Date.now()}`,
    studentId: asString(body.studentId),
    studentName: asString(body.studentName),
    fatherName: asString(body.fatherName),
    motherName: asString(body.motherName),
    className: asString(body.className),
    dob: asString(body.dob),
    phone: asString(body.phone),
    email: asString(body.email),
    address: asString(body.address),
    documents: asDocumentArray(body.documents),
    createdAt: nowIso(),
    status: "pending",
    reviewedAt: null,
    reviewedBy: null,
    deletedAt: null
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: application,
        ConditionExpression: "attribute_not_exists(#id)",
        ExpressionAttributeNames: { "#id": "id" }
      })
    );
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return json(409, { message: "Duplicate application", code: "DUPLICATE" });
    }

    throw error;
  }

  return json(201, application);
};

export const adminAdmissionsApplicationsGet: Handler = async (event) => {
  const status = normalizeStatus(getQuery(event, "status"));
  const q = getQuery(event, "q");

  const filters: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  addNotDeletedFilter(filters, names, values);

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

  return json(200, { applications: response.Items ?? [] });
};

export const adminAdmissionsApplicationsApplicationIdGet: Handler = async (event) => {
  const applicationId = getPathParam(event, "applicationId");

  if (!applicationId) {
    return notFound("Application not found");
  }

  const response = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: applicationId }
    })
  );

  if (!response.Item || (response.Item as AdmissionApplication).deletedAt) {
    return notFound("Application not found");
  }

  return json(200, response.Item);
};

export const adminAdmissionsApplicationsApplicationIdPatch: Handler = async (event) => {
  const applicationId = getPathParam(event, "applicationId");
  const body = parseJsonBody(event);

  if (!applicationId) {
    return notFound("Application not found");
  }

  const status = normalizeStatus(body.status);
  const fields: Record<string, unknown> = {};

  if ("studentId" in body) fields.studentId = asString(body.studentId);
  if ("studentName" in body) fields.studentName = asString(body.studentName);
  if ("fatherName" in body) fields.fatherName = asString(body.fatherName);
  if ("motherName" in body) fields.motherName = asString(body.motherName);
  if ("className" in body) fields.className = asString(body.className);
  if ("dob" in body) fields.dob = asString(body.dob);
  if ("phone" in body) fields.phone = asString(body.phone);
  if ("email" in body) fields.email = asString(body.email);
  if ("address" in body) fields.address = asString(body.address);
  if ("documents" in body) fields.documents = asDocumentArray(body.documents);
  if (status) fields.status = status;
  if ("reviewedAt" in body) fields.reviewedAt = body.reviewedAt === null ? null : asString(body.reviewedAt);
  if ("reviewedBy" in body) fields.reviewedBy = body.reviewedBy === null ? null : asString(body.reviewedBy);

  if (!Object.keys(fields).length) {
    return json(400, { message: "No fields to update", code: "NO_UPDATES" });
  }

  const update = buildUpdateExpression(fields);

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: applicationId },
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
      return notFound("Application not found");
    }

    throw error;
  }
};

export const adminAdmissionsApplicationsApplicationIdApprovePost: Handler = async (event) => {
  const applicationId = getPathParam(event, "applicationId");

  if (!applicationId) {
    return notFound("Application not found");
  }

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: applicationId },
        ConditionExpression: "attribute_exists(#id) AND (attribute_not_exists(#deletedAt) OR #deletedAt = :deletedAtNull)",
        ExpressionAttributeNames: {
          "#id": "id",
          "#status": "status",
          "#reviewedAt": "reviewedAt",
          "#reviewedBy": "reviewedBy",
          "#deletedAt": deletedAtField
        },
        ExpressionAttributeValues: {
          ":status": "approved",
          ":reviewedAt": nowIso(),
          ":reviewedBy": "admin",
          ":deletedAtNull": null
        },
        UpdateExpression: "SET #status = :status, #reviewedAt = :reviewedAt, #reviewedBy = :reviewedBy",
        ReturnValues: "ALL_NEW"
      })
    );

    return json(200, { application: response.Attributes ?? {} });
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return notFound("Application not found");
    }

    throw error;
  }
};

export const adminAdmissionsApplicationsApplicationIdRejectPost: Handler = async (event) => {
  const applicationId = getPathParam(event, "applicationId");
  const body = parseJsonBody(event);

  if (!applicationId) {
    return notFound("Application not found");
  }

  const reason = asString(body.reason);

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: applicationId },
        ConditionExpression: "attribute_exists(#id) AND (attribute_not_exists(#deletedAt) OR #deletedAt = :deletedAtNull)",
        ExpressionAttributeNames: {
          "#id": "id",
          "#status": "status",
          "#reviewedAt": "reviewedAt",
          "#reviewedBy": "reviewedBy",
          "#deletedAt": deletedAtField
        },
        ExpressionAttributeValues: {
          ":status": "rejected",
          ":reviewedAt": nowIso(),
          ":reviewedBy": "admin",
          ":deletedAtNull": null
        },
        UpdateExpression: "SET #status = :status, #reviewedAt = :reviewedAt, #reviewedBy = :reviewedBy",
        ReturnValues: "ALL_NEW"
      })
    );

    return json(200, { application: response.Attributes ?? {}, ...(reason ? { reason } : {}) });
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return notFound("Application not found");
    }

    throw error;
  }
};

export const adminAdmissionsApplicationsApplicationIdDelete: Handler = async (event) => {
  const applicationId = getPathParam(event, "applicationId");

  if (!applicationId) {
    return notFound("Application not found");
  }

  try {
    const response = await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: applicationId },
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

    return json(200, { deleted: true, id: applicationId, deletedAt: response.Attributes?.deletedAt ?? null });
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      return notFound("Application not found");
    }

    throw error;
  }
};

export const admissionsAttachmentsPresignPost: Handler = async (event) => {
  const bucket = getAdmissionsBucket();
  if (!bucket) {
    return json(400, { message: "S3_ADMISSIONS_BUCKET is not configured", code: "S3_BUCKET_MISSING" });
  }

  const body = parseJsonBody(event);
  const fileName = asString(body.name) || `admission-${Date.now()}`;
  const contentType = asString(body.type) || "application/octet-stream";
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const key = `admissions/${Date.now()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });
  const publicBaseUrl = getAdmissionsPublicBaseUrl() || `https://${bucket}.s3.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com`;
  const publicUrl = `${publicBaseUrl.replace(/\/$/, "")}/${key}`;

  return json(200, {
    uploadUrl,
    publicUrl,
    key
  });
};
