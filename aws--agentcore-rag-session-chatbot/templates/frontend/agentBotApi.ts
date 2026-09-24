import { baseApi } from "./baseApi";

export interface AgentBotCredentials {
    username: string;
    password: string;
}

interface AgentBotCredentialsResponse {
    success: boolean;
    result: AgentBotCredentials;
}

export const agentBotApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        getAgentBotCredentials: builder.query<AgentBotCredentials, void>({
            query: () => ({ url: "/api/agent-bot-credentials", method: "GET" }),
            transformResponse: (res: AgentBotCredentialsResponse) => res.result,
        }),
    }),
    overrideExisting: false,
});

export const { useGetAgentBotCredentialsQuery, useLazyGetAgentBotCredentialsQuery } = agentBotApi;
