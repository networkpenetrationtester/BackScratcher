export interface $URLListObject {
    version: number, // can repurpose to querystring
    wayback_url: string,
    downloaded?: boolean
}

export interface $WaybackTimeMapObject {
    original: string
    mimetype: string
    timestamp: number
    endtimestamp: number
    groupcount: number
    uniqcount: number
}

export interface $WaybackSparkLineObject {
    years: { [key: string]: number[] }
    first_ts: string,
    last_ts: string,
    status: {
        [key: string]: string
    }
}

export interface $ResponseHandlerArgs {
    options?: RequestInit
    handler?: (res: Response) => any
}

export interface $WaybackCalendarCaptureByDay {
    items: [number, (string | number), number][]
}