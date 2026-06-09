interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Digimon API MCP (digi-api.com).
 *
 * Data on Digimon creatures — search by name and get a Digimon's level, type,
 * attribute, fields, evolution lines, skills, and description. Keyless.
 */


const BASE = 'https://digi-api.com/api/v1';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_digimon',
    description:
      'Search the Digimon API by name (partial match) and list Digimon creatures. Omit name to list all. Returns id, name, and image for each match. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Partial Digimon name to search for. Omit to list all Digimon.' },
        limit: { type: 'number', description: 'Max results per page (default 20, max 100).' },
        page: { type: 'number', description: 'Zero-based page number (default 0).' },
      },
    },
  },
  {
    name: 'get_digimon',
    description:
      "Get full details for one Digimon by name or numeric id: its level, type, attribute, fields, evolution lines, and English description. Keyless.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'A Digimon name like "Agumon" or a numeric id like "1".' },
      },
      required: ['name'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'search_digimon':
        return await searchDigimon(args);
      case 'get_digimon':
        return await getDigimon(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function searchDigimon(args: Record<string, unknown>): Promise<unknown> {
  const rawLimit = typeof args.limit === 'number' ? args.limit : 20;
  const limit = Math.max(1, Math.min(100, Math.floor(rawLimit)));
  const rawPage = typeof args.page === 'number' ? args.page : 0;
  const page = Math.max(0, Math.floor(rawPage));

  const params = new URLSearchParams();
  const nameArg = typeof args.name === 'string' ? args.name.trim() : '';
  if (nameArg) params.set('name', nameArg);
  params.set('pageSize', String(limit));
  params.set('page', String(page));

  const data = (await digiGet(`/digimon?${params.toString()}`)) as {
    content?: Array<{ id?: unknown; name?: unknown; image?: unknown }>;
    pageable?: { totalElements?: unknown };
  };

  const content = Array.isArray(data.content) ? data.content : [];
  const digimon = content.map((d) => ({ id: d.id, name: d.name, image: d.image }));
  const count =
    typeof data.pageable?.totalElements === 'number' ? data.pageable.totalElements : digimon.length;

  return { count, digimon };
}

async function getDigimon(args: Record<string, unknown>): Promise<unknown> {
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (!name) return { error: 'Required argument "name" is missing. Pass a Digimon name like "Agumon" or a numeric id.' };

  const res = await fetch(`${BASE}/digimon/${encodeURIComponent(name)}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });

  if (res.status === 400 || res.status === 404) {
    return { error: 'digimon not found', name };
  }
  if (!res.ok) {
    const body = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
    return { error: `Digimon API: ${res.status} ${body}` };
  }

  const d = (await res.json()) as {
    id?: unknown;
    name?: unknown;
    images?: Array<{ href?: unknown }>;
    levels?: Array<{ level?: unknown }>;
    types?: Array<{ type?: unknown }>;
    attributes?: Array<{ attribute?: unknown }>;
    fields?: Array<{ field?: unknown }>;
    releaseDate?: unknown;
    descriptions?: Array<{ language?: unknown; description?: unknown }>;
    priorEvolutions?: Array<{ digimon?: unknown }>;
    nextEvolutions?: Array<{ digimon?: unknown }>;
  };

  const images = Array.isArray(d.images) ? d.images : [];
  const descriptions = Array.isArray(d.descriptions) ? d.descriptions : [];
  const english = descriptions.find((x) => {
    const lang = typeof x.language === 'string' ? x.language.toLowerCase() : '';
    return lang === 'en_us' || lang === 'english';
  });
  const chosenDesc = english ?? descriptions[0];

  return {
    id: d.id,
    name: d.name,
    image: images[0]?.href,
    levels: (Array.isArray(d.levels) ? d.levels : []).map((x) => x.level),
    types: (Array.isArray(d.types) ? d.types : []).map((x) => x.type),
    attributes: (Array.isArray(d.attributes) ? d.attributes : []).map((x) => x.attribute),
    fields: (Array.isArray(d.fields) ? d.fields : []).map((x) => x.field),
    release_date: d.releaseDate,
    description: chosenDesc?.description,
    prior_evolutions: (Array.isArray(d.priorEvolutions) ? d.priorEvolutions : []).map((x) => x.digimon),
    next_evolutions: (Array.isArray(d.nextEvolutions) ? d.nextEvolutions : []).map((x) => x.digimon),
  };
}

async function digiGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) {
    const body = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
    throw new Error(`Digimon API: ${res.status} ${body}`);
  }
  return res.json();
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
