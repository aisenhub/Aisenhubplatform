const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sameJson(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function resolvePointer(document, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('#/')) return null;
  return pointer
    .slice(2)
    .split('/')
    .reduce((value, segment) => {
      const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
      return isObject(value) || Array.isArray(value) ? value[key] : undefined;
    }, document);
}

function resolveNode(document, node) {
  if (!isObject(node) || typeof node.$ref !== 'string') return node;
  return resolvePointer(document, node.$ref);
}

function mediaSchema(media) {
  return isObject(media?.schema) ? media.schema : media;
}

function schemaTypeSignature(schema) {
  if (!isObject(schema)) return null;
  return JSON.stringify({
    type: schema.type ?? null,
    format: schema.format ?? null,
  });
}

function compareConstraint(name, before, after, location, failures) {
  const minimumKeys = ['minimum', 'exclusiveMinimum', 'minLength', 'minItems'];
  const maximumKeys = ['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems'];
  for (const key of minimumKeys) {
    if (
      typeof after?.[key] === 'number' &&
      (typeof before?.[key] !== 'number' || after[key] > before[key])
    )
      failures.push(`${name}: tightened request constraint ${location}.${key}`);
  }
  for (const key of maximumKeys) {
    if (
      typeof after?.[key] === 'number' &&
      (typeof before?.[key] !== 'number' || after[key] < before[key])
    )
      failures.push(`${name}: tightened request constraint ${location}.${key}`);
  }
  if (after?.pattern && before?.pattern !== after.pattern)
    failures.push(`${name}: changed request pattern at ${location}`);
}

function compareSchema(input) {
  const {
    name,
    beforeDocument,
    afterDocument,
    beforeSchema,
    afterSchema,
    location,
    direction,
    failures,
  } = input;
  const before = resolveNode(beforeDocument, beforeSchema);
  const after = resolveNode(afterDocument, afterSchema);
  if (!isObject(after)) {
    failures.push(`${name}: removed schema ${location}`);
    return;
  }
  if (!isObject(before)) return;

  if (schemaTypeSignature(before) !== schemaTypeSignature(after))
    failures.push(`${name}: changed type/format at ${location}`);
  if ('const' in before && !sameJson(before.const, after.const))
    failures.push(`${name}: changed const at ${location}`);
  if (direction === 'request' && !('const' in before) && 'const' in after)
    failures.push(`${name}: added request const at ${location}`);

  if (Array.isArray(before.enum)) {
    const next = new Set(Array.isArray(after.enum) ? after.enum : []);
    for (const value of before.enum) {
      if (!next.has(value))
        failures.push(
          `${name}: removed enum value ${location}=${JSON.stringify(value)}`,
        );
    }
  }

  if (direction === 'request')
    compareConstraint(name, before, after, location, failures);

  const beforeRequired = new Set(
    Array.isArray(before.required) ? before.required : [],
  );
  const afterRequired = new Set(
    Array.isArray(after.required) ? after.required : [],
  );
  if (direction === 'request') {
    for (const field of afterRequired) {
      if (!beforeRequired.has(field))
        failures.push(
          `${name}: added required request field ${location}.${field}`,
        );
    }
  } else if (direction === 'response') {
    for (const field of beforeRequired) {
      if (!afterRequired.has(field))
        failures.push(
          `${name}: response field became optional ${location}.${field}`,
        );
    }
  }

  const beforeProperties = isObject(before.properties) ? before.properties : {};
  const afterProperties = isObject(after.properties) ? after.properties : {};
  for (const [field, schema] of Object.entries(beforeProperties)) {
    if (!(field in afterProperties)) {
      failures.push(`${name}: removed property ${location}.${field}`);
      continue;
    }
    compareSchema({
      ...input,
      beforeSchema: schema,
      afterSchema: afterProperties[field],
      location: `${location}.${field}`,
    });
  }
  if (before.items) {
    if (!after.items)
      failures.push(`${name}: removed array items schema ${location}[]`);
    else
      compareSchema({
        ...input,
        beforeSchema: before.items,
        afterSchema: after.items,
        location: `${location}[]`,
      });
  }
}

function resolvedParameters(document, operation) {
  return (operation.parameters ?? [])
    .map((parameter) => resolveNode(document, parameter))
    .filter(isObject);
}

function compareRequestBody(
  name,
  route,
  method,
  beforeDocument,
  afterDocument,
  beforeOperation,
  afterOperation,
  failures,
) {
  const beforeBody = resolveNode(beforeDocument, beforeOperation.requestBody);
  const afterBody = resolveNode(afterDocument, afterOperation.requestBody);
  if (!beforeBody) {
    if (afterBody?.required)
      failures.push(
        `${name}: added required request body to ${method.toUpperCase()} ${route}`,
      );
    return;
  }
  if (!afterBody) {
    failures.push(
      `${name}: removed request body from ${method.toUpperCase()} ${route}`,
    );
    return;
  }
  if (!beforeBody.required && afterBody.required)
    failures.push(
      `${name}: made request body required on ${method.toUpperCase()} ${route}`,
    );
  for (const [mediaType, beforeMedia] of Object.entries(
    beforeBody.content ?? {},
  )) {
    const afterMedia = afterBody.content?.[mediaType];
    if (!afterMedia) {
      failures.push(
        `${name}: removed request media type ${mediaType} from ${method.toUpperCase()} ${route}`,
      );
      continue;
    }
    compareSchema({
      name,
      beforeDocument,
      afterDocument,
      beforeSchema: mediaSchema(beforeMedia),
      afterSchema: mediaSchema(afterMedia),
      location: `${method.toUpperCase()} ${route} request(${mediaType})`,
      direction: 'request',
      failures,
    });
  }
}

