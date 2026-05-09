export interface UploadResult {
  path: string;
  name: string;
}

export async function uploadFile(sessionId: string, file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`/api/v1/sessions/${sessionId}/upload`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const data = await res.json();
      if (data && typeof data.error === 'string') detail = `${data.error} (${res.status})`;
    } catch {
      // ignore parse failure
    }
    throw new Error(`upload failed: ${detail}`);
  }

  return (await res.json()) as UploadResult;
}
