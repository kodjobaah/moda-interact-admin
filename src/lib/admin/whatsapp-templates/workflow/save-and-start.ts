/** Two durable operations by design: the immutable save must commit before
 * requesting translation. A queue/configuration failure never loses the saved
 * identity or pretends that the English save failed. */
export async function saveAndStartRecoveryWorkflow(ports: {
  save: () => Promise<{ id: string }>;
  start: (definitionId: string) => Promise<unknown>;
  onStartFailure: (definitionId: string, error: unknown) => void;
}): Promise<{ id: string; translationsRequested: boolean }> {
  const saved = await ports.save();
  try {
    await ports.start(saved.id);
    return { id: saved.id, translationsRequested: true };
  } catch (error) {
    ports.onStartFailure(saved.id, error);
    return { id: saved.id, translationsRequested: false };
  }
}
