const UNIT_TO_MM = { mm: 1, millimeter: 1, millimeters: 1, cm: 10, centimeter: 10, centimeters: 10, in: 25.4, inch: 25.4, inches: 25.4 };

function numberInMillimetres(value, unit = 'mm') {
  return Math.round(value * (UNIT_TO_MM[unit.toLowerCase()] ?? 1) * 100) / 100;
}

function dimensionsFromPrompt(prompt) {
  const dimensions = {};
  const pattern = /(length|width|height|depth|thickness|diameter|bore|module|teeth|radius)\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*(mm|millimeters?|cm|centimeters?|in(?:ches?)?)?/gi;
  for (const match of prompt.matchAll(pattern)) {
    const key = match[1].toLowerCase();
    const raw = Number(match[2]);
    dimensions[key] = ['teeth'].includes(key) ? raw : numberInMillimetres(raw, match[3] || 'mm');
  }
  const trailingLabel = /(\d+(?:\.\d+)?)\s*(mm|millimeters?|cm|centimeters?|in(?:ches?)?)?\s*(?:mm\s*)?(bore|diameter|thickness|height|width|depth|length|radius|module|teeth)\b/gi;
  for (const match of prompt.matchAll(trailingLabel)) {
    const key = match[3].toLowerCase();
    const raw = Number(match[1]);
    dimensions[key] ??= ['teeth'].includes(key) ? raw : numberInMillimetres(raw, match[2] || 'mm');
  }
  const threeAxis = prompt.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*(mm|cm|in(?:ches?)?)/i);
  if (threeAxis) {
    dimensions.length ??= numberInMillimetres(Number(threeAxis[1]), threeAxis[4]);
    dimensions.width ??= numberInMillimetres(Number(threeAxis[2]), threeAxis[4]);
    dimensions.height ??= numberInMillimetres(Number(threeAxis[3]), threeAxis[4]);
  }
  return dimensions;
}

export function inferDesignIntent(prompt) {
  const dimensions = dimensionsFromPrompt(prompt);
  const lower = prompt.toLowerCase();
  const constraints = ['valid closed BREP', 'editable dimensions'];
  if (/hole|bore|opening|cutout/.test(lower)) constraints.push('preserve specified openings');
  if (/fit|clearance|tolerance/.test(lower)) constraints.push('respect fit and clearance language');
  if (/assembly|part(s)?/.test(lower)) constraints.push('keep separate parts in shared coordinates');
  const materials = /steel/.test(lower) ? ['steel'] : /plastic|pla|abs/.test(lower) ? ['plastic'] : /wood/.test(lower) ? ['wood'] : ['anodized aluminum'];
  return { object: prompt.split(/[,.]/)[0].slice(0, 120), units: 'mm', dimensions, constraints, materials };
}

export function buildParametricPlan(intent) {
  const dimensions = Object.entries(intent.dimensions);
  const dimensionSummary = dimensions.length ? ` using ${dimensions.map(([key, value]) => `${key}=${value}${key === 'teeth' ? '' : ' mm'}`).join(', ')}` : ' with dimensions inferred from the request';
  const features = [{ name: 'primary-solid', operation: 'parametric-solid', parameters: intent.dimensions }];
  if (intent.constraints.includes('preserve specified openings')) features.push({ name: 'openings', operation: 'cut-specified-holes-and-cutouts', parameters: {} });
  if (intent.constraints.includes('keep separate parts in shared coordinates')) features.push({ name: 'assembly-layout', operation: 'preserve-part-coordinates', parameters: {} });
  return {
    summary: `Build a parametric ${intent.object}${dimensionSummary}.`,
    decision: `Use parameterized BREP primitives and boolean operations; preserve ${intent.constraints.slice(2).join(', ') || 'the stated design constraints'}.`,
    features,
  };
}