function compareResponses(
  name,
  route,
  method,
  beforeDocument,
  afterDocument,
  beforeOperation,
  afterOperation,
  failures,
) {
  for (const [status, beforeResponseRef] of Object.entries(
    beforeOperation.responses ?? {},
  )) {
    const afterResponseRef = afterOperation.responses?.[status];
    if (!afterResponseRef) {
      failures.push(
        `${name}: removed response ${status} from ${method.toUpperCase()} ${route}`,
      );
      continue;
    }
    const beforeResponse = resolveNode(beforeDocument, beforeResponseRef);
    const afterResponse = resolveNode(afterDocument, afterResponseRef);
    if (!beforeResponse || !afterResponse) continue;
    for (const [mediaType, beforeMedia] of Object.entries(
      beforeResponse.content ?? {},
    )) {
      const afterMedia = afterResponse.content?.[mediaType];
      if (!afterMedia) {
        failures.push(
          `${name}: removed response media type ${status} ${mediaType} from ${method.toUpperCase()} ${route}`,
        );
        continue;
      }
      compareSchema({
        name,
        beforeDocument,
        afterDocument,
        beforeSchema: mediaSchema(beforeMedia),
        afterSchema: mediaSchema(afterMedia),
        location: `${method.toUpperCase()} ${route} response ${status}(${mediaType})`,
        direction: 'response',
        failures,
      });
    }
  }
}

function compareOperation(
  name,
  route,
  method,
  beforeDocument,
  afterDocument,
  before,
  after,
  failures,
) {
  if (!after) {
    failures.push(
      `${name}: removed operation ${method.toUpperCase()} ${route}`,
    );
    return;
  }
  if (before.operationId !== after.operationId)
    failures.push(
      `${name}: changed operationId for ${method.toUpperCase()} ${route}`,
    );
  if (!sameJson(before.security, after.security))
    failures.push(
      `${name}: changed security for ${method.toUpperCase()} ${route}`,
    );

  const beforeParameters = new Map(
    resolvedParameters(beforeDocument, before).map((item) => [
      `${item.in}:${item.name}`,
      item,
    ]),
  );
  const afterParameters = new Map(
    resolvedParameters(afterDocument, after).map((item) => [
      `${item.in}:${item.name}`,
      item,
    ]),
  );
  for (const [key, previous] of beforeParameters) {
    const parameter = afterParameters.get(key);
    if (!parameter) {
      failures.push(
        `${name}: removed parameter ${key} from ${method.toUpperCase()} ${route}`,
      );
      continue;
    }
    if (!previous.required && parameter.required)
      failures.push(
        `${name}: made parameter required ${key} on ${method.toUpperCase()} ${route}`,
      );
    compareSchema({
      name,
      beforeDocument,
      afterDocument,
      beforeSchema: previous.schema,
      afterSchema: parameter.schema,
      location: `${method.toUpperCase()} ${route} parameter ${key}`,
      direction: 'request',
      failures,
    });
  }
  for (const [key, parameter] of afterParameters) {
    if (!beforeParameters.has(key) && parameter.required)
      failures.push(
        `${name}: added required parameter ${key} to ${method.toUpperCase()} ${route}`,
      );
  }

  compareRequestBody(
    name,
    route,
    method,
    beforeDocument,
    afterDocument,
    before,
    after,
    failures,
  );
  compareResponses(
    name,
    route,
    method,
    beforeDocument,
    afterDocument,
    before,
    after,
    failures,
  );
}

export function compareContractDocuments(name, before, after) {
  const failures = [];
  if (before.openapi !== after.openapi)
    failures.push(
      `${name}: changed OpenAPI dialect ${before.openapi} -> ${after.openapi}`,
    );
  for (const [route, pathItem] of Object.entries(before.paths ?? {})) {
    const afterPathItem = after.paths?.[route];
    if (!afterPathItem) {
      failures.push(`${name}: removed path ${route}`);
      continue;
    }
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!METHODS.has(method)) continue;
      compareOperation(
        name,
        route,
        method,
        before,
        after,
        operation,
        afterPathItem[method],
        failures,
      );
    }
  }
  const beforeSchemas = before.components?.schemas ?? {};
  const afterSchemas = after.components?.schemas ?? {};
  for (const [schemaName, schema] of Object.entries(beforeSchemas)) {
    compareSchema({
      name,
      beforeDocument: before,
      afterDocument: after,
      beforeSchema: schema,
      afterSchema: afterSchemas[schemaName],
      location: `#/components/schemas/${schemaName}`,
      direction: 'neutral',
      failures,
    });
  }
  return failures;
}
