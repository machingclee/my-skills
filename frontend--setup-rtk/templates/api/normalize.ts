import { normalize, schema } from "normalizr";

/**
 * Normalize an array of entities into { ids, idToObject } for use in
 * RTK Query `transformResponse`.  Every list endpoint should normalize
 * its response so individual components can select a single item from
 * the cached list via `selectFromResult` instead of making a separate
 * per-item API call (avoiding the N+1 problem).
 *
 * `idAttribute` accepts `keyof T & string` — TypeScript will error if
 * you pass a field that doesn't exist on the entity type.
 *
 * The `ids` array preserves the original ID type (e.g. number if the
 * entity's id column is numeric).  `idToObject` keys are always string
 * because JavaScript object keys are strings at runtime; lookups must
 * use `String(id)`.
 *
 * @example
 * // In the api endpoint:
 * transformResponse: (response: MyEntity[]) =>
 *     normalizeUtil({ targetArr: response, idAttribute: "id" }),
 *
 * // Parent — pass only IDs down, not full objects:
 * const { data } = myApi.endpoints.getList.useQuery(parentId);
 * const ids = data?.ids ?? [];
 * <ScheduleCard scheduledCarIds={ids} scheduleId={parentId} />
 *
 * // Child — select one item from cache (no extra API call):
 * const { data: item } = myApi.endpoints.getList.useQuery(scheduleId, {
 *     skip: !scheduleId,
 *     selectFromResult: (result) => ({
 *         ...result,
 *         data: result.data?.idToObject[String(myId)],
 *     }),
 * });
 */
export default function normalizeUtil<T>({
    targetArr,
    idAttribute,
}: {
    targetArr: T[];
    idAttribute: keyof T & string;
}) {
    const objectEntity = new schema.Entity<T>("object", undefined, {
        idAttribute,
    });
    const normalized = normalize(targetArr, [objectEntity]);
    const idToObject = (normalized.entities["object"] ?? {}) as {
        [id: string]: T;
    };
    const ids = normalized.result;
    return { ids, idToObject };
}
