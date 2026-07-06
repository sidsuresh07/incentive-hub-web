-- Optional rejection note for reviewer feedback on rejected drafts.
ALTER TABLE program_versions
  ADD COLUMN IF NOT EXISTS rejection_note TEXT;
