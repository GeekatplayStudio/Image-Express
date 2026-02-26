'use client';

import { useEffect } from 'react';
import { loadUiPreferences } from '@/lib/ui-preferences';
import { hasNumberDragHintBeenSeen, markNumberDragHintSeen } from '@/lib/number-drag-hints';

export default function RangeResetListener() {
    useEffect(() => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        const setInputValue = (target: HTMLInputElement, nextValue: string) => {
            const lastValue = target.value;
            if (valueSetter) {
                valueSetter.call(target, nextValue);
            } else {
                target.value = nextValue;
            }
            const tracker = (target as HTMLInputElement & { _valueTracker?: { setValue: (value: string) => void } })._valueTracker;
            if (tracker) tracker.setValue(lastValue);
        };

        const fireInputEvents = (target: HTMLInputElement) => {
            const inputEvent = typeof InputEvent !== 'undefined'
                ? new InputEvent('input', { bubbles: true, cancelable: true, composed: true })
                : new Event('input', { bubbles: true, cancelable: true });
            target.dispatchEvent(inputEvent);
            target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        };

        const showDragHintOnce = () => {
            if (typeof window === 'undefined') return;
            if (loadUiPreferences().suppressNumberDragHints) return;
            if (hasNumberDragHintBeenSeen()) return;
            markNumberDragHintSeen();

            const hint = document.createElement('div');
            hint.textContent = 'Number drag: left/right • Shift coarse • Alt fine';
            hint.setAttribute('role', 'status');
            hint.style.position = 'fixed';
            hint.style.right = '14px';
            hint.style.bottom = '14px';
            hint.style.zIndex = '9999';
            hint.style.pointerEvents = 'none';
            hint.style.padding = '7px 10px';
            hint.style.borderRadius = '10px';
            hint.style.border = '1px solid rgba(125,125,125,0.35)';
            hint.style.background = 'rgba(17, 24, 39, 0.95)';
            hint.style.color = 'rgba(243, 244, 246, 0.95)';
            hint.style.fontSize = '12px';
            hint.style.lineHeight = '1.2';
            hint.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
            hint.style.opacity = '0';
            hint.style.transform = 'translateY(8px)';
            hint.style.transition = 'opacity 180ms ease, transform 180ms ease';

            document.body.appendChild(hint);
            requestAnimationFrame(() => {
                hint.style.opacity = '1';
                hint.style.transform = 'translateY(0)';
            });

            window.setTimeout(() => {
                hint.style.opacity = '0';
                hint.style.transform = 'translateY(8px)';
                window.setTimeout(() => {
                    hint.remove();
                }, 220);
            }, 2200);
        };

        const handleDblClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;
            if (!(target instanceof HTMLInputElement)) return;
            if (target.type !== 'range') return;
            const def = target.getAttribute('data-default');
            if (def === null) return;
            setInputValue(target, def);

            const fire = () => fireInputEvents(target);

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

        let activeNumberInput: HTMLInputElement | null = null;
        let dragStartX = 0;
        let dragStartValue = 0;
        let didDrag = false;
        let dragStep = 1;
        let dragMin = Number.NEGATIVE_INFINITY;
        let dragMax = Number.POSITIVE_INFINITY;

        const readNumeric = (raw: string, fallback: number) => {
            const parsed = Number.parseFloat(raw);
            return Number.isFinite(parsed) ? parsed : fallback;
        };

        const readStep = (input: HTMLInputElement) => {
            const rawStep = input.step;
            if (!rawStep || rawStep === 'any') return 1;
            const parsed = Number.parseFloat(rawStep);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        };

        const formatValue = (value: number, step: number) => {
            const stepStr = String(step);
            const decimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
            return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
        };

        const handleMouseDown = (event: MouseEvent) => {
            if (event.button !== 0) return;
            const target = event.target as HTMLElement | null;
            if (!(target instanceof HTMLInputElement)) return;
            if (target.type !== 'number') return;
            if (target.readOnly || target.disabled) return;

            activeNumberInput = target;
            dragStartX = event.clientX;
            dragStartValue = readNumeric(target.value, readNumeric(target.min, 0));
            didDrag = false;
            dragStep = readStep(target);
            dragMin = readNumeric(target.min, Number.NEGATIVE_INFINITY);
            dragMax = readNumeric(target.max, Number.POSITIVE_INFINITY);
        };

        const handleMouseMove = (event: MouseEvent) => {
            if (!activeNumberInput) return;
            if ((event.buttons & 1) !== 1) return;

            const deltaX = event.clientX - dragStartX;
            const threshold = 4;
            if (!didDrag && Math.abs(deltaX) < threshold) return;
            if (!didDrag) showDragHintOnce();
            didDrag = true;

            const stepsDelta = deltaX / 6;
            const modifierMultiplier = event.shiftKey ? 5 : event.altKey ? 0.2 : 1;
            const effectiveStep = dragStep * modifierMultiplier;
            const stepped = dragStartValue + (stepsDelta * effectiveStep);
            const bounded = Math.min(dragMax, Math.max(dragMin, stepped));
            const nextValue = formatValue(bounded, effectiveStep);

            if (activeNumberInput.value === nextValue) return;

            setInputValue(activeNumberInput, nextValue);
            fireInputEvents(activeNumberInput);
            event.preventDefault();
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        };

        const clearDragState = () => {
            if (!activeNumberInput) return;
            if (didDrag) {
                activeNumberInput.blur();
            }
            activeNumberInput = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        const handleMouseUp = () => {
            clearDragState();
        };

        window.addEventListener('dblclick', handleDblClick);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('blur', clearDragState);
        return () => {
            window.removeEventListener('dblclick', handleDblClick);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('blur', clearDragState);
            clearDragState();
        };
    }, []);

    return null;
}
