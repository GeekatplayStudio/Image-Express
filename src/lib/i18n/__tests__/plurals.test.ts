/**
 * Plural resolution. English has two forms; Russian and Ukrainian have three
 * for cardinals, so a flat "{count} страниц" is wrong for most numbers.
 * These assertions pin the grammar rather than the implementation.
 */

import { translate } from '../index';

describe('plural forms', () => {
    it('selects English one/other', () => {
        expect(translate('en', 'dashboard.canvasCount', { count: 1 })).toBe('1 page');
        expect(translate('en', 'dashboard.canvasCount', { count: 2 })).toBe('2 pages');
        expect(translate('en', 'dashboard.canvasCount', { count: 0 })).toBe('0 pages');
    });

    it('selects Russian one/few/many', () => {
        // 1, 21, 31 → one;  2-4, 22-24 → few;  5-20, 25-30 → many
        expect(translate('ru', 'dashboard.canvasCount', { count: 1 })).toBe('1 страница');
        expect(translate('ru', 'dashboard.canvasCount', { count: 2 })).toBe('2 страницы');
        expect(translate('ru', 'dashboard.canvasCount', { count: 5 })).toBe('5 страниц');
        expect(translate('ru', 'dashboard.canvasCount', { count: 11 })).toBe('11 страниц');
        expect(translate('ru', 'dashboard.canvasCount', { count: 21 })).toBe('21 страница');
        expect(translate('ru', 'dashboard.canvasCount', { count: 22 })).toBe('22 страницы');
    });

    it('selects Ukrainian one/few/many', () => {
        expect(translate('uk', 'dashboard.canvasCount', { count: 1 })).toBe('1 сторінка');
        expect(translate('uk', 'dashboard.canvasCount', { count: 3 })).toBe('3 сторінки');
        expect(translate('uk', 'dashboard.canvasCount', { count: 8 })).toBe('8 сторінок');
    });

    it('uses the flat key for locales with no plural distinction', () => {
        // Japanese has a single form for all counts, so ja deliberately defines
        // only the flat key. Resolution must use it rather than reaching for
        // English's one/other variants.
        expect(translate('ja', 'dashboard.canvasCount', { count: 1 })).toBe('1 ページ');
        expect(translate('ja', 'dashboard.canvasCount', { count: 7 })).toBe('7 ページ');
    });

    it('prefers a locale plural variant once one is supplied', () => {
        // German gained one/other, so it must no longer render "1 Seiten".
        expect(translate('de', 'dashboard.canvasCount', { count: 1 })).toBe('1 Seite');
        expect(translate('de', 'dashboard.canvasCount', { count: 3 })).toBe('3 Seiten');
    });

    it('selects Polish one/few/many', () => {
        expect(translate('pl', 'dashboard.canvasCount', { count: 1 })).toBe('1 strona');
        expect(translate('pl', 'dashboard.canvasCount', { count: 3 })).toBe('3 strony');
        expect(translate('pl', 'dashboard.canvasCount', { count: 8 })).toBe('8 stron');
    });

    it('uses English plural variants when a locale lacks the key entirely', () => {
        // de has no dashboard.moreProjects at all, so the English plural table
        // is used — and it still pluralises correctly rather than going flat.
        expect(translate('de', 'dashboard.moreProjects', { count: 1 })).toBe('1 more album');
        expect(translate('de', 'dashboard.moreProjects', { count: 4 })).toBe('4 more albums');
    });

    it('leaves non-count interpolation untouched', () => {
        expect(translate('en', 'channels.channelOpacity', { channel: 'Red' }))
            .toBe('Red opacity');
    });

    it('keeps an unfilled placeholder visible rather than rendering undefined', () => {
        expect(translate('en', 'channels.channelOpacity', { other: 'x' }))
            .toBe('{channel} opacity');
    });
});
