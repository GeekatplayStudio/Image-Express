import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DialogProvider, useDialog } from './DialogProvider';

const TestComponent = () => {
    const dialog = useDialog();
    const [result, setResult] = React.useState<string>('no result');

    return (
        <div>
            <div data-testid="result">{result}</div>
            <button
                onClick={async () => {
                    await dialog.alert('Test Alert');
                    setResult('alert resolved');
                }}
            >
                Trigger Alert
            </button>
            <button
                onClick={async () => {
                    const res = await dialog.confirm('Test Confirm');
                    setResult(res ? 'confirmed' : 'cancelled');
                }}
            >
                Trigger Confirm
            </button>
            <button
                onClick={async () => {
                    const res = await dialog.prompt('Test Prompt', { defaultValue: 'seed', placeholder: 'enter' });
                    setResult(res ?? 'prompt cancelled');
                }}
            >
                Trigger Prompt
            </button>
            <button
                onClick={async () => {
                    const res = await dialog.prompt('Test Range', { inputType: 'range', min: 5, max: 10 });
                    setResult(res ?? 'range cancelled');
                }}
            >
                Trigger Range
            </button>
            <button
                onClick={async () => {
                    const first = dialog.alert('First Alert');
                    const second = dialog.confirm('Second Confirm');
                    await first;
                    const res = await second;
                    setResult(res ? 'queue confirmed' : 'queue cancelled');
                }}
            >
                Trigger Queue
            </button>
        </div>
    );
};

describe('DialogProvider', () => {
    test('renders children', () => {
        render(
            <DialogProvider>
                <div>Test Child</div>
            </DialogProvider>
        );
        expect(screen.getByText('Test Child')).toBeInTheDocument();
    });

    test('shows alert and resolves on confirm', async () => {
        render(
            <DialogProvider>
                <TestComponent />
            </DialogProvider>
        );

        fireEvent.click(screen.getByText('Trigger Alert'));

        await screen.findByText('Test Alert');
        await screen.findByText('Alert');

        fireEvent.click(screen.getByRole('button', { name: 'OK' }));

        await screen.findByText('alert resolved');
    });

    test('shows confirm and handles true/false', async () => {
        render(
            <DialogProvider>
                <TestComponent />
            </DialogProvider>
        );

        fireEvent.click(screen.getByText('Trigger Confirm'));
        await screen.findByText('Test Confirm');
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
        await screen.findByText('confirmed');

        fireEvent.click(screen.getByText('Trigger Confirm'));
        await screen.findByText('Test Confirm');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await screen.findByText('cancelled');
    });

    test('prompt resolves with input value', async () => {
        render(
            <DialogProvider>
                <TestComponent />
            </DialogProvider>
        );

        fireEvent.click(screen.getByText('Trigger Prompt'));
        const input = await screen.findByRole('textbox');
        expect(input).toHaveValue('seed');

        fireEvent.change(input, { target: { value: 'hello' } });
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));

        await screen.findByText('hello');
    });

    test('range prompt defaults to min and resolves', async () => {
        render(
            <DialogProvider>
                <TestComponent />
            </DialogProvider>
        );

        fireEvent.click(screen.getByText('Trigger Range'));
        const slider = await screen.findByRole('slider');
        expect(slider).toHaveValue('5');

        fireEvent.change(slider, { target: { value: '7' } });
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));

        await screen.findByText('7');
    });

    test('escape cancels confirm', async () => {
        render(
            <DialogProvider>
                <TestComponent />
            </DialogProvider>
        );

        fireEvent.click(screen.getByText('Trigger Confirm'));
        await screen.findByText('Test Confirm');
        fireEvent.keyDown(document, { key: 'Escape' });

        await screen.findByText('cancelled');
    });

    test('backdrop closes alert', async () => {
        render(
            <DialogProvider>
                <TestComponent />
            </DialogProvider>
        );

        fireEvent.click(screen.getByText('Trigger Alert'));
        await screen.findByText('Test Alert');
        fireEvent.mouseDown(screen.getByTestId('dialog-backdrop'));

        await screen.findByText('alert resolved');
    });

    test('queues dialogs in order', async () => {
        render(
            <DialogProvider>
                <TestComponent />
            </DialogProvider>
        );

        fireEvent.click(screen.getByText('Trigger Queue'));
        await screen.findByText('First Alert');
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));

        await screen.findByText('Second Confirm');
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

        await screen.findByText('queue confirmed');
    });
});
