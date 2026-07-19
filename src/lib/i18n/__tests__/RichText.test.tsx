import { render, screen } from '@testing-library/react';
import { RichText } from '../RichText';

describe('RichText', () => {
    it('substitutes React nodes for placeholders, preserving markup', () => {
        const { container } = render(
            <RichText
                template="Cloud requests use the {header} header."
                values={{ header: <code className="font-mono">X-API-Key</code> }}
            />,
        );
        expect(container.textContent).toBe('Cloud requests use the X-API-Key header.');
        // The markup must survive — this is the whole point of the component.
        expect(container.querySelector('code')).toHaveClass('font-mono');
        expect(container.querySelector('code')).toHaveTextContent('X-API-Key');
    });

    it('handles several placeholders and repeated ones', () => {
        const { container } = render(
            <RichText
                template="Use {a}, {b}, and {a} again."
                values={{ a: <b>one</b>, b: <i>two</i> }}
            />,
        );
        expect(container.textContent).toBe('Use one, two, and one again.');
        expect(container.querySelectorAll('b')).toHaveLength(2);
    });

    it('leaves an unmatched placeholder visible rather than dropping it', () => {
        // Mirrors translate(): a missing value should be obvious, not silent.
        render(<RichText template="Hello {missing} world" values={{}} />);
        expect(screen.getByText(/\{missing\}/)).toBeInTheDocument();
    });

    it('renders a template with no placeholders unchanged', () => {
        const { container } = render(<RichText template="Plain sentence." values={{}} />);
        expect(container.textContent).toBe('Plain sentence.');
    });
});
