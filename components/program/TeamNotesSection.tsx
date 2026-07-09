"use client";

import { useCallback, useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/program-format";
import type { ProgramNote } from "@/lib/program-types";
import { supabase } from "@/lib/supabase";
import {
  compactButtonClass,
  compactFieldClass,
  compactLabelClass,
  DeleteConfirm,
  DeleteIconButton,
  EditIconButton,
} from "@/components/ui/InlineItemActions";

type NoteFormState = {
  author_name: string;
  note_text: string;
};

const EMPTY_NOTE_FORM: NoteFormState = {
  author_name: "",
  note_text: "",
};

function NoteForm({
  idPrefix,
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  submitting,
  showCancel,
}: {
  idPrefix: string;
  values: NoteFormState;
  onChange: (values: NoteFormState) => void;
  onSubmit: (event: React.FormEvent) => void;
  onCancel?: () => void;
  submitLabel: string;
  submitting: boolean;
  showCancel?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-author`} className={compactLabelClass}>
          Your name
        </label>
        <input
          id={`${idPrefix}-author`}
          type="text"
          value={values.author_name}
          onChange={(event) =>
            onChange({ ...values, author_name: event.target.value })
          }
          className={compactFieldClass}
          placeholder="Name"
          maxLength={100}
          required
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-text`} className={compactLabelClass}>
          Note
        </label>
        <textarea
          id={`${idPrefix}-text`}
          value={values.note_text}
          onChange={(event) =>
            onChange({ ...values, note_text: event.target.value })
          }
          rows={3}
          className={`${compactFieldClass} resize-y`}
          placeholder="Add a note for the team…"
          required
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={
            submitting ||
            !values.author_name.trim() ||
            !values.note_text.trim()
          }
          className={compactButtonClass}
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        {showCancel && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className={compactButtonClass}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function TeamNotesSection({ programId }: { programId: string }) {
  const [notes, setNotes] = useState<ProgramNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState<NoteFormState>(EMPTY_NOTE_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<NoteFormState>(EMPTY_NOTE_FORM);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<
    "add" | "edit" | "delete" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("program_notes")
      .select("id, program_id, author_name, note_text, created_at")
      .eq("program_id", programId)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setNotes((data as unknown as ProgramNote[]) ?? []);
    setError(null);
  }, [programId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      await fetchNotes();
      setLoading(false);
    }
    load();
  }, [fetchNotes]);

  function startEdit(note: ProgramNote) {
    setDeletingId(null);
    setEditingId(note.id);
    setEditForm({
      author_name: note.author_name,
      note_text: note.note_text,
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_NOTE_FORM);
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const author_name = addForm.author_name.trim();
    const note_text = addForm.note_text.trim();
    if (!author_name || !note_text) {
      return;
    }

    setSubmitting("add");
    setError(null);

    const { data, error: insertError } = await supabase
      .from("program_notes")
      .insert({
        program_id: programId,
        author_name,
        note_text,
      })
      .select("id, program_id, author_name, note_text, created_at")
      .single();

    setSubmitting(null);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotes((current) => [data as unknown as ProgramNote, ...current]);
    setAddForm(EMPTY_NOTE_FORM);
  }

  async function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingId) {
      return;
    }

    const author_name = editForm.author_name.trim();
    const note_text = editForm.note_text.trim();
    if (!author_name || !note_text) {
      return;
    }

    setSubmitting("edit");
    setError(null);

    const { data, error: updateError } = await supabase
      .from("program_notes")
      .update({ author_name, note_text })
      .eq("id", editingId)
      .select("id, program_id, author_name, note_text, created_at")
      .single();

    setSubmitting(null);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    const updated = data as unknown as ProgramNote;
    setNotes((current) =>
      current.map((note) => (note.id === editingId ? updated : note))
    );
    cancelEdit();
  }

  async function handleDelete(noteId: string) {
    setSubmitting("delete");
    setError(null);

    const { error: deleteError } = await supabase
      .from("program_notes")
      .delete()
      .eq("id", noteId);

    setSubmitting(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setNotes((current) => current.filter((note) => note.id !== noteId));
    setDeletingId(null);
    if (editingId === noteId) {
      cancelEdit();
    }
  }

  return (
    <aside className="border-t border-gray-100 pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Team Notes
      </h2>

      <div className="mt-4">
        <NoteForm
          idPrefix="add-note"
          values={addForm}
          onChange={setAddForm}
          onSubmit={handleAdd}
          submitLabel="Add Note"
          submitting={submitting === "add"}
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-6">
        {loading ? (
          <p className="text-xs text-gray-400">Loading notes…</p>
        ) : notes.length === 0 ? (
          <p className="text-xs text-gray-400">No notes yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {notes.map((note) => (
              <li key={note.id} className="py-3 first:pt-0">
                {editingId === note.id ? (
                  <NoteForm
                    idPrefix={`edit-note-${note.id}`}
                    values={editForm}
                    onChange={setEditForm}
                    onSubmit={handleSaveEdit}
                    onCancel={cancelEdit}
                    submitLabel="Save Changes"
                    submitting={submitting === "edit"}
                    showCancel
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium text-gray-500">
                            {note.author_name}
                          </span>
                          <time
                            dateTime={note.created_at}
                            className="shrink-0 text-xs text-gray-400"
                          >
                            {formatRelativeTime(note.created_at)}
                          </time>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-600">
                          {note.note_text}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <EditIconButton
                          label="Edit note"
                          onClick={() => startEdit(note)}
                        />
                        <DeleteIconButton
                          label="Delete note"
                          onClick={() => {
                            setEditingId(null);
                            setDeletingId(note.id);
                            setError(null);
                          }}
                        />
                      </div>
                    </div>
                    {deletingId === note.id && (
                      <DeleteConfirm
                        message="Remove this note?"
                        onConfirm={() => handleDelete(note.id)}
                        onCancel={() => setDeletingId(null)}
                        confirming={submitting === "delete"}
                      />
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
