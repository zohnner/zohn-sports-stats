// Pages Function: /stories — every sport's SportStrata Stories in one list.
// Rendering lives in functions/_stories.js; see there for behavior.
import { renderStoriesHub } from '../_stories.js';

export function onRequest(context) { return renderStoriesHub(context); }
