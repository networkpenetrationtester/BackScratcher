//MISC

export interface $URLListObject {
    query: number, // can be querystring
    wayback_url: string,
    downloaded?: boolean
}

export interface $ResponseHandlerArguments {
    options?: RequestInit
    handler?: (res: Response) => any
}

// WAYBACK API

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

export interface $WaybackCalendarCaptureByDay {
    items: [number, (string | number), number][]
}

// WAYBACK DATABASE INTERFACE

export interface $WaybackDatabaseResourceObject {
    path: string,
    data: Buffer
}

export interface $WaybackDatabaseProgressObject {
    path: string,
    failure: number // 1 for failure
}

export interface $WaybackDatabaseProgressDictionary {
    [url: string]: number // 1 for failure
}

export type $WaybackDatbaseInterfaceLogger = ((message?: any, ...additionalArgs: any[]) => void);

export interface $WaybackDatbaseInterfaceArguments {
    url?: URL
    verbose?: boolean
    logger?: $WaybackDatbaseInterfaceLogger
}