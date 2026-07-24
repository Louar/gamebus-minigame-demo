import z from 'zod/v4';

export const PropertyVisibility = {
  public: 'public',
  private: 'private',
  hidden: 'hidden',
} as const;
export type PropertyVisibility = (typeof PropertyVisibility)[keyof typeof PropertyVisibility];

const strip = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') return undefined;

  if (Array.isArray(value)) {
    return value
      .map(strip)
      .filter((item) => item !== undefined);
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, val]) => [key, strip(val)] as const)
        .filter(([, val]) => val !== undefined)
    );
  }

  return value;
};

export const activitySchema = z.object({
  template: z.string().min(1),
  provider: z.string().nullish(),
  start: z.coerce.date<string>().default(new Date()),
  end: z.coerce.date<string>().default(new Date()),
  properties: z.object({
    template: z.string().min(1),
    obj: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).transform(strip),
    visibility: z.enum(PropertyVisibility).nullish(),
  }).array(),
  actors: z.union([z.string(), z.array(z.string())]).nullish(),
  onlyPersistIfContributing: z.boolean().default(false).optional(),
});

export type EmbeddedActivityMessage = {
  type: 'ACTIVITY' | 'SILENT_ACTIVITY';
  data: z.input<typeof activitySchema> | z.infer<typeof activitySchema>;
};

export type EmbeddedNavigateMessage = {
  type: 'NAVIGATE';
  data: string | { path?: string; href?: string; url?: string };
};

export type EmbeddedInputCollectionsMessage = {
  type: 'INPUT_COLLECTIONS';
  data?: unknown;
};

export type EmbeddedReadyMessage = {
  type: 'IFRAME_READY';
  data?: {
    height?: number;
  };
};

export type EmbeddedTaskMessage = {
  type: 'TASK';
  data?: {
    id: string;
    href: string | null;
    type: string;
    url: string | null;
    order: number;
    title: string | null;
    description: string | null;
    thumbnail: string | null;
    hero: string | null;
    cycle: unknown;
    isVisible: boolean;

    activityTemplates: {
      id: string;
      reference: string;
      name: string | null;
      providers: {
        reference: string;
        origins: unknown;
      }[];
    }[];

    inputCollections: {
      id: string;
      key: string;
      inputRequests: {
        id: string;
        key: string;
        endpoint: string;
        doFailOnError: boolean;
        doFailOnEmpty: boolean;
      }[];
    }[];

    propertyTemplates: {
      id: string;
      reference: string;
      name: string | null;
      schema: unknown;
      defaultVisibility: string;
    }[];

    taskRules: {
      id: string;
      order: number;
      description: string | null;
      complianceExpression: string | null;
      taskRuleOutcomes: {
        id: string;
        skillId: string;
        skillHref: string;
        skillName: string | null;
        completionPercentageExpression: string | null;
      }[];
    }[];
  };
};

export type ResolvedInputCollections = Record<string, Record<string, unknown>> | object;
