// localStorage keys used to hand a STEP model off between the AI CAD Studio (/ai) and the
// embedded ChiliCAD editor (/chili-editor). localStorage (not sessionStorage) so the handoff
// survives /chili-editor opening in a new tab: STEP text is plain ASCII, so no encoding needed.
export const HANDOFF_TO_CHILI_STEP = 'agentic-cad:handoff-to-chili-step';
export const HANDOFF_TO_CHILI_NAME = 'agentic-cad:handoff-to-chili-name';
export const HANDOFF_FROM_CHILI_STEP = 'agentic-cad:handoff-from-chili-step';
export const HANDOFF_FROM_CHILI_NAME = 'agentic-cad:handoff-from-chili-name';
