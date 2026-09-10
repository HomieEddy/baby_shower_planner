// PocketBase collection field definitions, derived from the domain schemas so
// the DB shape and the app shape can never drift. Server-only: it runs
// z.toJSONSchema at import, which must not reach the client bundle.

import { z } from 'zod';
import {
  AgendaTaskSchema,
  AlertSchema,
  FloorMapSchema,
  GiftSchema,
  GuestbookSchema,
  GuestSchema,
  InviteSchema,
  PhotoSchema,
  SettingsSchema,
} from '../lib/domain';

export type FieldDef = {
  name: string;
  type: string;
  required?: boolean;
  options?: Record<string, unknown>;
};

export type CollectionDef = {
  name: string;
  type: 'base';
  schema: FieldDef[];
};

// Map a domain object schema to PB field defs. Reads only the JSON-Schema shape
// (kind + enum values) — validation rules like .email()/.min() are ignored, so
// tightening a validator never reshapes the database.
//
// PB `required` is an insert-time constraint, not a read-time one. The domain
// schema marks a field non-optional when it is always present on *read*, but the
// app performs partial creates (e.g. settings), so deriving `required` from it
// would reject valid inserts. The app layer owns required-ness; PB stays
// permissive.
function fieldsFromObject(schema: z.ZodObject<z.ZodRawShape>): FieldDef[] {
  const js = z.toJSONSchema(schema, { io: 'input' }) as {
    properties?: Record<string, { type?: string; format?: string; enum?: unknown[] }>;
  };
  return Object.entries(js.properties ?? {}).map(([name, prop]) => {
    if (Array.isArray(prop.enum)) {
      return { name, type: 'select', required: false, options: { values: prop.enum.map(String) } };
    }
    switch (prop.type) {
      case 'number':
      case 'integer':
        return { name, type: 'number', required: false, options: {} };
      case 'boolean':
        return { name, type: 'bool', required: false, options: {} };
      case 'string':
        return { name, type: prop.format === 'uri' ? 'url' : 'text', required: false, options: {} };
      default:
        return { name, type: 'json', required: false, options: {} };
    }
  });
}

export const COLLECTION_SCHEMAS: Record<string, z.ZodObject<z.ZodRawShape>> = {
  guests: GuestSchema,
  invites: InviteSchema,
  guestbook: GuestbookSchema,
  settings: SettingsSchema,
  alerts: AlertSchema,
  floor_maps: FloorMapSchema,
  photos: PhotoSchema,
  gifts: GiftSchema,
  agenda_tasks: AgendaTaskSchema,
};

export const COLLECTION_DEFS: CollectionDef[] = Object.entries(COLLECTION_SCHEMAS).map(
  ([name, schema]) => ({ name, type: 'base' as const, schema: fieldsFromObject(schema) })
);

// PB >= 0.23 expects `fields` (not the legacy `schema` key) and since 0.31
// field options are flattened onto the field object (e.g. `values`, `maxSelect`).
export function toFields(schema: FieldDef[]): Record<string, unknown>[] {
  return schema.map((f) => {
    const field: Record<string, unknown> = {
      name: f.name,
      type: f.type,
      required: !!f.required,
    };
    if (f.type === 'select') {
      field.maxSelect = 1;
      field.values = f.options?.values ?? [];
    } else {
      Object.assign(field, f.options ?? {});
    }
    return field;
  });
}
