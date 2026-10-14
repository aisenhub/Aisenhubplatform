export async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The body may already be consumed, locked, or closed. Discarding is best-effort.
  }
}
