import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export type JsonBody = unknown;

export type Handler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2>;

export interface RouteDef {
  method: string;
  path: string;
  handler: Handler;
}
