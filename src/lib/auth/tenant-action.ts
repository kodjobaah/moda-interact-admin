export async function runProtectedTenantAction<T>(
  formData: FormData,
  requireAdmin: () => Promise<unknown>,
  mutate: (formData: FormData) => Promise<T>,
): Promise<T> {
  await requireAdmin();
  return mutate(formData);
}