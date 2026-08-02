import { baseApi } from "./baseApi";
import normalizeUtil from "./normalize";

// A feature api that extends baseApi with its own endpoints.
// Rename the file/export and replace the dummy endpoints with real ones.
//
// The baseApi baseQuery automatically unwraps the backend envelope
//   { success, errorDescription, errorCode, result }
// so endpoints only declare `builder.query<ReturnType, InputType>` —
// no transformResponse needed for envelope unwrapping.
//
// ═══════════════════════════════════════════════════════════════
// NORMALIZATION PATTERN — list endpoints
// ═══════════════════════════════════════════════════════════════
//
// List endpoints MUST use `transformResponse` with `normalizeUtil`.
// This stores the response as { ids, idToObject } so child components
// can select a single item from the cache via `selectFromResult`
// instead of making per-item API calls (N+1 problem).
//
// ── Endpoint ──────────────────────────────────────────────
//   getList: builder.query<
//       { ids: number[]; idToObject: Record<string, MyEntity> },
//       number
//   >({
//       query: (parentId) => `/parent/${parentId}/items`,
//       transformResponse: (response: MyEntity[]) =>
//           normalizeUtil({ targetArr: response, idAttribute: "id" }),
//       providesTags: ["MyEntity"],
//   }),
//
// ── Parent (pass only IDs, not full objects) ──────────────
//   const { data } = myApi.endpoints.getList.useQuery(parentId);
//   const ids = data?.ids ?? [];
//   <ScheduleCard scheduledCarIds={ids} scheduleId={parentId} />
//
// ── Child (select one item from cache — no extra API call) ─
//   const { data: item } = myApi.endpoints.getList.useQuery(scheduleId, {
//       skip: !scheduleId,
//       selectFromResult: (result) => ({
//           ...result,
//           data: result.data?.idToObject[String(myId)],
//       }),
//   });
//
// ── Mutations (invalidate the list tag so all children refresh) ─
//   updateItem: builder.mutation<void, { id: number }>({
//       query: ({ id, ...body }) => ({ url: `/items/${id}`, method: "PUT", body }),
//       invalidatesTags: ["MyEntity"],  // <-- triggers list refetch for all children
//   }),
//
// See SKILL.md § "Normalization Pattern" for full details.
// ═══════════════════════════════════════════════════════════════

export const exampleApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        // Dummy query — replace with a real one.
        getExample: builder.query<string, void>({
            query: () => "/example",
            providesTags: ["Example"],
        }),
        // Example mutation pattern (uncomment to use):
        // createExample: builder.mutation<void, { name: string }>({
        //     query: (body) => ({ url: "/example", method: "POST", body }),
        //     invalidatesTags: ["Example"],
        // }),
    }),
});

// Hooks are accessed via exampleApi.endpoints.* — e.g.
//   const { data } = exampleApi.endpoints.getExample.useQuery()
//   const [trigger] = exampleApi.endpoints.createExample.useMutation()
//
// Never destructure hook names from the api object:
//   ❌ export const { useGetExampleQuery } = exampleApi;
