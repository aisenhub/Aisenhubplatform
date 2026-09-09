import assert from 'node:assert/strict';

const LIMIT = 1024 * 1024;

class ConcurrencyGate {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
  }

  tryAcquire() {
    if (this.active >= this.limit) return false;
    this.active += 1;
    return true;
  }

  release() {
    this.active -= 1;
  }
}

class TimeoutError extends Error {
  constructor() {
    super('provider timeout');
    this.code = 'PROVIDER_TIMEOUT';
  }
}

function requestFrom(chunks, headers = {}) {
  return {
    headers: new Headers(headers),
    body: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
  };
}

function requestFromGenerator(generator, headers = {}) {
  return { headers: new Headers(headers), body: generator() };
}

async function receiveControlled(request, { gate, storage, limit = LIMIT }) {
  const declared = request.headers.get('content-length');
  const declaredLength = declared === null ? undefined : Number(declared);
  if (
    declaredLength !== undefined &&
    (!Number.isSafeInteger(declaredLength) || declaredLength < 0)
  ) {
    return {
      outcome: 'rejected',
      reason: 'invalid_content_length',
      storageCalls: storage.calls,
      bytes: 0,
      maxBufferedBytes: 0,
    };
  }
  if (declaredLength !== undefined && declaredLength > limit) {
    return {
      outcome: 'rejected',
      reason: 'declared_size_exceeded',
      storageCalls: storage.calls,
      bytes: 0,
      maxBufferedBytes: 0,
    };
  }
  if (!gate.tryAcquire()) {
    return {
      outcome: 'rejected',
      reason: 'concurrency_limit',
      storageCalls: storage.calls,
      bytes: 0,
      maxBufferedBytes: 0,
    };
  }

  let bytes = 0;
  let maxBufferedBytes = 0;
  const buffered = [];
  try {
    for await (const chunk of request.body) {
      const data = Buffer.from(chunk);
      bytes += data.byteLength;
      buffered.push(data);
      maxBufferedBytes = bytes;
      if (bytes > limit) {
        return {
          outcome: 'rejected',
          reason: 'actual_size_exceeded',
          storageCalls: storage.calls,
          bytes,
          maxBufferedBytes,
        };
      }
    }
    if (declaredLength !== undefined && declaredLength !== bytes) {
      return {
        outcome: 'rejected',
        reason: 'declared_size_mismatch',
        storageCalls: storage.calls,
        bytes,
        maxBufferedBytes,
      };
    }

    try {
      await storage.put(Buffer.concat(buffered));
      return {
        outcome: 'stored',
        reason: 'ok',
        storageCalls: storage.calls,
        bytes,
        maxBufferedBytes,
      };
    } catch (error) {
      if (error?.code === 'PROVIDER_TIMEOUT') {
        return {
          outcome: 'unknown',
          reason: 'provider_timeout',
          storageCalls: storage.calls,
          bytes,
          maxBufferedBytes,
        };
      }
      throw error;
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return {
        outcome: 'unknown',
        reason: 'body_aborted_before_storage',
        storageCalls: storage.calls,
        bytes,
        maxBufferedBytes,
      };
    }
    throw error;
  } finally {
    gate.release();
  }
}

function fakeStorage({ timeout = false } = {}) {
  return {
    calls: 0,
    async put() {
      this.calls += 1;
      if (timeout) throw new TimeoutError();
    },
  };
}

function bytes(length, fill = 0x61) {
  return Buffer.alloc(length, fill);
}

const exactStorage = fakeStorage();
const exact = await receiveControlled(requestFrom([bytes(LIMIT)]), {
  gate: new ConcurrencyGate(1),
  storage: exactStorage,
});
assert.equal(exact.outcome, 'stored');
assert.equal(exact.bytes, LIMIT);
assert.equal(exactStorage.calls, 1);

const emptyStorage = fakeStorage();
const empty = await receiveControlled(requestFrom([]), {
  gate: new ConcurrencyGate(1),
  storage: emptyStorage,
});
assert.equal(empty.outcome, 'stored');
assert.equal(empty.bytes, 0);
assert.equal(emptyStorage.calls, 1);

