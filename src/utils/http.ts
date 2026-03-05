import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { JsonBody } from "../types/lambda";

export const nowIso = (): string => new Date().toISOString();

export const json = (statusCode: number, body: JsonBody): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

export const getPathParam = (event: APIGatewayProxyEventV2, name: string): string | undefined =>
  event.pathParameters?.[name];

export const getQuery = (event: APIGatewayProxyEventV2, name: string): string | undefined =>
  event.queryStringParameters?.[name];

export const parseJsonBody = (event: APIGatewayProxyEventV2): Record<string, unknown> => {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const notFound = (message: string, code = "NOT_FOUND"): APIGatewayProxyStructuredResultV2 =>
  json(404, { message, code });

export const methodNotAllowed = (): APIGatewayProxyStructuredResultV2 =>
  json(405, { message: "Method not allowed", code: "METHOD_NOT_ALLOWED" });
