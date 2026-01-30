'use client';

import { useEffect } from 'react';

export default function RangeResetListener() {
    useEffect(() => {
        const handleDblClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;
            if (!(target instanceof HTMLInputElement)) return;
            if (target.type !== 'range') return;
            const def = target.getAttribute('data-default');
            if (def === null) return;
            const lastValue = target.value;
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (valueSetter) {
                valueSetter.call(target, def);
            } else {
                target.value = def;
            }
            const tracker = (target as HTMLInputElement & { _valueTracker?: { setValue: (value: string) => void } })._valueTracker;
            if (tracker) tracker.setValue(lastValue);

            const fire = () => {
                const inputEvent = typeof InputEvent !== 'undefined'
                    ? new InputEvent('input', { bubbles: true, cancelable: true, composed: true })
                    : new Event('input', { bubbles: true, cancelable: true });
                target.dispatchEvent(inputEvent);
                target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            };

            fire();
            requestAnimationFrame(fire);

            const propsKey = Object.keys(target).find(
                (key) => key.startsWith('__reactProps$') || key.startsWith('__reactFiber$')
            );
            if (propsKey) {
                const maybeProps = (target as unknown as Record<string, unknown>)[propsKey];
                const props = (maybeProps as { memoizedProps?: { onChange?: (e: unknown) => void } })?.memoizedProps
                    ?? (maybeProps as { onChange?: (e: unknown) => void });
                if (props && typeof props.onChange === 'function') {
                    props.onChange({
                        target,
                        currentTarget: target,
                        type: 'change'
                    });
                }
            }
        };
        window.addEventListener('dblclick', handleDblClick);
        return () => window.removeEventListener('dblclick', handleDblClick);
    }, []);

    return null;
}