const declaredLargeStorage = fakeStorage();
const declaredLarge = await receiveControlled(
  requestFrom([], { 'content-length': String(LIMIT + 1) }),
  {
    gate: new ConcurrencyGate(1),
    storage: declaredLargeStorage,
  },
);
assert.equal(declaredLarge.reason, 'declared_size_exceeded');
assert.equal(declaredLargeStorage.calls, 0);

const declaredSmallStorage = fakeStorage();
const declaredSmall = await receiveControlled(
  requestFrom([bytes(LIMIT + 1)], { 'content-length': '1' }),
  {
    gate: new ConcurrencyGate(1),
    storage: declaredSmallStorage,
  },
);
assert.equal(declaredSmall.reason, 'actual_size_exceeded');
assert.equal(declaredSmallStorage.calls, 0);

const chunkedStorage = fakeStorage();
const chunked = await receiveControlled(
  requestFrom([bytes(700_000), bytes(348_577)]),
  {
    gate: new ConcurrencyGate(1),
    storage: chunkedStorage,
  },
);
assert.equal(chunked.reason, 'actual_size_exceeded');
assert.equal(chunkedStorage.calls, 0);

const encodedStorage = fakeStorage();
const encoded = await receiveControlled(
  requestFrom([bytes(LIMIT + 1)], { 'content-encoding': 'gzip' }),
  {
    gate: new ConcurrencyGate(1),
    storage: encodedStorage,
  },
);
assert.equal(encoded.reason, 'actual_size_exceeded');
assert.equal(encodedStorage.calls, 0);

const abortStorage = fakeStorage();
const abort = await receiveControlled(
  requestFromGenerator(async function* () {
    yield bytes(16);
    const error = new Error('client disconnected');
    error.name = 'AbortError';
    throw error;
  }),
  {
    gate: new ConcurrencyGate(1),
    storage: abortStorage,
  },
);
assert.equal(abort.outcome, 'unknown');
assert.equal(abort.reason, 'body_aborted_before_storage');
assert.equal(abortStorage.calls, 0);

const timeoutStorage = fakeStorage({ timeout: true });
const timeout = await receiveControlled(requestFrom([bytes(32)]), {
  gate: new ConcurrencyGate(1),
  storage: timeoutStorage,
});
assert.equal(timeout.outcome, 'unknown');
assert.equal(timeout.reason, 'provider_timeout');
assert.equal(timeoutStorage.calls, 1);

let releaseFirstBody;
const firstBodyReady = new Promise((resolve) => {
  releaseFirstBody = resolve;
});
let firstBodyReads = 0;
let secondBodyReads = 0;
const gate = new ConcurrencyGate(1);
const first = receiveControlled(
  requestFromGenerator(async function* () {
    firstBodyReads += 1;
    yield bytes(32);
    await firstBodyReady;
  }),
  { gate, storage: fakeStorage() },
);
await new Promise((resolve) => setImmediate(resolve));
const second = await receiveControlled(
  requestFromGenerator(async function* () {
    secondBodyReads += 1;
    yield bytes(32);
  }),
  { gate, storage: fakeStorage() },
);
assert.equal(second.reason, 'concurrency_limit');
assert.equal(secondBodyReads, 0);
releaseFirstBody();
const firstResult = await first;
assert.equal(firstResult.outcome, 'stored');
assert.equal(firstBodyReads, 1);

console.log(
  JSON.stringify({
    limitBytes: LIMIT,
    exact1MiB: 'PASS',
    zeroBytes: 'PASS',
    declaredSizeAndActualBytes: 'PASS',
    chunked: 'PASS',
    contentEncoding: 'PASS',
    abortBeforeStorage: 'PASS',
    providerTimeout: 'UNKNOWN_AND_BUDGET_HELD',
    concurrencyBeforeBodyRead: 'PASS',
    maxBufferedBytes: Math.max(
      exact.maxBufferedBytes,
      chunked.maxBufferedBytes,
    ),
  }),
);
