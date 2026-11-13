/** Embedded contract; keep its bytes synchronized with schemas/api-projection.schema.json. */
export const API_PROJECTION_SCHEMA_TEXT = String.raw`{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://evidence.local/api-snapshot/v5/api-projection.schema.json",
  "type": "object",
  "required": [
    "schemaVersion",
    "apiId",
    "mode",
    "modelId",
    "modelName",
    "modelVersion",
    "routes",
    "hypermedia",
    "services",
    "links",
    "openapi",
    "deployment",
    "limitations",
    "journeys",
    "diagnostics",
    "digests"
  ],
  "properties": {
    "schemaVersion": { "const": "5.1" },
    "apiId": { "type": "string", "minLength": 1 },
    "mode": { "const": "draft" },
    "modelId": { "type": "string" },
    "modelName": { "type": "string" },
    "modelVersion": { "type": "string" },
    "routes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "operationId",
          "method",
          "path",
          "entityRef",
          "fields",
          "derived",
          "stamped",
          "responses",
          "shape",
          "itemPath",
          "allowedPartyRoleRefs",
          "exposure",
          "outputFields",
          "rules"
        ],
        "properties": {
          "id": { "type": "string" },
          "operationId": { "type": "string" },
          "method": { "enum": ["GET", "POST"] },
          "path": { "type": "string", "pattern": "^/" },
          "entityRef": { "type": "string" },
          "fields": { "type": "array" },
          "derived": { "type": "array" },
          "stamped": { "type": "array" },
          "responses": { "type": "array" },
          "shape": { "enum": ["singleton", "collection"] },
          "itemPath": { "type": "string", "pattern": "^/" },
          "allowedPartyRoleRefs": {
            "type": "array",
            "uniqueItems": true,
            "items": { "type": "string" }
          },
          "exposure": { "enum": ["external", "internal"] },
          "outputFields": { "type": "array" },
          "rules": { "type": "array" }
        }
      }
    },
    "hypermedia": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "sourceRouteId",
          "targetRouteId",
          "rel",
          "href",
          "method",
          "templated"
        ],
        "properties": {
          "sourceRouteId": { "type": "string" },
          "targetRouteId": { "type": "string" },
          "rel": { "type": "string" },
          "href": { "type": "string" },
          "method": { "enum": ["GET", "POST"] },
          "templated": { "type": "boolean" }
        },
        "additionalProperties": false
      }
    },
    "services": { "type": "array", "items": { "type": "object" } },
    "links": { "type": "array", "items": { "type": "object" } },
    "openapi": {
      "type": "object",
      "required": ["openapi", "info", "paths", "components"],
      "properties": {
        "openapi": { "const": "3.1.0" },
        "info": { "type": "object" },
        "paths": { "type": "object" },
        "components": { "type": "object" }
      }
    },
    "deployment": {
      "type": "object",
      "required": ["version", "services"],
      "properties": {
        "version": { "const": "3" },
        "services": { "type": "object" }
      }
    },
    "limitations": { "type": "array", "items": { "type": "string" } },
    "journeys": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "roleRef",
          "routeId",
          "method",
          "path",
          "purpose",
          "nextPossibleSteps"
        ],
        "properties": {
          "id": { "type": "string" },
          "roleRef": { "type": "string" },
          "routeId": { "type": "string" },
          "method": { "type": "string" },
          "path": { "type": "string" },
          "purpose": { "type": "string" },
          "nextPossibleSteps": {
            "type": "array",
            "items": { "type": "string" }
          }
        },
        "additionalProperties": false
      }
    },
    "diagnostics": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["code", "severity", "message"],
        "properties": {
          "code": { "type": "string" },
          "severity": { "enum": ["error", "gap", "warning"] },
          "message": { "type": "string" }
        }
      }
    },
    "digests": {
      "type": "object",
      "required": ["model"],
      "properties": {
        "model": { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
        "design": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
        "checkReport": { "type": "string", "pattern": "^[a-f0-9]{64}$" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
`;

export const API_PROJECTION_SCHEMA: Record<string, unknown> = JSON.parse(
  API_PROJECTION_SCHEMA_TEXT,
);
