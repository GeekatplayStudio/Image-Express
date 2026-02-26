export const NUMBER_DRAG_HINT_SEEN_KEY = 'image-express-number-drag-hint-seen';

export const hasNumberDragHintBeenSeen = (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(NUMBER_DRAG_HINT_SEEN_KEY) === '1';
};

export const markNumberDragHintSeen = (): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(NUMBER_DRAG_HINT_SEEN_KEY, '1');
};

export const resetNumberDragHintSeen = (): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(NUMBER_DRAG_HINT_SEEN_KEY);
};
