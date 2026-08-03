import type { SchemaValidationRequest, SchemaValidationResponse } from "./types";

export class SchemaWorkerClient {
  #worker: Worker | undefined;
  #sequence = 0;

  constructor(private readonly timeoutMs = 3000) {}

  #createWorker(): Worker {
    this.#worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    return this.#worker;
  }

  validate(request: Omit<SchemaValidationRequest, "requestId">): Promise<SchemaValidationResponse> {
    const requestId = ++this.#sequence;
    const worker = this.#createWorker();
    return new Promise((resolve) => {
      const cleanup = () => {
        clearTimeout(timeout);
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
      };
      const handleMessage = (event: MessageEvent<SchemaValidationResponse>) => {
        if (event.data.requestId !== requestId || requestId !== this.#sequence) return;
        cleanup();
        resolve(event.data);
      };
      const handleError = (event: ErrorEvent) => {
        cleanup();
        this.#worker?.terminate();
        this.#worker = undefined;
        resolve({ requestId, valid: false, notices: [], problems: [{ keyword: "worker", instancePath: "", schemaPath: "", message: `Validation worker failed: ${event.message}`, params: {} }] });
      };
      const timeout = window.setTimeout(() => {
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
        this.#worker?.terminate();
        this.#worker = undefined;
        resolve({ requestId, valid: false, notices: [], problems: [{ keyword: "validation-timeout", instancePath: "", schemaPath: "", message: `Validation exceeded ${this.timeoutMs} ms and was stopped.`, params: { timeoutMs: this.timeoutMs } }] });
      }, this.timeoutMs);
      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      worker.postMessage({ ...request, requestId } satisfies SchemaValidationRequest);
    });
  }

  cancel(): void {
    this.#sequence += 1;
  }

  dispose(): void {
    this.#worker?.terminate();
    this.#worker = undefined;
  }
}
