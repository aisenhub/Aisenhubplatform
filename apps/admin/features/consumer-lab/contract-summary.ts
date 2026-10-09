import generatedContractSummaries from './contract-summaries.generated.json';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

type SecurityRequirement = Record<string, readonly unknown[]>;
type OpenApiOperation = {
  readonly operationId?: string;
  readonly security?: readonly SecurityRequirement[];
};
type OpenApiPathItem = Partial<
  Record<(typeof HTTP_METHODS)[number], OpenApiOperation>
>;
type OpenApiDocument = {
  readonly info?: { readonly title?: string; readonly version?: string };
  readonly paths?: Readonly<Record<string, OpenApiPathItem>>;
  readonly components?: {
    readonly securitySchemes?: Readonly<Record<string, unknown>>;
  };
};

export type ContractOperationSummary = {
  readonly method: string;
  readonly path: string;
  readonly operationId: string;
  readonly security: readonly string[];
};

export type ContractSummary = {
  readonly title: string;
  readonly major: string;
  readonly version: string;
  readonly securitySchemes: readonly string[];
  readonly operations: readonly ContractOperationSummary[];
};

function securityNames(
  requirements: readonly SecurityRequirement[] | undefined,
) {
  return [
    ...new Set((requirements ?? []).flatMap((entry) => Object.keys(entry))),
  ].sort();
}

export function summarizeContract(
  document: OpenApiDocument,
  major: string,
): ContractSummary {
  const operations: ContractOperationSummary[] = [];
  for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      operations.push({
        method: method.toUpperCase(),
        path: route,
        operationId: operation.operationId ?? 'missing-operation-id',
        security: securityNames(operation.security),
      });
    }
  }
  return {
    title: document.info?.title ?? 'Unnamed contract',
    major,
    version: document.info?.version ?? 'unknown',
    securitySchemes: Object.keys(
      document.components?.securitySchemes ?? {},
    ).sort(),
    operations: operations.sort((left, right) =>
      `${left.path}:${left.method}`.localeCompare(
        `${right.path}:${right.method}`,
      ),
    ),
  };
}

export const accountContractSummary =
  generatedContractSummaries.account as ContractSummary;
export const adminContractSummary =
  generatedContractSummaries.admin as ContractSummary;
