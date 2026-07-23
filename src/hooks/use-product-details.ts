import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProductDetails } from "@/lib/pinterest.functions";

// One product URL's CK lookup, independent of every other card's. Each card
// mounts this itself (rather than a parent doing one big useQueries) so a
// sibling card resolving never re-renders this one — the two halves of
// progressive rendering (parallel fan-out, zero cross-card re-renders) both
// fall out of just using React Query per-card instead of per-list.
//
// staleTime: Infinity + retry: false + refetchOnWindowFocus: false is
// deliberate: once CK has answered for a URL (available, unavailable, or
// errored), that answer is frozen for this session — never silently
// re-fetched, never retried automatically. A real product-details lookup
// costs a live retailer scrape; treat it like one, not a cheap GET.
export function useProductDetails(productUrl: string | null) {
  const runGetProductDetails = useServerFn(getProductDetails);
  return useQuery({
    queryKey: ["product-details", productUrl],
    // Forward React Query's AbortSignal to the server fn so cancelling this
    // query (e.g. when the attach dialog is closed) actually aborts the
    // in-flight retailer scrape instead of letting it run to completion.
    queryFn: ({ signal }) => runGetProductDetails({ data: { productUrl: productUrl! }, signal }),
    enabled: !!productUrl,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
