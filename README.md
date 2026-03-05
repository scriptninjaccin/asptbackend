# ASPT Backend Lambda (TypeScript)

## Structure

- `src/lambdas/`: Lambda logic grouped by domain (`public`, `admissions`, `notices`, `students`, `fees`, `gallery`)
- `src/types/`: Shared interfaces and type aliases
- `src/utils/http.ts`: HTTP utility helpers for lambda handlers
- `src/handlers.ts`: Exports all handlers and central route definitions
- `src/local/express.ts`: Local Express server that invokes the same Lambda handlers

## Local Testing

```bash
npm install
npm run dev:local
```

Server starts on `http://localhost:8080` by default.
Swagger UI is available at `http://localhost:8080/docs`.
Raw OpenAPI spec is served at `http://localhost:8080/openapi.yaml`.

## Build

```bash
npm run typecheck
npm run build
```

## Notes

- Request/response contracts are typed via `src/types/contracts.ts`.
- Handler signatures and route typing are in `src/types/lambda.ts`.
- Multipart endpoints remain scaffold-level and currently expect JSON-style body parsing for local testing.
