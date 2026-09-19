// Fetches real-world reference data (intro text, spec infobox, lead photo) from Wikipedia so the CAD
// generator works from actual dimensions instead of guessing. Server-side only; free API, no key.
const API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'AgenticCAD/0.1 (https://github.com/MananKakkar1/agentic-cad; reference lookup for CAD generation)';
const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 1_200_000;
const MAX_INFOBOX_LINES = 45;
const MAX_EXTRACT_CHARS = 2400;
const MAX_CANDIDATES = 3;
const cache = new Map();
const FILLER = new Set([
    'a', 'an', 'the', 'of', 'for', 'with', 'and', 'or', 'in', 'on', 'to', 'me', 'my', 'make', 'create', 'generate', 'build', 'design', 'cad', 'render',
    'high', 'detail', 'detailed', 'highly', 'realistic', 'accurate', 'accurately', 'intricate', 'full', 'complete', 'simple', 'small', 'large', 'big', '3d', 'printable',
    'please', 'that', 'is', 'like', 'style', 'version', 'inspired',
]);
// An article is only worth attaching if its infobox carries at least one real measurement: either a spec-like key
// (length, wingspan, wheelbase, ...) or any value with a number and a unit (e.g. "330 m").
const SPEC_KEY_RE = /^(length|width|height|wheelbase|track|weight|curb_weight|mass|diameter|wingspan|span|chord|displacement|capacity|depth|thickness|empty_weight|gross_weight|max_takeoff_weight|max_speed)(_m|_kg|_mm|_cm)?$/;
const MEASURE_VALUE_RE = /(^|[^\w.])\d[\d,]*(\.\d+)?\s?(mm|cm|m|km|kg|tonnes?|ft|lb|lbs)\b/i;
const hasMeasurements = (box) => box.some(([key, value]) => SPEC_KEY_RE.test(key) || MEASURE_VALUE_RE.test(value));
// Imperial/duplicate variants (aircraft specs list every value in several units) add noise.
const REDUNDANT_KEYS = /_(ft|in|lb|lbs|note|notes|mph|kn|nmi|sqft|ftmin|kmh)$/;
const DIMENSION_KEYS = ['length', 'width', 'height', 'wheelbase', 'track', 'weight', 'curb_weight', 'mass', 'diameter', 'wingspan', 'span', 'chord', 'displacement', 'capacity', 'engine', 'body_style', 'layout', 'production', 'name'];
const SKIP_KEYS = /^(image|caption|alt|imagesize|image_size|image_upright|upright|logo|logo_size|footnotes?|website|url|native_name|native_name_lang|module|embed|child|list_style|border|bodystyle_?text)/i;
const tokenize = (text) => text
    .toLowerCase()
    .replace(/\b([a-z])-(\d)/g, '$1$2')
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 || /^\d$/.test(token));
export function cleanQuery(prompt) {
    return tokenize(prompt)
        .filter((token) => !FILLER.has(token) && !/^\d+(\.\d+)?(mm|cm|m|in|inch|ft|kg|g)$/.test(token))
        .join(' ')
        .trim();
}
async function api(params) {
    const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', ...params })}`;
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok)
        throw new Error(`Wikipedia API ${response.status}`);
    return response.json();
}
// ---- wikitext cleaning -------------------------------------------------------------------------
function convertTemplate(args) {
    const [value, second, third, fourth] = args;
    if (!value)
        return '';
    if (second && /^(to|-|–|and|by|x|×)$/i.test(second.trim()) && third)
        return `${value.trim()} ${second.trim()} ${third.trim()} ${(fourth ?? '').trim()}`.trim();
    return `${value.trim()} ${(second ?? '').trim()}`.trim();
}
function cleanValue(raw) {
    let text = raw
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<ref[^>/]*\/>/gi, '')
        .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
        .replace(/<br\s*\/?>/gi, ', ')
        .replace(/<[^>]+>/g, '');
    // Resolve {{...}} templates innermost-first.
    for (let i = 0; i < 8 && text.includes('{{'); i += 1) {
        text = text.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => {
            const parts = inner.split('|').map((part) => part.trim());
            const name = (parts.shift() ?? '').toLowerCase();
            const positional = parts.filter((part) => !/^\w+=/.test(part));
            if (name === 'convert' || name === 'cvt')
                return convertTemplate(positional);
            if (['unbulleted list', 'plainlist', 'ubl', 'flatlist', 'hlist'].includes(name))
                return positional.join(', ');
            if (['nowrap', 'small', 'abbr', 'val'].includes(name))
                return positional[0] ?? '';
            if (name.startsWith('cite') || ['sfn', 'efn', 'refn'].includes(name))
                return '';
            return positional[positional.length - 1] ?? '';
        });
    }
    return text
        .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
        .replace(/\[https?:\/\/\S+ ([^\]]+)\]/g, '$1')
        .replace(/'{2,}/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&ndash;/g, '–')
        .replace(/\s+/g, ' ')
        .replace(/(,\s*)+$/g, '')
        .trim();
}
// Extracts every {{Infobox ...}} template (brace-balanced) from wikitext into ordered key/value pairs.
function extractInfoboxes(wikitext) {
    const boxes = [];
    const starter = /\{\{\s*(?:Infobox|Aircraft specs)/gi;
    let match;
    while ((match = starter.exec(wikitext))) {
        let depth = 0;
        let end = match.index;
        for (let i = match.index; i < wikitext.length - 1; i += 1) {
            const pair = wikitext.slice(i, i + 2);
            if (pair === '{{') {
                depth += 1;
                i += 1;
            }
            else if (pair === '}}') {
                depth -= 1;
                i += 1;
                if (depth === 0) {
                    end = i + 1;
                    break;
                }
            }
        }
        const body = wikitext.slice(match.index + 2, end - 2);
        // Top-level fields start a line with "| key = value"; lines inside nested templates are continuation.
        const fields = [];
        let key = null;
        let value = '';
        let nesting = 0;
        const flush = () => {
            if (key !== null) {
                const cleaned = cleanValue(value);
                if (cleaned)
                    fields.push([key, cleaned]);
            }
        };
        for (const line of body.split('\n').slice(1)) {
            const field = nesting === 0 ? line.match(/^\s*\|\s*([A-Za-z0-9_ ]+?)\s*=\s*(.*)$/) : null;
            if (field) {
                flush();
                key = field[1].trim().replace(/\s+/g, '_').toLowerCase();
                value = field[2];
            }
            else {
                value += `\n${line}`;
            }
            nesting += (line.match(/\{\{/g)?.length ?? 0) - (line.match(/\}\}/g)?.length ?? 0);
            if (nesting < 0)
                nesting = 0;
        }
        flush();
        if (fields.length > 2)
            boxes.push(fields);
        starter.lastIndex = Math.max(starter.lastIndex, end);
    }
    return boxes;
}
function pickInfobox(boxes, promptTokens, titleTokens) {
    if (boxes.length === 0)
        return undefined;
    const distinctive = promptTokens.filter((token) => !titleTokens.has(token));
    let best;
    for (const box of boxes) {
        const haystack = box
            .filter(([key]) => ['name', 'production', 'model_years', 'model_code', 'modelcode', 'also_called', 'generation', 'body_style', 'chassis', 'platform', 'caption'].includes(key))
            .map(([, value]) => value.toLowerCase())
            .join(' ');
        const hits = distinctive.filter((token) => haystack.includes(token)).length;
        const dimensionCount = box.filter(([key, value]) => SPEC_KEY_RE.test(key) || MEASURE_VALUE_RE.test(value)).length;
        const production = box.find(([key]) => key === 'production')?.[1] ?? '';
        const startYear = Number(production.match(/(19|20)\d{2}/)?.[0] ?? 0);
        // Explicit generation/model match wins; otherwise prefer boxes with real dimensions, then the newest.
        const score = hits * 1000 + Math.min(dimensionCount, 6) * 20 + (startYear - 1900) / 10;
        if (!best || score > best.score)
            best = { box, score };
    }
    return best?.box;
}
function trimInfobox(box) {
    const kept = box.filter(([key, value]) => !SKIP_KEYS.test(key) && !REDUNDANT_KEYS.test(key) && value.length > 0 && !/^\d+px$/.test(value));
    const rank = (key) => {
        const index = DIMENSION_KEYS.indexOf(key);
        return index === -1 ? 100 : index;
    };
    // Dimension/spec keys first (in a fixed order), then everything else in original order.
    const specs = kept.filter(([key]) => rank(key) < 100).sort((a, b) => rank(a[0]) - rank(b[0]));
    const rest = kept.filter(([key]) => rank(key) >= 100);
    return [...specs, ...rest]
        .filter(([key, value], index, all) => all.findIndex(([k, v]) => k === key && v === value) === index)
        .slice(0, MAX_INFOBOX_LINES)
        .map(([key, value]) => [key, value.length > 200 ? `${value.slice(0, 197)}…` : value]);
}
async function fetchImage(url) {
    try {
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!response.ok)
            return undefined;
        const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType))
            return undefined;
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES)
            return undefined;
        return { mimeType, data: buffer.toString('base64'), url };
    }
    catch {
        return undefined;
    }
}
export const _internals = { extractInfoboxes, pickInfobox, trimInfobox, cleanValue, tokenize };
/** Returns Wikipedia reference data for the object described by `prompt`, or null if nothing relevant is found. Never throws. */
export async function getWikipediaReference(prompt, options = {}) {
    const query = cleanQuery(prompt);
    if (!query)
        return null;
    const cacheKey = `${query}|${options.fetchImage ? 'img' : 'txt'}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS)
        return cached.value;
    try {
        const search = await api({ action: 'query', list: 'search', srsearch: query, srlimit: '5', srprop: '' });
        const promptTokens = tokenize(query);
        const candidates = (search?.query?.search ?? [])
            .map((result) => result.title)
            .filter((title) => tokenize(title).some((token) => token.length > 2 && promptTokens.includes(token)))
            .slice(0, MAX_CANDIDATES);
        // Try the most relevant candidate articles in order; keep the first whose infobox has real measurements.
        for (const title of candidates) {
            const [summary, parsed] = await Promise.all([
                api({ action: 'query', prop: 'extracts|pageimages', exintro: '1', explaintext: '1', piprop: 'thumbnail', pithumbsize: '640', titles: title }),
                api({ action: 'parse', page: title, prop: 'wikitext' }),
            ]);
            const page = summary?.query?.pages?.[0];
            const wikitext = parsed?.parse?.wikitext ?? '';
            const measured = extractInfoboxes(wikitext).filter(hasMeasurements);
            const chosen = pickInfobox(measured, promptTokens, new Set(tokenize(title)));
            if (!chosen)
                continue;
            const infobox = trimInfobox(chosen);
            const resolvedTitle = page?.title ?? title;
            const thumbnail = page?.thumbnail?.source;
            const image = options.fetchImage && thumbnail ? await fetchImage(thumbnail) : undefined;
            const value = {
                title: resolvedTitle,
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(resolvedTitle.replace(/ /g, '_'))}`,
                extract: (page?.extract ?? '').replace(/\s+\n/g, '\n').trim().slice(0, MAX_EXTRACT_CHARS),
                infoboxTitle: chosen.find(([key]) => key === 'name')?.[1],
                infobox,
                image,
            };
            cache.set(cacheKey, { at: Date.now(), value });
            return value;
        }
        cache.set(cacheKey, { at: Date.now(), value: null });
        return null;
    }
    catch (error) {
        console.warn('[wikipedia-reference] lookup failed, continuing without it:', error instanceof Error ? error.message : error);
        return null;
    }
}
/** Renders the reference as a text block to append to the Gemini user message. */
export function formatWikipediaBlock(reference) {
    const lines = [
        `=== WIKIPEDIA REFERENCE (supplementary real-world data; article: "${reference.title}") ===`,
        'Use this to ground real dimensions, proportions and signature features. Convert units to millimetres. If it is clearly about something other than the requested object, ignore it.',
    ];
    if (reference.infobox.length > 0) {
        lines.push(`Specifications${reference.infoboxTitle ? ` (${reference.infoboxTitle})` : ''}:`);
        for (const [key, value] of reference.infobox)
            lines.push(`- ${key.replace(/_/g, ' ')}: ${value}`);
    }
    if (reference.extract)
        lines.push('Summary:', reference.extract);
    if (reference.image)
        lines.push('A lead photograph of the subject is attached: match its overall proportions and silhouette.');
    lines.push('=== END WIKIPEDIA REFERENCE ===');
    return lines.join('\n');
}
