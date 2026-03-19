import { nanoid } from 'nanoid';

export function createId(prefix) {
  return `${prefix}_${nanoid(12)}`;
}
