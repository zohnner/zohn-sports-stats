// Pages Function: /mlb/stories/:slug — one SportStrata Story (D-166/D-171).
// Rendering lives in functions/_stories.js; see there for behavior.
import { renderStoryPage } from '../../_stories.js';

export function onRequest(context) { return renderStoryPage(context, 'mlb'); }
