export function readTenantOnboardingCompleted(shop: {
  onboardingCompleted: boolean;
}): boolean {
  return shop.onboardingCompleted;
}