"use client";

import { useState } from "react";
import { formatLabel } from "@/lib/program-format";
import type { ProgramResource, ProgramResourceType } from "@/lib/program-types";
import { supabase } from "@/lib/supabase";
import {
  compactButtonClass,
  compactFieldClass,
  compactLabelClass,
  DeleteConfirm,
  DeleteIconButton,
  EditIconButton,
} from "@/components/ui/InlineItemActions";

const RESOURCE_TYPE_OPTIONS: { value: ProgramResourceType; label: string }[] = [
  { value: "form", label: "Form" },
  { value: "compliance_checklist", label: "Compliance Checklist" },
  { value: "internal_note", label: "Internal Note" },
  { value: "box_link", label: "Box Link" },
  { value: "other", label: "Other" },
];

type ResourceFormState = {
  title: string;
  resource_type: ProgramResourceType;
  url: string;
  notes: string;
};

const EMPTY_FORM: ResourceFormState = {
  title: "",
  resource_type: "form",
  url: "",
  notes: "",
};

function ResourceForm({
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
  values: ResourceFormState;
  onChange: (values: ResourceFormState) => void;
  onSubmit: (event: React.FormEvent) => void;
  onCancel?: () => void;
  submitLabel: string;
  submitting: boolean;
  showCancel?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-title`} className={compactLabelClass}>
          Title
        </label>
        <input
          id={`${idPrefix}-title`}
          type="text"
          value={values.title}
          onChange={(event) =>
            onChange({ ...values, title: event.target.value })
          }
          className={compactFieldClass}
          required
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-type`} className={compactLabelClass}>
          Type
        </label>
        <select
          id={`${idPrefix}-type`}
          value={values.resource_type}
          onChange={(event) =>
            onChange({
              ...values,
              resource_type: event.target.value as ProgramResourceType,
            })
          }
          className={compactFieldClass}
        >
          {RESOURCE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-url`} className={compactLabelClass}>
          URL
        </label>
        <input
          id={`${idPrefix}-url`}
          type="url"
          value={values.url}
          onChange={(event) =>
            onChange({ ...values, url: event.target.value })
          }
          className={compactFieldClass}
          placeholder="https://"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-notes`} className={compactLabelClass}>
          Notes
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          value={values.notes}
          onChange={(event) =>
            onChange({ ...values, notes: event.target.value })
          }
          rows={2}
          className={`${compactFieldClass} resize-y`}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting || !values.title.trim()}
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

function toFormState(resource: ProgramResource): ResourceFormState {
  return {
    title: resource.title,
    resource_type: resource.resource_type,
    url: resource.url ?? "",
    notes: resource.notes ?? "",
  };
}

function toPayload(values: ResourceFormState) {
  return {
    title: values.title.trim(),
    resource_type: values.resource_type,
    url: values.url.trim() || null,
    notes: values.notes.trim() || null,
  };
}

export function ResourcesSection({
  programId,
  resources,
  onResourcesChange,
}: {
  programId: string;
  resources: ProgramResource[];
  onResourcesChange: (resources: ProgramResource[]) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<ResourceFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ResourceFormState>(EMPTY_FORM);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<
    "add" | "edit" | "delete" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(resource: ProgramResource) {
    setDeletingId(null);
    setEditingId(resource.id);
    setEditForm(toFormState(resource));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!addForm.title.trim()) {
      return;
    }

    setSubmitting("add");
    setError(null);

    const { data, error: insertError } = await supabase
      .from("program_resources")
      .insert({
        program_id: programId,
        ...toPayload(addForm),
      })
      .select("id, program_id, resource_type, title, url, notes")
      .single();

    setSubmitting(null);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    onResourcesChange([...resources, data as unknown as ProgramResource]);
    setAddForm(EMPTY_FORM);
    setShowAddForm(false);
  }

  async function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingId || !editForm.title.trim()) {
      return;
    }

    setSubmitting("edit");
    setError(null);

    const { data, error: updateError } = await supabase
      .from("program_resources")
      .update(toPayload(editForm))
      .eq("id", editingId)
      .select("id, program_id, resource_type, title, url, notes")
      .single();

    setSubmitting(null);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    const updated = data as unknown as ProgramResource;
    onResourcesChange(
      resources.map((resource) =>
        resource.id === editingId ? updated : resource
      )
    );
    cancelEdit();
  }

  async function handleDelete(resourceId: string) {
    setSubmitting("delete");
    setError(null);

    const { error: deleteError } = await supabase
      .from("program_resources")
      .delete()
      .eq("id", resourceId);

    setSubmitting(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    onResourcesChange(resources.filter((resource) => resource.id !== resourceId));
    setDeletingId(null);
    if (editingId === resourceId) {
      cancelEdit();
    }
  }

  return (
    <div>
      {resources.length === 0 && !showAddForm ? (
        <p className="text-sm text-gray-500">No documents added yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {resources.map((resource) => (
            <li key={resource.id} className="py-4 first:pt-0">
              {editingId === resource.id ? (
                <ResourceForm
                  idPrefix={`edit-resource-${resource.id}`}
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
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {resource.url ? (
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {resource.title}
                          </a>
                        ) : (
                          <p className="text-sm font-medium text-heading">
                            {resource.title}
                          </p>
                        )}
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                          {formatLabel(resource.resource_type)}
                        </span>
                      </div>
                      {resource.notes && (
                        <p className="mt-1 text-xs leading-relaxed text-gray-600">
                          {resource.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <EditIconButton
                        label="Edit document"
                        onClick={() => startEdit(resource)}
                      />
                      <DeleteIconButton
                        label="Delete document"
                        onClick={() => {
                          setEditingId(null);
                          setDeletingId(resource.id);
                          setError(null);
                        }}
                      />
                    </div>
                  </div>
                  {deletingId === resource.id && (
                    <DeleteConfirm
                      message="Remove this document?"
                      onConfirm={() => handleDelete(resource.id)}
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

      <div className="mt-4">
        {showAddForm ? (
          <ResourceForm
            idPrefix="add-resource"
            values={addForm}
            onChange={setAddForm}
            onSubmit={handleAdd}
            onCancel={() => {
              setShowAddForm(false);
              setAddForm(EMPTY_FORM);
            }}
            submitLabel="Add Document"
            submitting={submitting === "add"}
            showCancel
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowAddForm(true);
              setError(null);
            }}
            className={compactButtonClass}
          >
            Add Document
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
