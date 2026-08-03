import Ajv, { type AnySchema } from "ajv";
import type AjvCore from "ajv/dist/core";
import Ajv2019 from "ajv/dist/2019";
import Ajv2020 from "ajv/dist/2020";
import AjvDraft04 from "ajv-draft-04";
import addFormats from "ajv-formats";

import { prepareSchemas, scanReferences } from "./references";
import type { SchemaNotice, SchemaProblem, SchemaValidationRequest, SchemaValidationResponse } from "./types";

type JsonObject = Record<string, unknown>;

function schemaObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function ajvFor(schema: unknown): { ajv?: AjvCore; notice?: SchemaValidationResponse["notices"][number]; unsupported?: SchemaProblem } {
  const uri = schemaObject(schema)?.$schema;
  const options = { allErrors: true, strict: true, verbose: true, validateFormats: true } as const;
  let ajv: AjvCore;
  if (uri === undefined) {
    ajv = new Ajv2020(options);
    addFormats(ajv);
    return { ajv, notice: { ruleId: "schema/draft-default", severity: "info", message: "JSON Schema draft was not declared; Draft 2020-12 was used.", explanation: "Add a `$schema` URI when a different draft is required." } };
  }
  const value = String(uri);
  if (/draft-04/.test(value)) ajv = new AjvDraft04(options) as AjvCore;
  else if (/draft-07/.test(value)) ajv = new Ajv(options);
  else if (/2019-09/.test(value)) ajv = new Ajv2019(options);
  else if (/2020-12/.test(value)) ajv = new Ajv2020(options);
  else return { unsupported: { keyword: "schema-draft", instancePath: "", schemaPath: "$schema", message: `Unsupported JSON Schema draft \`${value}\`. Supported drafts are 4, 7, 2019-09, and 2020-12.`, params: { draft: value } } };
  addFormats(ajv);
  return { ajv };
}

function serializeErrors(errors: AjvCore["errors"]): SchemaProblem[] {
  return (errors ?? []).map((error) => ({
    keyword: error.keyword,
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    message: error.message ?? "The schema constraint was not satisfied",
    params: error.params,
    ...("data" in error ? { data: error.data } : {}),
  }));
}

function normalizeDraft04Identifier(schema: unknown): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const value = schema as JsonObject;
  if (typeof value.$id !== "string") return schema;
  const { $id, ...rest } = value;
  return { ...rest, id: $id };
}

export function validateSchemaRequest(request: SchemaValidationRequest): SchemaValidationResponse {
  const notices: SchemaNotice[] = [];
  try {
    const referenceIssues = scanReferences(request.primary.schema, request.referenceMode, request.dependencies);
    if (referenceIssues.length) return {
      requestId: request.requestId,
      valid: false,
      notices,
      problems: referenceIssues.map((issue) => ({ keyword: issue.ruleId.split("/").at(-1) ?? "reference", instancePath: "", schemaPath: "$ref", message: issue.message, params: { reference: issue.reference } })),
    };
    const { ajv, notice, unsupported } = ajvFor(request.primary.schema);
    if (notice) notices.push(notice);
    if (!ajv || unsupported) return { requestId: request.requestId, valid: false, notices, problems: unsupported ? [unsupported] : [] };
    const prepared = prepareSchemas(request.primary.schema, request.primary.fileName, request.dependencies);
    const draft04 = /draft-04/.test(String(schemaObject(request.primary.schema)?.$schema ?? ""));
    for (const dependency of prepared.dependencies) ajv.addSchema((draft04 ? normalizeDraft04Identifier(dependency.schema) : dependency.schema) as AnySchema);
    const primary = (draft04 ? normalizeDraft04Identifier(prepared.primary) : prepared.primary) as AnySchema;
    if (!ajv.validateSchema(primary)) return { requestId: request.requestId, valid: false, notices, problems: serializeErrors(ajv.errors).map((problem) => ({ ...problem, keyword: "schema-invalid", message: `Uploaded JSON Schema is invalid: ${problem.message}` })) };
    const validate = ajv.compile(primary);
    const valid = validate(request.value);
    return { requestId: request.requestId, valid: Boolean(valid), notices, problems: serializeErrors(validate.errors) };
  } catch (error) {
    return {
      requestId: request.requestId,
      valid: false,
      notices,
      problems: [{
        keyword: "schema-compile",
        instancePath: "",
        schemaPath: "",
        message: `JSON Schema could not be compiled: ${error instanceof Error ? error.message : String(error)}`,
        params: {},
      }],
    };
  }
}

if (typeof document === "undefined" && typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("message", (event: MessageEvent<SchemaValidationRequest>) => {
    globalThis.postMessage(validateSchemaRequest(event.data));
  });
}
