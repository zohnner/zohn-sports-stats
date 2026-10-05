// Pages Function: /nfl/stories — NFL SportStrata Stories index (D-166/D-171).
// Rendering lives in functions/_stories.js; see there for behavior.
import { renderStoriesIndex } from '../../_stories.js';

export function onRequest(context) { return renderStoriesIndex(context, 'nfl'); }
