'use client';

import { UploadLine } from '@/components/ui/upload-line';
import { postUpload } from '@/lib/uploads/transport';
import { useUploadQueue } from '@/lib/uploads/use-upload-queue';

/** Answered by the browser test, never by the app. */
export const HARNESS_UPLOAD_URL = '/__proba/incarcare';

/** The real queue, the real device store, the real rows; a stand-in server. */
export function UploadHarness() {
  const queue = useUploadQueue({
    scope: 'proba',
    send: async (file, onProgress) => {
      const form = new FormData();
      form.set('id', file.id);
      form.set('photo', new File([file.blob], file.name, { type: file.type }));
      const answer = await postUpload<{ id?: string }>(HARNESS_UPLOAD_URL, form, onProgress);
      return { id: answer.id ?? file.id };
    },
  });
  const { summary } = queue;

  return (
    <div className="flex flex-col gap-3" data-upload-harness>
      <h1 className="text-h3">Probă: încărcări</h1>
      <input
        type="file"
        multiple
        data-harness-input
        onChange={(event) => {
          queue.add(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <p data-harness-summary data-uploaded={summary.uploaded} data-failed={summary.failed} data-total={summary.total}>
        {summary.uploaded} din {summary.total} încărcate
      </p>
      {queue.items.map((item) => (
        <UploadLine
          key={item.id}
          item={item}
          preview={queue.previewOf(item.id)}
          onRetry={queue.retry}
          onDiscard={queue.discard}
        />
      ))}
    </div>
  );
}
