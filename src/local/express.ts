import { APIGatewayProxyEventV2 } from "aws-lambda";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { Handler } from "../types/lambda";
import { json } from "../utils/http";

const env = process.env.NODE_ENV ?? "development";
const envPath = path.resolve(process.cwd(), `.env.${env}`);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

// eslint-disable-next-line no-console
console.log(`Loaded env: NODE_ENV=${process.env.NODE_ENV ?? "development"}, DDB_ENDPOINT_URL=${process.env.DDB_ENDPOINT_URL ?? "(unset)"}`);

// Require handlers after env is loaded so DynamoDB client picks up local settings.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { routeDefs } = require("../handlers") as typeof import("../handlers");

const app = express();
const port = Number(process.env.PORT ?? "8080");
const apiBasePath = "/api";
const openApiPath = path.resolve(process.cwd(), "openapi.yaml");
const openApiDocument = YAML.load(openApiPath);

app.use((req, res, next) => {
  const origin = req.headers.origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json({ limit: "5mb" }));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.get("/openapi.yaml", (_req, res) => {
  res.sendFile(openApiPath);
});

const toLambdaEvent = (req: Request): APIGatewayProxyEventV2 => {
  const queryStringParameters = Object.keys(req.query).length
    ? Object.entries(req.query).reduce<Record<string, string>>((acc, [key, value]) => {
        if (Array.isArray(value)) {
          acc[key] = String(value[0]);
        } else if (value !== undefined) {
          acc[key] = String(value);
        }
        return acc;
      }, {})
    : undefined;

  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: req.path,
    rawQueryString: req.url.includes("?") ? req.url.split("?")[1] : "",
    headers: Object.entries(req.headers).reduce<Record<string, string>>((acc, [k, v]) => {
      if (typeof v === "string") {
        acc[k] = v;
      }
      return acc;
    }, {}),
    queryStringParameters,
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "localhost",
      http: {
        method: req.method,
        path: req.path,
        protocol: "HTTP/1.1",
        sourceIp: req.ip || "127.0.0.1",
        userAgent: req.get("user-agent") || "local-test"
      },
      requestId: `local-${Date.now()}`,
      routeKey: "$default",
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now()
    },
    isBase64Encoded: false,
    pathParameters: Object.keys(req.params).length ? req.params : undefined,
    body: req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : undefined
  };
};

const invoke = (handler: Handler) => async (req: Request, res: Response) => {
  const event = toLambdaEvent(req);

  try {
    const result = await handler(event);

    if (result.headers) {
      Object.entries(result.headers).forEach(([key, value]) => {
        if (value !== undefined) {
          res.setHeader(key, String(value));
        }
      });
    }

    res.status(result.statusCode ?? 200);

    if (result.body) {
      res.send(result.body);
    } else {
      res.end();
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Unhandled handler error", err);
    const response = json(500, { message: "Internal server error", code: "INTERNAL_ERROR" });
    res.status(response.statusCode ?? 500);
    if (response.body) {
      res.send(response.body);
    } else {
      res.end();
    }
  }
};

for (const def of routeDefs) {
  const expressPath = def.path;
  const prefixedPath = `${apiBasePath}${def.path}`;
  const method = def.method.toLowerCase() as "get" | "post" | "patch";
  app[method](expressPath, invoke(def.handler));
  app[method](prefixedPath, invoke(def.handler));
}

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Local API server running at http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger UI available at http://localhost:${port}/docs`);
});

