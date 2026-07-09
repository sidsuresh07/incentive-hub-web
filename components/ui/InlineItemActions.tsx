export const compactFieldClass =
  "mt-1 w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export const compactLabelClass = "block text-xs font-medium text-gray-500";

export const compactButtonClass =
  "rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50";

export function EditIconButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5"
        aria-hidden="true"
      >
        <path d="m2.695 14.363 4.242-4.243a1 1 0 0 1 1.414 0l4.243 4.243a1 1 0 0 1-.707 1.707H3.402a1 1 0 0 1-.707-1.707ZM13.95 3.05a2.121 2.121 0 0 1 3 3l-1.172 1.172-3-3L13.95 3.05Z" />
      </svg>
    </button>
  );
}

export function DeleteIconButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.75 2A2.75 2.75 0 0 0 6 4.75v.268A2.75 2.75 0 0 0 4.75 8H3.5a.75.75 0 0 0 0 1.5h.583l.77 9.24a2.25 2.25 0 0 0 2.24 2.06h5.814a2.25 2.25 0 0 0 2.24-2.06l.77-9.24H16.5a.75.75 0 0 0 0-1.5h-1.25A2.75 2.75 0 0 0 13 5.018V4.75A2.75 2.75 0 0 0 10.25 2h-1.5ZM7.5 4.75c0-.69.56-1.25 1.25-1.25h3.5c.69 0 1.25.56 1.25 1.25v.268H7.5V4.75Zm1.25 5.25a.75.75 0 0 1 1.5 0v4.5a.75.75 0 0 1-1.5 0v-4.5Zm4.25-.75a.75.75 0 0 0-1.5 0v4.5a.75.75 0 0 0 1.5 0v-4.5Z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}

export function DeleteConfirm({
  message,
  onConfirm,
  onCancel,
  confirming,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
}) {
  return (
    <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-600">{message}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          {confirming ? "Removing…" : "Remove"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={confirming}
          className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
