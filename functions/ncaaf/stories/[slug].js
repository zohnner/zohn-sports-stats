// Pages Function: /ncaaf/stories/:slug — one SportStrata Story (D-166/D-187).
// Rendering lives in functions/_stories.js; see there for behavior.
import { renderStoryPage } from '../../_stories.js';

export function onRequest(context) { return renderStoryPage(context, 'ncaaf'); }
