class MockJsPdf {
    addImage = jest.fn();
    addPage = jest.fn();
    save = jest.fn();
    setProperties = jest.fn();
    setFontSize = jest.fn();
    text = jest.fn();
}

export const jsPDF = jest.fn(() => new MockJsPdf());

export default jsPDF;