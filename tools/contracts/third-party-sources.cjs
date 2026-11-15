'use strict';
// Third-party pages stories cite as fact sources, reviewed by hand.
// A story fact normally comes from a feed under nightly contract. When one
// cites a page instead, nothing can re-check it, so the page's publisher has
// to be one we trust for that kind of fact.
//
//   ok       reviewed and acceptable for what it is cited for
//   blocked  not to be cited. A story dated on or after `since` that cites it
//            fails the Contract Check run. Earlier stories are listed, not
//            failed: published stories are not edited to fit a later rule.
//
// A host that is not in this list is reported as "unreviewed" on every run
// until someone adds it here, one way or the other.
module.exports = {
    'basketball-reference.com': { status: 'ok', why: 'Sports Reference: the standard historical record, used for seasons ESPN does not serve' },
    'espn.com': { status: 'ok', why: 'ESPN editorial pages (game stories, video): same publisher as the feeds' },
    'espn.ph': { status: 'ok', why: 'ESPN regional edition of the same game stories' },
    'nbcsports.com': { status: 'ok', why: 'national outlet running wire game stories' },
    'usatoday.com': { status: 'ok', why: 'national outlet' },
    'thescore.com': { status: 'ok', why: 'established sports outlet' },
    'gotigersgo.com': { status: 'ok', why: 'Memphis athletics official site: primary source for its own games' },
    'uclabruins.com': { status: 'ok', why: 'UCLA athletics official site: primary source for program history' },
    'gophersports.com': { status: 'ok', why: 'Minnesota athletics official site: hosts the opponent game notes it is cited for' },
    'sportbursts.com': {
        status: 'blocked', since: '2026-11-16',
        why: 'aggregator with no named reporting; its one cited fact (a 13-game Knicks double-double streak) sits beside a headline in the same story calling 11 the franchise record, and no second source was given',
    },
};
