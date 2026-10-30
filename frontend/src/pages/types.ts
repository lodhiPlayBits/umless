import type { Params } from '@/shared/lib/router'

/** What every page gets from the route table: the URL's :params plus the route's fixed params. */
export type PageProps = { params: Params }
