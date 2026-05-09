import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TerminalView } from './TerminalView';

vi.mock('../../hooks/useTerminal', () => ({
  useTerminal: vi.fn(),
  pasteToTerminal: vi.fn(),
}));

vi.mock('../../api/upload', () => ({
  uploadFile: vi.fn(),
}));

import { pasteToTerminal } from '../../hooks/useTerminal';
import { uploadFile } from '../../api/upload';

const mockedPaste = pasteToTerminal as unknown as ReturnType<typeof vi.fn>;
const mockedUpload = uploadFile as unknown as ReturnType<typeof vi.fn>;

function makeFile(name: string, content = 'data') {
  return new File([content], name, { type: 'text/plain' });
}

function makeDataTransfer(files: File[]): DataTransfer {
  const dt = {
    files,
    items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
    types: ['Files'],
    dropEffect: 'copy',
  };
  return dt as unknown as DataTransfer;
}

describe('TerminalView drag-and-drop', () => {
  beforeEach(() => {
    mockedPaste.mockReset();
    mockedUpload.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows drop overlay on dragover', () => {
    const { container } = render(<TerminalView sessionId="s1" />);
    const root = container.firstElementChild as HTMLElement;

    fireEvent.dragOver(root, { dataTransfer: makeDataTransfer([]) });

    expect(screen.getByText(/drop to upload/i)).toBeInTheDocument();
  });

  it('hides overlay on dragleave', () => {
    const { container } = render(<TerminalView sessionId="s1" />);
    const root = container.firstElementChild as HTMLElement;

    fireEvent.dragOver(root, { dataTransfer: makeDataTransfer([]) });
    expect(screen.getByText(/drop to upload/i)).toBeInTheDocument();

    fireEvent.dragLeave(root, { dataTransfer: makeDataTransfer([]) });
    expect(screen.queryByText(/drop to upload/i)).not.toBeInTheDocument();
  });

  it('on drop, uploads each file and pastes path into terminal', async () => {
    mockedUpload.mockImplementation(async (_sid: string, file: File) => ({
      path: '/uploads/' + file.name,
      name: file.name,
    }));

    const { container } = render(<TerminalView sessionId="s1" />);
    const root = container.firstElementChild as HTMLElement;

    const file = makeFile('hello.txt');
    fireEvent.drop(root, { dataTransfer: makeDataTransfer([file]) });

    await waitFor(() => {
      expect(mockedUpload).toHaveBeenCalledWith('s1', file);
      expect(mockedPaste).toHaveBeenCalledWith('s1', '/uploads/hello.txt ');
    });

    expect(screen.queryByText(/drop to upload/i)).not.toBeInTheDocument();
  });

  it('drop with multiple files uploads each one and pastes all paths', async () => {
    mockedUpload.mockImplementation(async (_sid: string, file: File) => ({
      path: '/u/' + file.name,
      name: file.name,
    }));

    const { container } = render(<TerminalView sessionId="s1" />);
    const root = container.firstElementChild as HTMLElement;

    const f1 = makeFile('a.txt');
    const f2 = makeFile('b.bin');
    fireEvent.drop(root, { dataTransfer: makeDataTransfer([f1, f2]) });

    await waitFor(() => {
      expect(mockedUpload).toHaveBeenCalledTimes(2);
      expect(mockedPaste).toHaveBeenCalledWith('s1', '/u/a.txt ');
      expect(mockedPaste).toHaveBeenCalledWith('s1', '/u/b.bin ');
    });
  });

  it('shows uploading indicator while upload in flight', async () => {
    let resolveUpload: (v: { path: string; name: string }) => void = () => {};
    mockedUpload.mockImplementation(
      () => new Promise((res) => { resolveUpload = res; }),
    );

    const { container } = render(<TerminalView sessionId="s1" />);
    const root = container.firstElementChild as HTMLElement;

    fireEvent.drop(root, { dataTransfer: makeDataTransfer([makeFile('big.bin')]) });

    await waitFor(() => {
      expect(screen.getByText(/uploading/i)).toBeInTheDocument();
    });

    resolveUpload({ path: '/u/big.bin', name: 'big.bin' });

    await waitFor(() => {
      expect(screen.queryByText(/uploading/i)).not.toBeInTheDocument();
    });
  });
});
