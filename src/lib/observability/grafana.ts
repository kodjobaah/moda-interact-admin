type GrafanaLink = {
  labelKey: string;
  descriptionKey: string;
  href: string;
};

export type GrafanaNavigation = {
  environment: string;
  baseUrl: string | null;
  links: GrafanaLink[];
  configured: boolean;
};

const ALLOWED_ENVIRONMENTS = new Set(['development', 'test', 'production']);

function resolveEnvironment(): string {
  return (
    process.env.DEPLOYMENT_ENVIRONMENT_NAME?.trim().toLowerCase() ||
    process.env.NODE_ENV?.trim().toLowerCase() ||
    'unknown'
  );
}

function validateUrl(raw: string | undefined, environment: string): string | null {
  if (!raw?.trim() || !ALLOWED_ENVIRONMENTS.has(environment)) return null;

  try {
    const url = new URL(raw.trim());
    const localDevelopment =
      environment === 'development' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

    if (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:')) {
      return null;
    }

    if (url.username || url.password) return null;

    return url.toString();
  } catch {
    return null;
  }
}

export function getGrafanaNavigation(): GrafanaNavigation {
  const environment = resolveEnvironment();
  const baseUrl = validateUrl(process.env.GRAFANA_BASE_URL, environment);
  const candidates: Array<[string, string, string | undefined]> = [
    [
      'observability.dashboard',
      'observability.dashboardDescription',
      process.env.GRAFANA_PLATFORM_DASHBOARD_URL,
    ],
    ['observability.logs', 'observability.logsDescription', process.env.GRAFANA_LOGS_URL],
    ['observability.traces', 'observability.tracesDescription', process.env.GRAFANA_TRACES_URL],
    ['observability.metrics', 'observability.metricsDescription', process.env.GRAFANA_METRICS_URL],
  ];

  const links = candidates.flatMap(([label, description, raw]) => {
    const href = validateUrl(raw, environment);
    return href ? [{ labelKey: label, descriptionKey: description, href }] : [];
  });

  return {
    environment,
    baseUrl,
    links,
    configured: baseUrl !== null || links.length > 0,
  };
}
