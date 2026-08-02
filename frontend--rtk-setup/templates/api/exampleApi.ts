import { baseApi } from "./baseApi";

// A feature api that extends baseApi with its own endpoints.
// Rename the file/export and replace the dummy endpoints with real ones.
//
// The baseApi baseQuery automatically unwraps the backend envelope
//   { success, errorDescription, errorCode, result }
// so endpoints only declare `builder.query<ReturnType, InputType>` —
// no transformResponse needed for envelope unwrapping.
//
// For list endpoints that should be normalized to { ids, idToObject },
// use the frontend--rtk-normalize-list skill (normalizeUtil + selectFromResult).

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
