/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: picking directory objects by id, each shown by its name: DLP
 * rule conditions and journal scopes.
 */

import { X } from 'lucide-react';
import { ObjectPicker } from '@/components/common/ObjectPicker';
import { useObjectLabel } from '@/lib/objectOptions';
import { useSchemaStore } from '@/stores/schemaStore';

function IdChip({ labelObject, id, onRemove }: { labelObject: string; id: string; onRemove: () => void }) {
  const schema = useSchemaStore((s) => s.schema);
  const { label } = useObjectLabel(labelObject, id, schema!);
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
      {label ?? id}
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/** Accounts, groups, domains or tenants, picked from the directory. */
export function IdPicker({
  objectName,
  labelObject,
  ids,
  onChange,
  placeholder,
}: {
  objectName: string;
  labelObject: string;
  ids: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}) {
  const schema = useSchemaStore((s) => s.schema);
  if (!schema) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ids.map((id) => (
        <IdChip key={id} labelObject={labelObject} id={id} onRemove={() => onChange(ids.filter((x) => x !== id))} />
      ))}
      <ObjectPicker
        schema={schema}
        objectName={objectName}
        value=""
        onChange={(id) => {
          if (id && !ids.includes(id)) onChange([...ids, id]);
        }}
        placeholder={placeholder}
      />
    </div>
  );
}
