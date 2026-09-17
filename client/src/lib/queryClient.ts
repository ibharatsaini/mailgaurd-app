import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry auth/validation/not-found errors — retrying a 401/404
        // just burns time on a request that will never succeed.
        if (error instanceof ApiError && [400, 401, 403, 404, 409].includes(error.status)) {
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
